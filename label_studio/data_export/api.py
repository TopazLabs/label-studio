"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license.
"""
import logging
import os
import traceback as tb
from datetime import datetime
from urllib.parse import urlparse
import json
from core.feature_flags import flag_set
from core.permissions import all_permissions
from core.redis import start_job_async_or_sync
from core.utils.common import batch
from django.conf import settings
from django.core.files import File
from django.core.files.storage import FileSystemStorage
from django.db import transaction
from django.http import FileResponse, HttpResponse
from django.utils.decorators import method_decorator
from drf_yasg import openapi as openapi
from drf_yasg.utils import swagger_auto_schema
from projects.models import Project
from ranged_fileresponse import RangedFileResponse
from rest_framework import generics, status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from tasks.models import Task

# Data Visualization
from io import BytesIO
import pandas as pd
import pandasql as psql
import matplotlib
matplotlib.use('Agg')  # Use the 'Agg' backend, which doesn't require a GUI
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

import math



from .models import ConvertedFormat, DataExport, Export
from .serializers import (
    ExportConvertSerializer,
    ExportCreateSerializer,
    ExportDataSerializer,
    ExportParamSerializer,
    ExportSerializer,
    VisualizationParamSerializer,
)

logger = logging.getLogger(__name__)


@method_decorator(
    name='get',
    decorator=swagger_auto_schema(
        tags=['Export'],
        operation_summary='Get export formats',
        x_fern_sdk_group_name=['projects', 'exports'],
        x_fern_sdk_method_name='list_formats',
        x_fern_audiences=['public'],
        operation_description='Retrieve the available export formats for the current project by ID.',
        manual_parameters=[
            openapi.Parameter(
                name='id',
                type=openapi.TYPE_INTEGER,
                in_=openapi.IN_PATH,
                description='A unique integer value identifying this project.',
            ),
        ],
        responses={
            200: openapi.Response(
                description='Export formats',
                schema=openapi.Schema(
                    title='Format list',
                    description='List of available formats',
                    type=openapi.TYPE_ARRAY,
                    items=openapi.Schema(title='Export format', type=openapi.TYPE_STRING),
                ),
            )
        },
    ),
)
class ExportFormatsListAPI(generics.RetrieveAPIView):
    permission_required = all_permissions.projects_view

    def get_queryset(self):
        return Project.objects.filter(organization=self.request.user.active_organization)

    def get(self, request, *args, **kwargs):
        project = self.get_object()
        formats = DataExport.get_export_formats(project)
        return Response(formats)


@method_decorator(
    name='get',
    decorator=swagger_auto_schema(
        x_fern_sdk_group_name='projects',
        x_fern_sdk_method_name='create_export',
        x_fern_audiences=['public'],
        manual_parameters=[
            openapi.Parameter(
                name='export_type',
                type=openapi.TYPE_STRING,
                in_=openapi.IN_QUERY,
                description='Selected export format (JSON by default)',
            ),
            openapi.Parameter(
                name='download_all_tasks',
                type=openapi.TYPE_STRING,
                in_=openapi.IN_QUERY,
                description="""
                          If true, download all tasks regardless of status. If false, download only annotated tasks.
                          """,
            ),
            openapi.Parameter(
                name='download_resources',
                type=openapi.TYPE_BOOLEAN,
                in_=openapi.IN_QUERY,
                description="""
                          If true, download all resource files such as images, audio, and others relevant to the tasks.
                          """,
            ),
            openapi.Parameter(
                name='ids',
                type=openapi.TYPE_ARRAY,
                items=openapi.Schema(title='Task ID', description='Individual task ID', type=openapi.TYPE_INTEGER),
                in_=openapi.IN_QUERY,
                description="""
                          Specify a list of task IDs to retrieve only the details for those tasks.
                          """,
            ),
            openapi.Parameter(
                name='id',
                type=openapi.TYPE_INTEGER,
                in_=openapi.IN_PATH,
                description='A unique integer value identifying this project.',
            ),
        ],
        tags=['Export'],
        operation_summary='Easy export of tasks and annotations',
        operation_description="""
        <i>Note: if you have a large project it's recommended to use
        export snapshots, this easy export endpoint might have timeouts.</i><br/><br>
        Export annotated tasks as a file in a specific format.
        For example, to export JSON annotations for a project to a file called `annotations.json`,
        run the following from the command line:
        ```bash
        curl -X GET {}/api/projects/{{id}}/export?exportType=JSON -H \'Authorization: Token abc123\' --output 'annotations.json'
        ```
        To export all tasks, including skipped tasks and others without annotations, run the following from the command line:
        ```bash
        curl -X GET {}/api/projects/{{id}}/export?exportType=JSON&download_all_tasks=true -H \'Authorization: Token abc123\' --output 'annotations.json'
        ```
        To export specific tasks with IDs of 123 and 345, run the following from the command line:
        ```bash
        curl -X GET {}/api/projects/{{id}}/export?ids[]=123\&ids[]=345 -H \'Authorization: Token abc123\' --output 'annotations.json'
        ```
        """.format(
            settings.HOSTNAME or 'https://localhost:8080',
            settings.HOSTNAME or 'https://localhost:8080',
            settings.HOSTNAME or 'https://localhost:8080',
        ),
        responses={
            200: openapi.Response(
                description='Exported data',
                schema=openapi.Schema(
                    title='Export file', description='Export file with results', type=openapi.TYPE_FILE
                ),
            )
        },
    ),
)
class ExportAPI(generics.RetrieveAPIView):
    permission_required = all_permissions.projects_change

    def get_queryset(self):
        return Project.objects.filter(organization=self.request.user.active_organization)

    def get_task_queryset(self, queryset):
        return queryset.select_related('project').prefetch_related('annotations', 'predictions')

    def get(self, request, *args, **kwargs):
        project = self.get_object()
        query_serializer = ExportParamSerializer(data=request.GET)
        query_serializer.is_valid(raise_exception=True)

        export_type = (
            query_serializer.validated_data.get('exportType') or query_serializer.validated_data['export_type']
        )
        only_finished = not query_serializer.validated_data['download_all_tasks']
        download_resources = query_serializer.validated_data['download_resources']
        interpolate_key_frames = query_serializer.validated_data['interpolate_key_frames']

        tasks_ids = request.GET.getlist('ids[]')

        logger.debug('Get tasks')
        query = Task.objects.filter(project=project)
        if tasks_ids and len(tasks_ids) > 0:
            logger.debug(f'Select only subset of {len(tasks_ids)} tasks')
            query = query.filter(id__in=tasks_ids)
        if only_finished:
            query = query.filter(annotations__isnull=False).distinct()

        task_ids = query.values_list('id', flat=True)

        logger.debug('Serialize tasks for export')
        tasks = []
        for _task_ids in batch(task_ids, 1000):
            tasks += ExportDataSerializer(
                self.get_task_queryset(query.filter(id__in=_task_ids)),
                many=True,
                expand=['drafts'],
                context={'interpolate_key_frames': interpolate_key_frames},
            ).data
        logger.debug('Prepare export files')

        export_file, content_type, filename = DataExport.generate_export_file(
            project, tasks, export_type, download_resources, request.GET
        )

        r = FileResponse(export_file, as_attachment=True, content_type=content_type, filename=filename)
        r['filename'] = filename
        return r

@method_decorator(
    name='get',
    decorator=swagger_auto_schema(
        tags=['Export'],
        operation_summary='List exported files',
        operation_description="""
        Retrieve a list of files exported from the Label Studio UI using the Export button on the Data Manager page.
        To retrieve the files themselves, see [Download export file](/api#operation/api_projects_exports_download_read).
        """,
    ),
)
class ProjectExportFiles(generics.RetrieveAPIView):
    permission_required = all_permissions.projects_change
    swagger_schema = None  # hide export files endpoint from swagger

    def get_queryset(self):
        return Project.objects.filter(organization=self.request.user.active_organization)

    def get(self, request, *args, **kwargs):
        # project permission check
        self.get_object()

        paths = []
        for name in os.listdir(settings.EXPORT_DIR):
            if name.endswith('.json') and not name.endswith('-info.json'):
                project_id = name.split('-')[0]
                if str(kwargs['pk']) == project_id:
                    paths.append(settings.EXPORT_URL_ROOT + name)

        items = [{'name': p.split('/')[2].split('.')[0], 'url': p} for p in sorted(paths)[::-1]]
        return Response({'export_files': items}, status=status.HTTP_200_OK)


class ProjectExportFilesAuthCheck(APIView):
    """Check auth for nginx auth_request (/api/auth/export/)"""

    swagger_schema = None
    http_method_names = ['get']
    permission_required = all_permissions.projects_change

    def get(self, request, *args, **kwargs):
        """Get export files list"""
        original_url = request.META['HTTP_X_ORIGINAL_URI']
        filename = original_url.replace('/export/', '')
        project_id = filename.split('-')[0]
        try:
            pk = int(project_id)
        except ValueError:
            return Response({'detail': 'Incorrect filename in export'}, status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        generics.get_object_or_404(Project.objects.filter(organization=self.request.user.active_organization), pk=pk)
        return Response({'detail': 'auth ok'}, status=status.HTTP_200_OK)


@method_decorator(
    name='get',
    decorator=swagger_auto_schema(
        tags=['Export'],
        x_fern_sdk_group_name=['projects', 'exports'],
        x_fern_sdk_method_name='list',
        x_fern_audiences=['public'],
        operation_summary='List all export snapshots',
        operation_description="""
        Returns a list of exported files for a specific project by ID.
        """,
        manual_parameters=[
            openapi.Parameter(
                name='id',
                type=openapi.TYPE_INTEGER,
                in_=openapi.IN_PATH,
                description='A unique integer value identifying this project.',
            )
        ],
    ),
)
@method_decorator(
    name='post',
    decorator=swagger_auto_schema(
        tags=['Export'],
        operation_summary='Create new export snapshot',
        x_fern_sdk_group_name=['projects', 'exports'],
        x_fern_sdk_method_name='create',
        x_fern_audiences=['public'],
        operation_description="""
        Create a new export request to start a background task and generate an export file for a specific project by ID.
        """,
        manual_parameters=[
            openapi.Parameter(
                name='id',
                type=openapi.TYPE_INTEGER,
                in_=openapi.IN_PATH,
                description='A unique integer value identifying this project.',
            )
        ],
    ),
)
class ExportListAPI(generics.ListCreateAPIView):
    queryset = Export.objects.all().order_by('-created_at')
    project_model = Project
    serializer_class = ExportSerializer
    permission_required = all_permissions.projects_change

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return ExportSerializer
        if self.request.method == 'POST':
            return ExportCreateSerializer
        return super().get_serializer_class()

    def get_serializer_context(self):
        context = super(ExportListAPI, self).get_serializer_context()
        context['user'] = self.request.user
        return context

    def _get_project(self):
        project_pk = self.kwargs.get('pk')
        project = generics.get_object_or_404(
            self.project_model.objects.for_user(self.request.user),
            pk=project_pk,
        )
        return project

    def perform_create(self, serializer):
        task_filter_options = serializer.validated_data.pop('task_filter_options')
        annotation_filter_options = serializer.validated_data.pop('annotation_filter_options')
        serialization_options = serializer.validated_data.pop('serialization_options')

        project = self._get_project()
        serializer.save(project=project, created_by=self.request.user)
        instance = serializer.instance

        instance.run_file_exporting(
            task_filter_options=task_filter_options,
            annotation_filter_options=annotation_filter_options,
            serialization_options=serialization_options,
        )

    def get_queryset(self):
        project = self._get_project()
        return super().get_queryset().filter(project=project)

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)

        if flag_set('fflag_fix_back_lsdv_4929_limit_exports_10042023_short', user='auto'):
            return queryset.order_by('-created_at')[:100]
        else:
            return queryset


@method_decorator(
    name='get',
    decorator=swagger_auto_schema(
        tags=['Export'],
        x_fern_sdk_group_name=['projects', 'exports'],
        x_fern_sdk_method_name='get',
        x_fern_audiences=['public'],
        operation_summary='Get export snapshot by ID',
        operation_description="""
        Retrieve information about an export file by export ID for a specific project.
        """,
        manual_parameters=[
            openapi.Parameter(
                name='id',
                type=openapi.TYPE_INTEGER,
                in_=openapi.IN_PATH,
                description='A unique integer value identifying this project.',
            ),
            openapi.Parameter(
                name='export_pk',
                type=openapi.TYPE_STRING,
                in_=openapi.IN_PATH,
                description='Primary key identifying the export file.',
            ),
        ],
    ),
)
@method_decorator(
    name='delete',
    decorator=swagger_auto_schema(
        tags=['Export'],
        x_fern_sdk_group_name=['projects', 'exports'],
        x_fern_sdk_method_name='delete',
        x_fern_audiences=['public'],
        operation_summary='Delete export snapshot',
        operation_description="""
        Delete an export file by specified export ID.
        """,
        manual_parameters=[
            openapi.Parameter(
                name='id',
                type=openapi.TYPE_INTEGER,
                in_=openapi.IN_PATH,
                description='A unique integer value identifying this project.',
            ),
            openapi.Parameter(
                name='export_pk',
                type=openapi.TYPE_STRING,
                in_=openapi.IN_PATH,
                description='Primary key identifying the export file.',
            ),
        ],
    ),
)
class ExportDetailAPI(generics.RetrieveDestroyAPIView):
    queryset = Export.objects.all()
    project_model = Project
    serializer_class = ExportSerializer
    lookup_url_kwarg = 'export_pk'
    permission_required = all_permissions.projects_change

    def delete(self, *args, **kwargs):
        if flag_set('ff_back_dev_4664_remove_storage_file_on_export_delete_29032023_short'):
            try:
                export = self.get_object()
                export.file.delete()

                for converted_format in export.converted_formats.all():
                    if converted_format.file:
                        converted_format.file.delete()
            except Exception as e:
                return Response(
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    data={
                        'detail': 'Could not delete file from storage. Check that your user has permissions to delete files: %s'
                        % str(e)
                    },
                )

        return super().delete(*args, **kwargs)

    def _get_project(self):
        project_pk = self.kwargs.get('pk')
        project = generics.get_object_or_404(
            self.project_model.objects.for_user(self.request.user),
            pk=project_pk,
        )
        return project

    def get_queryset(self):
        project = self._get_project()
        return super().get_queryset().filter(project=project)


@method_decorator(
    name='get',
    decorator=swagger_auto_schema(
        tags=['Export'],
        x_fern_sdk_group_name=['projects', 'exports'],
        x_fern_sdk_method_name='download',
        x_fern_audiences=['public'],
        operation_summary='Download export snapshot as file in specified format',
        operation_description="""
        Download an export file in the specified format for a specific project. Specify the project ID with the `id`
        parameter in the path and the ID of the export file you want to download using the `export_pk` parameter
        in the path.

        Get the `export_pk` from the response of the request to [Create new export](/api#operation/api_projects_exports_create)
        or after [listing export files](/api#operation/api_projects_exports_list).
        """,
        manual_parameters=[
            openapi.Parameter(
                name='exportType',
                type=openapi.TYPE_STRING,
                in_=openapi.IN_QUERY,
                description='Selected export format',
            ),
            openapi.Parameter(
                name='id',
                type=openapi.TYPE_INTEGER,
                in_=openapi.IN_PATH,
                description='A unique integer value identifying this project.',
            ),
            openapi.Parameter(
                name='export_pk',
                type=openapi.TYPE_STRING,
                in_=openapi.IN_PATH,
                description='Primary key identifying the export file.',
            ),
        ],
    ),
)
class ExportDownloadAPI(generics.RetrieveAPIView):
    queryset = Export.objects.all()
    project_model = Project
    serializer_class = None
    lookup_url_kwarg = 'export_pk'
    permission_required = all_permissions.projects_change

    def _get_project(self):
        project_pk = self.kwargs.get('pk')
        project = generics.get_object_or_404(
            self.project_model.objects.for_user(self.request.user),
            pk=project_pk,
        )
        return project

    def get_queryset(self):
        project = self._get_project()
        return super().get_queryset().filter(project=project)

    def get(self, request, *args, **kwargs):
        snapshot = self.get_object()
        export_type = request.GET.get('exportType')

        if snapshot.status != Export.Status.COMPLETED:
            return HttpResponse('Export is not completed', status=404)

        if flag_set('fflag_fix_all_lsdv_4813_async_export_conversion_22032023_short', request.user):
            file = snapshot.file
            if export_type is not None and export_type != 'JSON':
                converted_file = snapshot.converted_formats.filter(export_type=export_type).first()
                if converted_file is None:
                    raise NotFound(f'{export_type} format is not converted yet')
                file = converted_file.file

            if isinstance(file.storage, FileSystemStorage):
                url = file.storage.url(file.name)
            else:
                url = file.storage.url(file.name, storage_url=True)
            protocol = urlparse(url).scheme

            # NGINX downloads are a solid way to make uwsgi workers free
            if settings.USE_NGINX_FOR_EXPORT_DOWNLOADS:
                # let NGINX handle it
                response = HttpResponse()
                # below header tells NGINX to catch it and serve, see docker-config/nginx-app.conf
                redirect = '/file_download/' + protocol + '/' + url.replace(protocol + '://', '')
                response['X-Accel-Redirect'] = redirect
                response['Content-Disposition'] = 'attachment; filename="{}"'.format(file.name)
                response['filename'] = os.path.basename(file.name)
                return response

            # No NGINX: standard way for export downloads in the community edition
            else:
                ext = file.name.split('.')[-1]
                response = RangedFileResponse(request, file, content_type=f'application/{ext}')
                response['Content-Disposition'] = f'attachment; filename="{file.name}"'
                response['filename'] = os.path.basename(file.name)
                return response
        else:
            if export_type is None:
                file_ = snapshot.file
            else:
                file_ = snapshot.convert_file(export_type)

            if file_ is None:
                return HttpResponse("Can't get file", status=404)

            ext = file_.name.split('.')[-1]

            response = RangedFileResponse(request, file_, content_type=f'application/{ext}')
            response['Content-Disposition'] = f'attachment; filename="{file_.name}"'
            response['filename'] = file_.name
            return response


def async_convert(converted_format_id, export_type, project, **kwargs):
    with transaction.atomic():
        try:
            converted_format = ConvertedFormat.objects.get(id=converted_format_id)
        except ConvertedFormat.DoesNotExist:
            logger.error(f'ConvertedFormat with id {converted_format_id} not found, conversion failed')
            return
        if converted_format.status != ConvertedFormat.Status.CREATED:
            logger.error(f'Conversion for export id {converted_format.export.id} to {export_type} already started')
            return
        converted_format.status = ConvertedFormat.Status.IN_PROGRESS
        converted_format.save(update_fields=['status'])

    snapshot = converted_format.export
    converted_file = snapshot.convert_file(export_type)
    if converted_file is None:
        raise ValidationError('No converted file found, probably there are no annotations in the export snapshot')
    md5 = Export.eval_md5(converted_file)
    ext = converted_file.name.split('.')[-1]

    now = datetime.now()
    file_name = f'project-{project.id}-at-{now.strftime("%Y-%m-%d-%H-%M")}-{md5[0:8]}.{ext}'
    file_path = f'{project.id}/{file_name}'  # finally file will be in settings.DELAYED_EXPORT_DIR/project.id/file_name
    file_ = File(converted_file, name=file_path)
    converted_format.file.save(file_path, file_)
    converted_format.status = ConvertedFormat.Status.COMPLETED
    converted_format.save(update_fields=['file', 'status'])


def set_convert_background_failure(job, connection, type, value, traceback_obj):
    from data_export.models import ConvertedFormat

    convert_id = job.args[0]
    trace = tb.format_exception(type, value, traceback_obj)
    ConvertedFormat.objects.filter(id=convert_id).update(status=Export.Status.FAILED, traceback=''.join(trace))


@method_decorator(name='get', decorator=swagger_auto_schema(auto_schema=None))
@method_decorator(
    name='post',
    decorator=swagger_auto_schema(
        tags=['Export'],
        x_fern_sdk_group_name=['projects', 'exports'],
        x_fern_sdk_method_name='convert',
        x_fern_audiences=['public'],
        operation_summary='Export conversion',
        operation_description="""
        Convert export snapshot to selected format
        """,
        request_body=ExportConvertSerializer,
        manual_parameters=[
            openapi.Parameter(
                name='id',
                type=openapi.TYPE_INTEGER,
                in_=openapi.IN_PATH,
                description='A unique integer value identifying this project.',
            ),
            openapi.Parameter(
                name='export_pk',
                type=openapi.TYPE_STRING,
                in_=openapi.IN_PATH,
                description='Primary key identifying the export file.',
            ),
        ],
    ),
)
class ExportConvertAPI(generics.RetrieveAPIView):
    queryset = Export.objects.all()
    lookup_url_kwarg = 'export_pk'
    permission_required = all_permissions.projects_change

    def post(self, request, *args, **kwargs):
        snapshot = self.get_object()
        serializer = ExportConvertSerializer(data=request.data, context={'project': snapshot.project})
        serializer.is_valid(raise_exception=True)
        export_type = serializer.validated_data['export_type']

        with transaction.atomic():
            converted_format, created = ConvertedFormat.objects.get_or_create(export=snapshot, export_type=export_type)

            if not created:
                raise ValidationError(f'Conversion to {export_type} already started')

        start_job_async_or_sync(
            async_convert,
            converted_format.id,
            export_type,
            snapshot.project,
            on_failure=set_convert_background_failure,
        )
        return Response({'export_type': export_type, 'converted_format': converted_format.id})

def execute_sql_query(df: pd.DataFrame, query: str) -> pd.DataFrame:
    """
    Execute an SQL query on a pandas DataFrame and return the result as a DataFrame.

    Args:
        df (pd.DataFrame): The DataFrame to query.
        query (str): The SQL query to execute.

    Returns:
        pd.DataFrame: The result of the query.
    """
    df = pd.DataFrame(df)
    for column in df.columns:
        if df[column].apply(type).nunique() > 1 or df[column].dtype == 'object':
            # Check if the column contains unsupported types (e.g., lists, dicts)
            df[column] =  df[column].apply(lambda x: x if not isinstance(x, (list, dict)) else json.dumps(x))
    
    # Create a temporary CSV file
    if os.environ.get("TOPAZ_DEBUG_MODE") == "true":
        temp_csv_path = '/tmp/df_query_data.csv'
        df.to_csv(temp_csv_path, index=False)
    result_df = psql.sqldf(query, locals())
    
    # Post-processing step to rename columns to X, Y, and Z if not present
    if 'X' not in result_df.columns or 'Y' not in result_df.columns:
        num_columns = len(result_df.columns)
        if num_columns >= 1:
            result_df = result_df.rename(columns={result_df.columns[0]: 'X'})
        if num_columns >= 2:
            result_df = result_df.rename(columns={result_df.columns[1]: 'Y'})
        if num_columns >= 3:
            result_df = result_df.rename(columns={result_df.columns[2]: 'Z'})
            
    return result_df

def get_project_dataframe(project_id, only_finished=True, ignore_keys=None):
    project = Project.objects.get(id=project_id)
    query = Task.objects.filter(project=project)
    if only_finished:
        query = query.filter(annotations__isnull=False).distinct()

    tasks = serialize_tasks(query)
    df = pd.DataFrame(tasks)

    # Save initial DataFrame to file for debugging
    
    if os.environ.get("TOPAZ_DEBUG_MODE") == "true":
        df.to_csv('/tmp/initial_dataframe.csv', index=False)

    if 'data' in df.columns:
        data_df = pd.json_normalize(df['data'].apply(lambda x: {k: v for k, v in x.items() if k != 'id'}))
        df = pd.concat([df.drop(columns=['data']), data_df], axis=1)

        # Save DataFrame after normalizing 'data' for debugging
        
        if os.environ.get("TOPAZ_DEBUG_MODE") == "true":
            df.to_csv('/tmp/after_normalizing_data.csv', index=False)

    if 'annotations' in df.columns:
        def extract_annotation(annotation):
            if 'value' in annotation and 'choices' in annotation['value']:
                return annotation['value']['choices'][0]
            return None

        def extract_annotation_columns(annotations_column_data):
            if annotations_column_data and isinstance(annotations_column_data, list) and len(annotations_column_data) > 0:
                first_annotation = annotations_column_data[0]
                if isinstance(first_annotation, list):
                    keys = [annotation["from_name"] for annotation in first_annotation if "from_name" in annotation]
                    values = [extract_annotation(annotation) for annotation in first_annotation]
                    return dict(zip(keys, values))
            return {}

        annotation_data = df['annotations'].apply(extract_annotation_columns)
        for key in set().union(*annotation_data.apply(lambda x: x.keys())):
            df[key] = annotation_data.apply(lambda x: x.get(key))
        
        df = df.drop(columns=['annotations'])

        # Save DataFrame after extracting annotations for debugging
        
        if os.environ.get("TOPAZ_DEBUG_MODE") == "true":
            df.to_csv('/tmp/after_extracting_annotations.csv', index=False)

    # Handle NaN and infinite values
    df = df.fillna(0)  # Replace NaN with 0 or any other value you find appropriate
    df = df.replace([float('inf'), float('-inf')], 0)  # Replace infinite values with 0 or any other value

    # Save DataFrame after handling NaN and infinite values for debugging
    
    if os.environ.get("TOPAZ_DEBUG_MODE") == "true":
        df.to_csv('/tmp/after_handling_nan_inf.csv', index=False)

    # Drop columns specified in ignore_keys
    if ignore_keys:
        df = df.drop(columns=ignore_keys, errors='ignore')

    # Save DataFrame after dropping ignored keys for debugging
    if os.environ.get("TOPAZ_DEBUG_MODE") == "true":
        df.to_csv('/tmp/after_dropping_ignore_keys.csv', index=False)

    return df

def serialize_tasks(queryset):
    tasks = []
    for task in queryset:
        task_data = {
            'id': task.id,
            'data': task.data,
            'annotations': [ann.result for ann in task.annotations.all()],
            'predictions': [pred.result for pred in task.predictions.all()],
        }
        tasks.append(task_data)
    return tasks

class VisualizationAPI(APIView):
    permission_required = all_permissions.projects_view
    
    def get(self, request, *args, **kwargs):
        project_id = self.kwargs.get('pk')
        include_all_tasks = True
        ignore_keys = []

        df = get_project_dataframe(project_id, only_finished=False, ignore_keys=ignore_keys)
        
        num_rows = len(df)
        threshold = num_rows // 2
        min_occurrences = int(0.01 * num_rows)  # Ensure at least 1
        
        categorical_columns = []
        
        for column in [col for col in df.columns if col not in ignore_keys and "model_enh" not in col and "modelName" not in col]:
            try:
                unique_values = df[column].nunique()
                
                if unique_values < threshold:
                    value_counts = df[column].value_counts()
                    
                    # Check if each value occurs at least min_occurrences times
                    if all(count >= min_occurrences for count in value_counts):
                        categorical_columns.append(column)
            except TypeError:
                # Skip columns that can't be hashed (e.g., lists)
                continue
        response_data = {
            'categorical_columns': categorical_columns
        }
        
        return Response(response_data)

    def post(self, request, *args, **kwargs):
        try:
            project_id = self.kwargs.get('pk')
            include_all_tasks = request.GET.get('include_all_tasks', False) == "true"
            ignore_keys = request.GET.get('ignore_keys', "").split(',')
            only_finished = not include_all_tasks

            sql_query = request.data.get('sql_query')
            if not sql_query:
                with open('/tmp/debug__json_req.json', 'w') as f:
                    json.dump(request.data, f, indent=2)
                return Response({'error': 'No SQL query provided'}, status=400)

            df = get_project_dataframe(project_id, only_finished, ignore_keys)

            # Execute the SQL query
            result_df = execute_sql_query(df, sql_query)

            # Save the result DataFrame after executing the SQL query for debugging
            if os.environ.get("TOPAZ_DEBUG_MODE") == "true":
                result_df.to_csv('/tmp/result_dataframe.csv', index=False)

            merged_df = result_df

            data = {
                'data': merged_df.to_dict(orient='records'),
            }

            return Response(data)
        except Exception as e:
            import traceback
            error_info = traceback.format_exc()
            logging.error(f"Error in VisualizationAPI: {str(e)}\nStack trace:\n{error_info}")
            return Response({'error': str(e)}, status=500)

def categorical_discrete_visualization(df: pd.DataFrame, column_key: str, category: str = "all"):
    """
    Generate a categorical discrete visualization saved as a PDF.

    - If `category` is 'all', a single bar chart is saved to the PDF.
    - If `category` is specified, a bar chart is generated for each unique value of `category`,
      each saved as a separate page in the PDF.
    """
    if column_key not in df.columns:
        raise ValueError(f"Column '{column_key}' not found in DataFrame")

    if category != 'all' and category not in df.columns:
        raise ValueError(f"Category '{category}' not found in DataFrame")

    # Create a BytesIO buffer to save the PDF
    pdf_buffer = BytesIO()

    with PdfPages(pdf_buffer) as pdf:
        if category == 'all':
            counts = df[column_key].value_counts()
            probabilities = counts / counts.sum()
            fig, ax = plt.subplots()
            ax.pie(probabilities.values, labels=probabilities.index, autopct='%1.1f%%')
            ax.set_title(f"Distribution of {column_key}")
            pdf.savefig(fig)
            plt.close(fig)
        else:
            unique_categories = df[category].unique()
            for cat in unique_categories:
                sub_df = df[df[category] == cat]
                counts = sub_df[column_key].value_counts()
                probabilities = counts / counts.sum()  # Convert counts to probabilities
                fig, ax = plt.subplots()
                ax.pie(probabilities.values, labels=probabilities.index, autopct='%1.1f%%')
                ax.set_title(f"Distribution of {column_key} for {category} = {cat}")
                pdf.savefig(fig)
                plt.close(fig)

    pdf_buffer.seek(0)
    return pdf_buffer

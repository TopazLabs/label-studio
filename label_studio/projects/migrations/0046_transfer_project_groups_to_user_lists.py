from django.db import migrations
from django.conf import settings

def transfer_project_groups(apps, schema_editor):
    ProjectGroup = apps.get_model('projects', 'ProjectGroup')
    ProjectGroupList = apps.get_model('projects', 'ProjectGroupList')
    User = apps.get_model(settings.AUTH_USER_MODEL)

    # Get all existing project groups
    groups = ProjectGroup.objects.all().order_by('id')

    # For each user, create ProjectGroupList entries
    for user in User.objects.all():
        prev_node = None
        for group in groups:
            node = ProjectGroupList.objects.create(user=user, group=group, prev_group=prev_node)
            if prev_node:
                prev_node.next_group = node
                prev_node.save()
            prev_node = node

def reverse_transfer(apps, schema_editor):
    ProjectGroupList = apps.get_model('projects', 'ProjectGroupList')
    ProjectGroupList.objects.all().delete()
class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0045_remove_projectgroup_next_group_and_more'),
    ]

    operations = [
        migrations.RunPython(transfer_project_groups, reverse_transfer),
    ]
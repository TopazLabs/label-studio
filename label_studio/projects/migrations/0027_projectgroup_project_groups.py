# Generated by Django 4.2.15 on 2024-10-01 15:55

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('projects', '0026_auto_20231103_0020'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProjectGroup',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(help_text='Name of the project group', max_length=255, unique=True)),
                ('added_by', models.EmailField(blank=True, help_text='Email of the user who added the group', max_length=254, null=True)),
            ],
        ),
        migrations.AddField(
            model_name='project',
            name='groups',
            field=models.ManyToManyField(blank=True, help_text='Groups this project belongs to', related_name='projects', to='projects.projectgroup'),
        ),
    ]

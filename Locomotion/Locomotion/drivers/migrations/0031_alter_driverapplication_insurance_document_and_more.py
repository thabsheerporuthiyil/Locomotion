import drivers.models
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("drivers", "0030_alter_driverapplication_id_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="driverapplication",
            name="insurance_document",
            field=models.FileField(
                blank=True,
                null=True,
                upload_to=drivers.models.driver_application_insurance_upload_to,
            ),
        ),
        migrations.AlterField(
            model_name="driverapplication",
            name="license_document",
            field=models.FileField(
                upload_to=drivers.models.driver_application_license_upload_to
            ),
        ),
        migrations.AlterField(
            model_name="driverapplication",
            name="profile_image",
            field=models.ImageField(
                upload_to=drivers.models.driver_application_profile_upload_to
            ),
        ),
        migrations.AlterField(
            model_name="driverapplication",
            name="rc_document",
            field=models.FileField(
                blank=True,
                null=True,
                upload_to=drivers.models.driver_application_rc_upload_to,
            ),
        ),
        migrations.AlterField(
            model_name="driverapplication",
            name="vehicle_image",
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to=drivers.models.driver_application_vehicle_image_upload_to,
            ),
        ),
        migrations.AlterField(
            model_name="driverprofile",
            name="profile_image",
            field=models.ImageField(
                blank=True,
                null=True,
                upload_to=drivers.models.driver_profile_image_upload_to,
            ),
        ),
        migrations.AlterField(
            model_name="drivervehicle",
            name="insurance_document",
            field=models.FileField(
                upload_to=drivers.models.driver_vehicle_insurance_upload_to
            ),
        ),
        migrations.AlterField(
            model_name="drivervehicle",
            name="rc_document",
            field=models.FileField(upload_to=drivers.models.driver_vehicle_rc_upload_to),
        ),
        migrations.AlterField(
            model_name="drivervehicle",
            name="vehicle_image",
            field=models.ImageField(
                upload_to=drivers.models.driver_vehicle_image_upload_to
            ),
        ),
    ]

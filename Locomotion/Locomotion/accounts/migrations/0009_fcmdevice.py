from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0008_user_fcm_device_token"),
    ]

    operations = [
        migrations.CreateModel(
            name="FCMDevice",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("token", models.CharField(max_length=255, unique=True)),
                ("platform", models.CharField(choices=[("web", "Web"), ("android", "Android"), ("ios", "iOS"), ("unknown", "Unknown")], default="unknown", max_length=20)),
                ("user_agent", models.TextField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("last_seen_at", models.DateTimeField(auto_now=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="fcm_devices", to="accounts.user")),
            ],
        ),
    ]


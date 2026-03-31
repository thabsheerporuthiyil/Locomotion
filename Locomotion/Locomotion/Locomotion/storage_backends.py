from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage


class MediaStorage(S3Boto3Storage):
    location = "media"
    default_acl = None
    file_overwrite = False
    querystring_auth = True
    querystring_expire = getattr(settings, "AWS_MEDIA_URL_EXPIRE_SECONDS", 3600)
    custom_domain = (
        getattr(settings, "AWS_S3_CUSTOM_DOMAIN", None)
        or (
            f"{settings.AWS_STORAGE_BUCKET_NAME}.s3.{settings.AWS_S3_REGION_NAME}.amazonaws.com"
            if getattr(settings, "AWS_STORAGE_BUCKET_NAME", None)
            and getattr(settings, "AWS_S3_REGION_NAME", None)
            else None
        )
    )

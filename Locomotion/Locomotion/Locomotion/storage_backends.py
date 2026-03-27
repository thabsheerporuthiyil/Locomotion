from django.conf import settings
from storages.backends.s3boto3 import S3Boto3Storage


class MediaStorage(S3Boto3Storage):
    location = "media"
    default_acl = None
    file_overwrite = False
    querystring_auth = True
    querystring_expire = getattr(settings, "AWS_MEDIA_URL_EXPIRE_SECONDS", 3600)
    custom_domain = None

"""
Django settings for Locomotion project.
"""

import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


def _split_env(value, default=None):
    raw = os.environ.get(value)
    if raw is None:
        return list(default or [])
    return [item.strip() for item in raw.split(",") if item.strip()]


def _env_bool(name, default=False):
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name, default):
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError as exc:
        raise ImproperlyConfigured(f"{name} must be an integer.") from exc

# AI microservice (FastAPI) base URL. In docker-compose the service name is `fastapi-ai`.
AI_SERVICE_URL = os.environ.get("AI_SERVICE_URL", "http://fastapi-ai:8000")


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/6.0/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")

DJANGO_ENV = os.environ.get("DJANGO_ENV", "development").strip().lower()
if DJANGO_ENV not in {"development", "staging", "production"}:
    raise ImproperlyConfigured(
        "DJANGO_ENV must be one of: development, staging, production."
    )

IS_DEVELOPMENT = DJANGO_ENV == "development"

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = _env_bool("DEBUG", IS_DEVELOPMENT)
IS_PRODUCTION = DJANGO_ENV in {"production", "staging"} and not DEBUG

ALLOWED_HOSTS = _split_env(
    "ALLOWED_HOSTS",
    ["localhost", "127.0.0.1"] if IS_DEVELOPMENT else [],
)

if not SECRET_KEY:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY is required.")


if IS_PRODUCTION and not ALLOWED_HOSTS:
    raise ImproperlyConfigured("ALLOWED_HOSTS must be set in production.")

AUTH_USER_MODEL = "accounts.User"

# Application definition

INSTALLED_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "channels",
    "corsheaders",
    "rest_framework",
    "drf_yasg",
    "accounts",
    "drivers",
    "vehicles",
    "location",
    "bookings",
    "payments",
    "django_celery_beat",
    "storages",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

CORS_ALLOW_ALL_ORIGINS = _env_bool("CORS_ALLOW_ALL_ORIGINS", False)
CORS_ALLOWED_ORIGINS = [] if CORS_ALLOW_ALL_ORIGINS else _split_env(
    "CORS_ALLOWED_ORIGINS",
    [
        "http://localhost:5173",
    ] if IS_DEVELOPMENT else [],
)
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = _split_env(
    "CSRF_TRUSTED_ORIGINS",
    CORS_ALLOWED_ORIGINS,
)

USE_X_FORWARDED_HOST = _env_bool("USE_X_FORWARDED_HOST", IS_PRODUCTION)
SECURE_PROXY_SSL_HEADER = (
    ("HTTP_X_FORWARDED_PROTO", "https")
    if _env_bool("USE_X_FORWARDED_PROTO", IS_PRODUCTION)
    else None
)
SECURE_SSL_REDIRECT = _env_bool("SECURE_SSL_REDIRECT", IS_PRODUCTION)
SESSION_COOKIE_SECURE = _env_bool("SESSION_COOKIE_SECURE", IS_PRODUCTION)
CSRF_COOKIE_SECURE = _env_bool("CSRF_COOKIE_SECURE", IS_PRODUCTION)
SESSION_COOKIE_SAMESITE = os.environ.get("SESSION_COOKIE_SAMESITE", "Lax")
CSRF_COOKIE_SAMESITE = os.environ.get("CSRF_COOKIE_SAMESITE", "Lax")
SECURE_HSTS_SECONDS = _env_int("SECURE_HSTS_SECONDS", 31536000 if IS_PRODUCTION else 0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = _env_bool(
    "SECURE_HSTS_INCLUDE_SUBDOMAINS",
    IS_PRODUCTION,
)
SECURE_HSTS_PRELOAD = _env_bool("SECURE_HSTS_PRELOAD", IS_PRODUCTION)
SECURE_CONTENT_TYPE_NOSNIFF = _env_bool("SECURE_CONTENT_TYPE_NOSNIFF", True)
SECURE_REFERRER_POLICY = os.environ.get(
    "SECURE_REFERRER_POLICY",
    "strict-origin-when-cross-origin" if IS_PRODUCTION else "same-origin",
)
X_FRAME_OPTIONS = os.environ.get("X_FRAME_OPTIONS", "DENY")


REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
}

SWAGGER_SETTINGS = {
    "SECURITY_DEFINITIONS": {
        "Bearer": {
            "type": "apiKey",
            "name": "Authorization",
            "in": "header",
            "description": "Enter: Bearer <your_token>",
        }
    },
    "SECURITY_REQUIREMENTS": [{"Bearer": []}],
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=_env_int("JWT_ACCESS_TOKEN_MINUTES", 15)
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=_env_int("JWT_REFRESH_TOKEN_DAYS", 7)
    ),
}


ROOT_URLCONF = "Locomotion.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


WSGI_APPLICATION = "Locomotion.wsgi.application"
ASGI_APPLICATION = "Locomotion.asgi.application"

# Database
# https://docs.djangoproject.com/en/6.0/ref/settings/#databases

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("POSTGRES_DB", "locomotion"),
        "USER": os.environ.get("POSTGRES_USER", "postgres"),
        "PASSWORD": os.environ.get("POSTGRES_PASSWORD", "12345678"),
        "HOST": os.environ.get("POSTGRES_HOST", "db"),
        "PORT": os.environ.get("POSTGRES_PORT", "5432"),
        "CONN_MAX_AGE": _env_int("POSTGRES_CONN_MAX_AGE", 60),
        "CONN_HEALTH_CHECKS": _env_bool("POSTGRES_CONN_HEALTH_CHECKS", True),
    }
}

POSTGRES_SSL_MODE = os.environ.get("POSTGRES_SSL_MODE", "").strip()
if POSTGRES_SSL_MODE:
    DATABASES["default"]["OPTIONS"] = {"sslmode": POSTGRES_SSL_MODE}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": os.environ.get("REDIS_CACHE_URL", "redis://redis:6379/1"),
    }
}

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            "hosts": [os.environ.get("CHANNEL_REDIS_URL", "redis://redis:6379/1")],
        },
    },
}

# Celery
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://redis:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_TIMEZONE = os.environ.get("CELERY_TIMEZONE", "Asia/Kolkata")
CELERY_ENABLE_UTC = True
DJANGO_CELERY_BEAT_TZ_AWARE = False

from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    "auto-cancel-stale-rides-every-minute": {
        "task": "bookings.tasks.auto_cancel_stale_rides",
        "schedule": crontab(minute="*"),  # Runs every minute
    },
    "purge-unverified-accounts-daily": {
        "task": "accounts.tasks.purge_unverified_accounts",
        "schedule": crontab(hour=3, minute=0),  # Runs daily at 3:00 AM UTC
    },
}

# Password validation
# https://docs.djangoproject.com/en/6.0/ref/settings/#auth-password-validators


AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


# Internationalization
# https://docs.djangoproject.com/en/6.0/topics/i18n/

LANGUAGE_CODE = os.environ.get("LANGUAGE_CODE", "en-us")

TIME_ZONE = os.environ.get("TIME_ZONE", "Asia/Kolkata")

USE_I18N = True

USE_TZ = _env_bool("USE_TZ", True)


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.0/howto/static-files/


STATIC_URL = os.environ.get("STATIC_URL", "/static/")
STATIC_ROOT = os.environ.get("STATIC_ROOT", os.path.join(BASE_DIR, "staticfiles"))
STATICFILES_STORAGE_BACKEND = (
    "whitenoise.storage.CompressedManifestStaticFilesStorage"
    if IS_PRODUCTION
    else "django.contrib.staticfiles.storage.StaticFilesStorage"
)

# S3 Media Storage
USE_S3 = os.environ.get("USE_S3", "False") == "True"

if USE_S3:
    AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY")
    AWS_STORAGE_BUCKET_NAME = os.environ.get("AWS_STORAGE_BUCKET_NAME")
    AWS_S3_REGION_NAME = os.environ.get(
        "AWS_S3_REGION",
        os.environ.get("AWS_REGION", "eu-north-1"),
    )
    AWS_S3_FILE_OVERWRITE = False
    AWS_DEFAULT_ACL = None
    AWS_S3_OBJECT_PARAMETERS = {"CacheControl": "max-age=86400"}
    AWS_MEDIA_URL_EXPIRE_SECONDS = int(
        os.environ.get("AWS_MEDIA_URL_EXPIRE_SECONDS", "3600")
    )
    AWS_QUERYSTRING_AUTH = _env_bool("AWS_QUERYSTRING_AUTH", True)
    AWS_S3_SIGNATURE_VERSION = "s3v4"
    STORAGES = {
        "default": {
            "BACKEND": "Locomotion.storage_backends.MediaStorage",
        },
        "staticfiles": {
            "BACKEND": STATICFILES_STORAGE_BACKEND,
        },
    }
    MEDIA_URL = f"https://{AWS_STORAGE_BUCKET_NAME}.s3.{AWS_S3_REGION_NAME}.amazonaws.com/media/"
else:
    AWS_MEDIA_URL_EXPIRE_SECONDS = 0
    STORAGES = {
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
        },
        "staticfiles": {
            "BACKEND": STATICFILES_STORAGE_BACKEND,
        },
    }
    MEDIA_URL = "/media/"
    MEDIA_ROOT = os.environ.get("MEDIA_ROOT", os.path.join(BASE_DIR, "media"))

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_ANDROID_CLIENT_ID = os.environ.get("GOOGLE_ANDROID_CLIENT_ID", "")
GOOGLE_IOS_CLIENT_ID = os.environ.get("GOOGLE_IOS_CLIENT_ID", "")
GOOGLE_ALLOWED_CLIENT_IDS = [
    client_id
    for client_id in {
        GOOGLE_CLIENT_ID,
        GOOGLE_ANDROID_CLIENT_ID,
        GOOGLE_IOS_CLIENT_ID,
    }
    if client_id
]

EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"

EMAIL_HOST = os.environ.get("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "True").lower() == "true"
EMAIL_TIMEOUT = _env_int("EMAIL_TIMEOUT", 30)

EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")

DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", EMAIL_HOST_USER or "noreply@locomotion.local")
ORS_API_KEY = os.environ.get("ORS_API_KEY", "")

# Razorpay Integration
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "")

# AWS SQS Configuration
AWS_SQS_REGION = os.environ.get("AWS_SQS_REGION", os.environ.get("AWS_REGION"))
AWS_REGION = AWS_SQS_REGION
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY")
AWS_SQS_QUEUE_URL = os.environ.get("AWS_SQS_QUEUE_URL", "")

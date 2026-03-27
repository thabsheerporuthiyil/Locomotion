from pathlib import Path
from uuid import uuid4


def _safe_path_part(value):
    text = str(value or "").strip().strip("/")
    if not text:
        return None
    return text.replace("\\", "/").replace(" ", "_")


def build_unique_upload_path(*parts, filename):
    extension = Path(filename or "").suffix.lower() or ".bin"
    normalized_parts = [_safe_path_part(part) for part in parts]
    normalized_parts = [part for part in normalized_parts if part]
    return "/".join(normalized_parts + [f"{uuid4().hex}{extension}"])


def build_media_url(file_field, request=None):
    if not file_field:
        return None

    try:
        url = file_field.url
    except ValueError:
        return None

    if url.startswith("http://") or url.startswith("https://"):
        return url

    return request.build_absolute_uri(url) if request else url


def validate_uploaded_file(
    value,
    *,
    label,
    max_size_mb,
    allowed_extensions,
    allowed_content_types,
):
    if not value:
        return value

    max_size = max_size_mb * 1024 * 1024
    if value.size > max_size:
        raise ValueError(f"{label} must be {max_size_mb}MB or smaller.")

    extension = Path(value.name or "").suffix.lower()
    if extension not in allowed_extensions:
        raise ValueError(
            f"{label} must be one of: {', '.join(sorted(allowed_extensions))}."
        )

    content_type = getattr(value, "content_type", "") or ""
    if content_type and content_type not in allowed_content_types:
        raise ValueError(f"Unsupported file type for {label}.")

    return value


def validate_image_upload(value, label="Image", max_size_mb=5):
    return validate_uploaded_file(
        value,
        label=label,
        max_size_mb=max_size_mb,
        allowed_extensions={".jpg", ".jpeg", ".png", ".webp"},
        allowed_content_types={"image/jpeg", "image/png", "image/webp"},
    )


def validate_document_upload(value, label="Document", max_size_mb=10):
    return validate_uploaded_file(
        value,
        label=label,
        max_size_mb=max_size_mb,
        allowed_extensions={".pdf", ".jpg", ".jpeg", ".png", ".webp"},
        allowed_content_types={
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/webp",
        },
    )

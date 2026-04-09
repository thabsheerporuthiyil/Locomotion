import json
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import boto3

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# AWS SQS Configuration
AWS_SQS_REGION = os.environ.get("AWS_SQS_REGION", os.environ.get("AWS_REGION"))
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY")
AWS_SQS_QUEUE_URL = os.environ.get("AWS_SQS_QUEUE_URL")

if not AWS_SQS_QUEUE_URL:
    logger.error("Missing AWS_SQS_QUEUE_URL in environment variables.")


@dataclass(frozen=True)
class NotificationProcessResult:
    acknowledged: bool
    reason: str
    error: str | None = None


def _load_service_account_info() -> dict[str, Any] | None:
    raw_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    if raw_json:
        return json.loads(raw_json)

    aws_region = os.environ.get("AWS_REGION") or os.environ.get("AWS_SQS_REGION")
    secret_arn = os.environ.get("FIREBASE_SERVICE_ACCOUNT_SECRET_ARN")
    if secret_arn:
        client = boto3.client("secretsmanager", region_name=aws_region)
        response = client.get_secret_value(SecretId=secret_arn)
        secret_string = response.get("SecretString")
        if not secret_string:
            raise ValueError("Secrets Manager secret does not contain SecretString data.")
        return json.loads(secret_string)

    parameter_name = os.environ.get("FIREBASE_SERVICE_ACCOUNT_SSM_PARAMETER")
    if parameter_name:
        client = boto3.client("ssm", region_name=aws_region)
        response = client.get_parameter(Name=parameter_name, WithDecryption=True)
        parameter_value = response["Parameter"]["Value"]
        return json.loads(parameter_value)

    return None


def ensure_firebase_app() -> None:
    import firebase_admin
    from firebase_admin import credentials

    if firebase_admin._apps:
        return

    service_account_info = _load_service_account_info()
    if service_account_info is not None:
        cred = credentials.Certificate(service_account_info)
        firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin SDK initialized from AWS secret-backed configuration.")
        return

    cred_path = os.environ.get(
        "FIREBASE_SERVICE_ACCOUNT_PATH",
        "firebase-service-account.json",
    )
    if not Path(cred_path).exists():
        raise FileNotFoundError(
            f"Firebase service account file not found at {cred_path}."
        )

    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)
    logger.info("Firebase Admin SDK initialized from local service account file.")


def send_fcm_notification(
    fcm_token: str,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> tuple[bool, str | None]:
    try:
        from firebase_admin import messaging

        ensure_firebase_app()

        payload = dict(data or {})
        payload.update({"title": title or "", "body": body or ""})
        payload = {str(k): "" if v is None else str(v) for k, v in payload.items()}

        message = messaging.Message(
            data=payload,
            token=fcm_token,
            webpush=messaging.WebpushConfig(headers={"Urgency": "high"}),
            android=messaging.AndroidConfig(priority="high"),
            apns=messaging.APNSConfig(headers={"apns-priority": "10"}),
        )
        response = messaging.send(message)
        logger.info("Successfully sent FCM message: %s", response)
        return True, None
    except Exception as exc:  # pragma: no cover - firebase exceptions are runtime-specific
        logger.error("Error sending FCM message: %s", exc)
        return False, str(exc)


def is_unrecoverable_fcm_error(error_message: str) -> bool:
    msg = (error_message or "").lower()
    return any(
        needle in msg
        for needle in [
            "registration-token-not-registered",
            "unregistered",
            "requested entity was not found",
            "invalid registration token",
            "invalid argument",
        ]
    )


def _decode_message_body(
    message_body: str | bytes | bytearray | dict[str, Any],
) -> dict[str, Any]:
    if isinstance(message_body, dict):
        return message_body
    if isinstance(message_body, (bytes, bytearray)):
        message_body = message_body.decode("utf-8")
    if not isinstance(message_body, str):
        raise TypeError("Notification message body must be JSON text or a dictionary.")

    payload = json.loads(message_body)
    if not isinstance(payload, dict):
        raise ValueError("Notification message body must decode to a JSON object.")
    return payload


def process_notification_message(
    message_body: str | bytes | bytearray | dict[str, Any],
    *,
    log: logging.Logger | None = None,
) -> NotificationProcessResult:
    active_logger = log or logger

    try:
        payload = _decode_message_body(message_body)
    except Exception as exc:
        active_logger.error("Dropping malformed notification payload: %s", exc)
        return NotificationProcessResult(True, "malformed_payload", str(exc))

    fcm_token = payload.get("fcm_token")
    if not fcm_token:
        active_logger.warning("Dropping notification without fcm_token.")
        return NotificationProcessResult(True, "missing_fcm_token")

    title = str(payload.get("title") or "Ride Update")
    body = str(payload.get("body") or "Your ride status has changed.")
    data = payload.get("data")
    if not isinstance(data, dict):
        data = {}

    success, error_message = send_fcm_notification(str(fcm_token), title, body, data)
    if success:
        return NotificationProcessResult(True, "sent")

    if error_message and is_unrecoverable_fcm_error(error_message):
        active_logger.warning(
            "Dropping notification due to unrecoverable FCM error: %s",
            error_message,
        )
        return NotificationProcessResult(
            True,
            "unrecoverable_fcm_error",
            error_message,
        )

    active_logger.error(
        "Notification delivery failed with a retriable error: %s",
        error_message or "unknown error",
    )
    return NotificationProcessResult(False, "retriable_fcm_error", error_message)


def build_sqs_client():
    client_kwargs = {"region_name": AWS_SQS_REGION}
    if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY:
        client_kwargs.update(
            {
                "aws_access_key_id": AWS_ACCESS_KEY_ID,
                "aws_secret_access_key": AWS_SECRET_ACCESS_KEY,
            }
        )
    return boto3.client("sqs", **client_kwargs)


sqs = build_sqs_client()

def poll_sqs():
    """Polls SQS for messages and processes them."""
    try:
        ensure_firebase_app()
    except Exception as exc:
        logger.error("Failed to initialize Firebase Admin SDK: %s", exc)
        raise SystemExit(1)

    logger.info(f"Starting SQS polling on {AWS_SQS_QUEUE_URL}...")
    
    while True:
        try:
            # Long polling: Wait up to 20 seconds for a message
            response = sqs.receive_message(
                QueueUrl=AWS_SQS_QUEUE_URL,
                MaxNumberOfMessages=10,
                WaitTimeSeconds=20,
                AttributeNames=['All'],
                MessageAttributeNames=['All']
            )

            messages = response.get('Messages', [])
            if not messages:
                # logger.debug("No messages in queue, polling again...")
                continue

            for message in messages:
                receipt_handle = message['ReceiptHandle']
                body_json = message['Body']
                
                try:
                    result = process_notification_message(body_json, log=logger)
                    if result.acknowledged:
                        sqs.delete_message(
                            QueueUrl=AWS_SQS_QUEUE_URL,
                            ReceiptHandle=receipt_handle
                        )
                        logger.info(
                            "Notification message acknowledged and deleted from SQS (%s).",
                            result.reason,
                        )
                except Exception as e:
                    logger.error(f"Unexpected error processing message: {e}")

        except Exception as e:
            logger.error(f"Error polling SQS: {e}")
            time.sleep(5)  # Back off on error

if __name__ == "__main__":
    poll_sqs()

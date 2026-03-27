import os
import json
import time
import logging
import boto3
import firebase_admin
from firebase_admin import credentials, messaging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# Firebase Initialization
try:
    # Path to the service account JSON file
    # Ensure this file is present in the same directory or provide absolute path
    cred_path = os.environ.get("FIREBASE_SERVICE_ACCOUNT_PATH", "firebase-service-account.json")
    if os.path.exists(cred_path):
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin SDK initialized successfully.")
    else:
        logger.error(f"Firebase service account file not found at {cred_path}")
        exit(1)
except Exception as e:
    logger.error(f"Failed to initialize Firebase Admin SDK: {e}")
    exit(1)

# AWS SQS Configuration
AWS_REGION = os.environ.get("AWS_REGION", "eu-north-1")
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY")
AWS_SQS_QUEUE_URL = os.environ.get("AWS_SQS_QUEUE_URL")

if not all([AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SQS_QUEUE_URL]):
    logger.error("Missing AWS credentials or SQS Queue URL in environment variables.")
    # In some environments, boto3 might use IAM roles, but here we expect env vars
    # exit(1) # Don't exit yet, boto3 might find them in ~/.aws/credentials

sqs = boto3.client(
    "sqs",
    region_name=AWS_REGION,
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY
)

def send_fcm_notification(fcm_token, title, body, data=None):
    """Sends a push notification via Firebase Cloud Messaging."""
    try:
        # Web (service-worker) reliability: prefer data-only messages and let the SW render the notification.
        # Also ensure FCM data values are strings.
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
        logger.info(f"Successfully sent FCM message: {response}")
        return True, None
    except Exception as e:
        logger.error(f"Error sending FCM message: {e}")
        return False, str(e)


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

def poll_sqs():
    """Polls SQS for messages and processes them."""
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
                    payload = json.loads(body_json)
                    fcm_token = payload.get('fcm_token')
                    title = payload.get('title', 'Ride Update')
                    body = payload.get('body', 'Your ride status has changed.')
                    data = payload.get('data', {})

                    if fcm_token:
                        logger.info(f"Processing notification for token: {fcm_token[:10]}...")
                        success, err = send_fcm_notification(fcm_token, title, body, data)
                        
                        if success:
                            # Delete message from queue after successful processing
                            sqs.delete_message(
                                QueueUrl=AWS_SQS_QUEUE_URL,
                                ReceiptHandle=receipt_handle
                            )
                            logger.info("Message processed and deleted from SQS.")
                        else:
                            # Avoid poisoning the queue with permanently invalid tokens.
                            if err and is_unrecoverable_fcm_error(err):
                                logger.warning("Dropping message due to unrecoverable FCM error.")
                                sqs.delete_message(
                                    QueueUrl=AWS_SQS_QUEUE_URL,
                                    ReceiptHandle=receipt_handle
                                )
                    else:
                        logger.warning("Message received without fcm_token. Deleting...")
                        sqs.delete_message(
                            QueueUrl=AWS_SQS_QUEUE_URL,
                            ReceiptHandle=receipt_handle
                        )

                except json.JSONDecodeError:
                    logger.error(f"Failed to decode message body: {body_json}")
                    # Delete malformed message
                    sqs.delete_message(
                        QueueUrl=AWS_SQS_QUEUE_URL,
                        ReceiptHandle=receipt_handle
                    )
                except Exception as e:
                    logger.error(f"Unexpected error processing message: {e}")

        except Exception as e:
            logger.error(f"Error polling SQS: {e}")
            time.sleep(5)  # Back off on error

if __name__ == "__main__":
    poll_sqs()

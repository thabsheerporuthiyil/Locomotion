from datetime import timedelta

from celery import shared_task
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.utils import timezone

User = get_user_model()


@shared_task
def send_otp_email(email, otp, subject="Your OTP"):
    send_mail(
        subject=subject,
        message=f"Your OTP is {otp}",
        from_email="locomotiondrivers@gmail.com",
        recipient_list=[email],
    )


@shared_task
def purge_unverified_accounts():
    """
    Deletes user accounts that were created more than 7 days ago
    but never completed the OTP verification process.
    """
    time_threshold = timezone.now() - timedelta(days=7)
    unverified_users = User.objects.filter(
        is_verified=False,
        is_staff=False,
        is_superuser=False,
        created_at__lte=time_threshold,
    )

    count = unverified_users.count()
    if count > 0:
        unverified_users.delete()
        return f"Purged {count} unverified ghost accounts"
    return "No unverified accounts to purge"

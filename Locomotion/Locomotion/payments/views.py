import random
from decimal import Decimal

import razorpay
from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

razorpay_client = razorpay.Client(
    auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET)
)


class CreateWalletRechargeOrderView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            driver_profile = request.user.driver_profile

            # Allow user to specify amount, or default to the exact amount needed to reach 0
            requested_amount = request.data.get("amount")

            if requested_amount:
                amount_in_inr = float(requested_amount)
            else:
                if driver_profile.wallet_balance >= 0:
                    return Response(
                        {"error": "Wallet balance is already positive."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                # Calculate absolute value needed to reach exactly 0
                amount_in_inr = float(abs(driver_profile.wallet_balance))

            amount_in_paise = int(amount_in_inr * 100)

            if amount_in_paise <= 0:
                return Response(
                    {"error": "Invalid recharge amount."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Create Razorpay Order
            razorpay_order = razorpay_client.order.create(
                dict(
                    amount=amount_in_paise,
                    currency="INR",
                    receipt=f"recharge_{driver_profile.id}_{random.randint(1000, 9999)}",
                    notes={
                        "driver_id": str(driver_profile.id),
                        "type": "wallet_recharge",
                    },
                )
            )

            return Response(
                {
                    "order_id": razorpay_order["id"],
                    "amount": razorpay_order["amount"],
                    "currency": razorpay_order["currency"],
                    "key_id": settings.RAZORPAY_KEY_ID,
                },
                status=status.HTTP_200_OK,
            )

        except Exception as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class VerifyWalletRechargeView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        razorpay_order_id = request.data.get("razorpay_order_id")
        razorpay_payment_id = request.data.get("razorpay_payment_id")
        razorpay_signature = request.data.get("razorpay_signature")

        if not all([razorpay_order_id, razorpay_payment_id, razorpay_signature]):
            return Response(
                {"error": "Missing payment verification parameters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            driver_profile = request.user.driver_profile

            params_dict = {
                "razorpay_order_id": razorpay_order_id,
                "razorpay_payment_id": razorpay_payment_id,
                "razorpay_signature": razorpay_signature,
            }

            # Verify Signature
            razorpay_client.utility.verify_payment_signature(params_dict)

            # Fetch the order details from Razorpay to know exactly how much was paid
            order = razorpay_client.order.fetch(razorpay_order_id)
            amount_paid_in_inr = order["amount"] / 100.0

            # Add the money back to the driver's wallet
            driver_profile.wallet_balance += Decimal(str(amount_paid_in_inr))
            driver_profile.save()

            return Response(
                {
                    "message": "Wallet recharged successfully.",
                    "new_balance": driver_profile.wallet_balance,
                },
                status=status.HTTP_200_OK,
            )

        except razorpay.errors.SignatureVerificationError:
            return Response(
                {"error": "Payment signature verification failed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as e:
            return Response(
                {"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

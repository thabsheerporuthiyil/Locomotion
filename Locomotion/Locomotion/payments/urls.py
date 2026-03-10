from django.urls import path

from .views import CreateWalletRechargeOrderView, VerifyWalletRechargeView

urlpatterns = [
    path(
        "wallet/recharge/",
        CreateWalletRechargeOrderView.as_view(),
        name="create-wallet-recharge",
    ),
    path(
        "wallet/verify/",
        VerifyWalletRechargeView.as_view(),
        name="verify-wallet-recharge",
    ),
]

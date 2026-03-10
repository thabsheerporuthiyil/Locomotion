from rest_framework.permissions import BasePermission


class IsActiveDriver(BasePermission):
    """
    Allows access only to users who have an approved and active DriverProfile.
    """

    def has_permission(self, request, view):
        if not bool(request.user and request.user.is_authenticated):
            return False

        if hasattr(request.user, "driver_profile"):
            return request.user.driver_profile.is_active

        return False

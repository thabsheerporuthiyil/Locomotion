from django.db import models

# Create your models here.


class VehicleCategory(models.Model):
    name = models.CharField(max_length=50)

    def __str__(self):
        return self.name


class VehicleBrand(models.Model):
    name = models.CharField(max_length=100)
    category = models.ForeignKey(
        VehicleCategory, on_delete=models.CASCADE, related_name="brands"
    )

    def __str__(self):
        return self.name


class VehicleModel(models.Model):
    name = models.CharField(max_length=100)
    brand = models.ForeignKey(
        VehicleBrand, on_delete=models.CASCADE, related_name="models"
    )

    def __str__(self):
        return f"{self.brand.name} {self.name}"

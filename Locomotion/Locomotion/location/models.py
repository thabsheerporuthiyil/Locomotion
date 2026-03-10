from django.db import models

# Create your models here.


class District(models.Model):
    name = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.name


class Taluk(models.Model):
    district = models.ForeignKey(
        District, on_delete=models.CASCADE, related_name="taluks"
    )
    name = models.CharField(max_length=100)

    class Meta:
        unique_together = ("district", "name")

    def __str__(self):
        return f"{self.name} - {self.district.name}"


class Panchayath(models.Model):
    taluk = models.ForeignKey(
        Taluk, on_delete=models.CASCADE, related_name="panchayaths"
    )
    name = models.CharField(max_length=100)

    class Meta:
        unique_together = ("taluk", "name")

    def __str__(self):
        return f"{self.name} - {self.taluk.name}"

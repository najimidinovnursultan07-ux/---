from django.db import models


class Student(models.Model):
    full_name = models.CharField(max_length=255)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["full_name"]

    def __str__(self):
        return self.full_name


class Attendance(models.Model):
    student = models.ForeignKey(
        Student,
        on_delete=models.CASCADE,
        related_name="attendances",
    )
    date = models.DateField()
    is_present = models.BooleanField(default=False)

    class Meta:
        unique_together = ("student", "date")
        ordering = ["student__full_name"]

    def __str__(self):
        return f"{self.student} - {self.date}"

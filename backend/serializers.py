from rest_framework import serializers

from .models import Attendance, Student


class StudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = ["id", "full_name", "is_active"]


class AttendanceSerializer(serializers.ModelSerializer):
    student_id = serializers.IntegerField(source="student.id", read_only=True)

    class Meta:
        model = Attendance
        fields = ["id", "student_id", "date", "is_present"]


class AttendanceBulkRecordSerializer(serializers.Serializer):
    student_id = serializers.PrimaryKeyRelatedField(
        source="student",
        queryset=Student.objects.filter(is_active=True),
    )
    is_present = serializers.BooleanField()


class AttendanceBulkSerializer(serializers.Serializer):
    date = serializers.DateField()
    records = AttendanceBulkRecordSerializer(many=True)

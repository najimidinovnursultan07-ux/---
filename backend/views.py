from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Attendance, Student
from .serializers import (
    AttendanceBulkSerializer,
    AttendanceSerializer,
    StudentSerializer,
)


class StudentViewSet(viewsets.ModelViewSet):
    queryset = Student.objects.filter(is_active=True).order_by("full_name")
    serializer_class = StudentSerializer
    http_method_names = ["get", "post", "put", "patch", "head", "options"]


class AttendanceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Attendance.objects.select_related("student").order_by(
        "student__full_name"
    )
    serializer_class = AttendanceSerializer

    def get_queryset(self):
        queryset = super().get_queryset().filter(student__is_active=True)
        date = self.request.query_params.get("date")
        if date:
            queryset = queryset.filter(date=date)
        return queryset

    @action(detail=False, methods=["post"], url_path="save-bulk")
    def save_bulk(self, request):
        serializer = AttendanceBulkSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        date = serializer.validated_data["date"]
        saved_records = []
        for record in serializer.validated_data["records"]:
            attendance, _ = Attendance.objects.update_or_create(
                student=record["student"],
                date=date,
                defaults={"is_present": record["is_present"]},
            )
            saved_records.append(attendance)

        return Response(
            AttendanceSerializer(saved_records, many=True).data,
            status=status.HTTP_200_OK,
        )

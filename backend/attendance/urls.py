from rest_framework.routers import DefaultRouter
from django.urls import path

from .views import AttendanceViewSet, StudentGroupViewSet, StudentViewSet
from .pdf_import import StudentPdfImportView

router = DefaultRouter()
router.register(r'students', StudentViewSet, basename='student')
router.register(r'groups', StudentGroupViewSet, basename='student-group')
router.register(r'attendance', AttendanceViewSet, basename='attendance')

urlpatterns = router.urls + [
    path('students/import-pdf/', StudentPdfImportView.as_view(), name='student-import-pdf'),
]

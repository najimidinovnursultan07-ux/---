from rest_framework.routers import DefaultRouter

from .views import AttendanceViewSet, StudentGroupViewSet, StudentViewSet

router = DefaultRouter()
router.register(r'students', StudentViewSet, basename='student')
router.register(r'groups', StudentGroupViewSet, basename='student-group')
router.register(r'attendance', AttendanceViewSet, basename='attendance')

urlpatterns = router.urls

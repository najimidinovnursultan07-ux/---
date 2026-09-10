from django.urls import path
from .views import MentorRateDetailView, MentorRateListView, PayrollListView

urlpatterns = [
    path('', PayrollListView.as_view(), name='payroll-list'),
    path('rates/', MentorRateListView.as_view(), name='payroll-rates'),
    path('rates/<int:mentor_id>/', MentorRateDetailView.as_view(), name='payroll-rate-detail'),
]

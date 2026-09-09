from django.urls import path

from .views import ChangeRoleView, DeleteUserView, LoginView, MeView, RegisterView, UserListView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='auth-register'),
    path('login/', LoginView.as_view(), name='auth-login'),
    path('me/', MeView.as_view(), name='auth-me'),
    path('users/', UserListView.as_view(), name='auth-users'),
    path('users/<int:user_id>/change-role/', ChangeRoleView.as_view(), name='auth-change-role'),
    path('users/<int:user_id>/', DeleteUserView.as_view(), name='auth-delete-user'),
]

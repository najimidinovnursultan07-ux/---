# Attendance Management

## Backend setup

The Django project lives in `backend/` and uses the `attendance` app. From that directory, install the REST/CORS packages:

```bash
python -m pip install django djangorestframework django-cors-headers
```

In `settings.py`:

```python
INSTALLED_APPS = [
    # ...
    "corsheaders",
    "rest_framework",
    "attendance",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    # ... the remaining Django middleware
]

CORS_ALLOWED_ORIGINS = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
]
```

When serving the frontend from another origin, add that exact origin to `CORS_ALLOWED_ORIGINS`. Avoid `CORS_ALLOW_ALL_ORIGINS = True` in production.

Include the app routes in the Django project's root `urls.py`:

```python
from django.urls import include, path

urlpatterns = [
    path("api/", include("backend.urls")),
]
```

Run migrations and seed the 48 students:

```bash
python manage.py makemigrations attendance
python manage.py makemigrations authentication
python manage.py migrate
python manage.py seed_data
```

Start Django:

```bash
python manage.py runserver 127.0.0.1:8000
```

## Frontend

The frontend is a Vite + React application. From the `frontend/` directory:

```bash
npm install
npm run dev
```

Open `http://localhost:5175`. For a production bundle, run `npm run build`.

The frontend expects the API at `http://127.0.0.1:8000/api`.

## Production handover reset

Before handing the system to a new client, inspect the reset without changing data:

```bash
cd backend
python manage.py reset_data --dry-run
```

The destructive reset requires typing `RESET` interactively. For an explicit deployment script, use `--yes`:

```bash
python manage.py reset_data --yes
```

This removes attendance, students, groups, and Mentor/Curator users inside one database transaction. Users with `is_superuser=True` or an `ADMIN` profile are preserved, including their passwords and active sessions.

The API provides:

- `GET/POST /api/students/`
- `PUT/PATCH /api/students/<id>/`
- `GET /api/attendance/?date=YYYY-MM-DD`
- `POST /api/attendance/save-bulk/`
- `GET /api/attendance/report/?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`

## Roles

The `authentication` app provides `UserProfile` roles: `ADMIN`, `MENTOR`, and `CURATOR`. In the local role-switcher UI, the selected role is sent as `X-User-Role`; this development-only header is accepted only while `DEBUG=True`. Production deployments should use authenticated Django users with a related `UserProfile` and set `DEBUG=False`.

Student writes require `MENTOR`; attendance bulk writes require `MENTOR`; reports require `ADMIN`, `CURATOR`, or `MENTOR`. Student `DELETE` is implemented as a soft-delete by setting `is_active=False`. Admin dashboards are observational, while Admin user deletion is available through the protected user-management API.

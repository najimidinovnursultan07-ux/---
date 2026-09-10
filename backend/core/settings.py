"""
Django settings for core project.
"""

import os
from pathlib import Path

import dj_database_url

# ─────────────────────────────────────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent


# ─────────────────────────────────────────────────────────────────────────────
# Security
# ─────────────────────────────────────────────────────────────────────────────
SECRET_KEY = os.environ.get(
    'DJANGO_SECRET_KEY',
    'django-insecure-_b48lv@ik7yvms_xcy3_kj)=80ke_einy^0+uo-boi@ocdpv*$',
)

DEBUG = os.environ.get('DJANGO_DEBUG', 'True') == 'True'

ALLOWED_HOSTS = [
    'mentor-0qlv.onrender.com',
    'localhost',
    '127.0.0.1',
    'testserver',
    '*',
]


# ─────────────────────────────────────────────────────────────────────────────
# Application definition
# ─────────────────────────────────────────────────────────────────────────────
INSTALLED_APPS = [
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'attendance',
    'authentication',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'core.wsgi.application'


# ─────────────────────────────────────────────────────────────────────────────
# Database
#
# On Render (production) the DATABASE_URL environment variable is set to the
# PostgreSQL connection string.  dj_database_url.config() picks it up
# automatically.  The sqlite fallback is used for local development ONLY and
# is intentionally never used on the server (Render always injects DATABASE_URL).
# ─────────────────────────────────────────────────────────────────────────────
DATABASES = {
    'default': dj_database_url.config(
        default=f'sqlite:///{BASE_DIR / "db.sqlite3"}',
        conn_max_age=600,
        conn_health_checks=True,
    )
}


# ─────────────────────────────────────────────────────────────────────────────
# Password validation
# ─────────────────────────────────────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# ─────────────────────────────────────────────────────────────────────────────
# Internationalization
# ─────────────────────────────────────────────────────────────────────────────
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True


# ─────────────────────────────────────────────────────────────────────────────
# Static files
# ─────────────────────────────────────────────────────────────────────────────
STATIC_URL = '/static/'
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')


# ─────────────────────────────────────────────────────────────────────────────
# CORS
#
# CORS_ALLOW_ALL_ORIGINS = True is kept so that the deployed frontend (Vercel)
# and local dev servers can both reach the API without listing every origin.
# ─────────────────────────────────────────────────────────────────────────────
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]


# ─────────────────────────────────────────────────────────────────────────────
# REST Framework
# ─────────────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}


# ─────────────────────────────────────────────────────────────────────────────
# Misc
# ─────────────────────────────────────────────────────────────────────────────
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

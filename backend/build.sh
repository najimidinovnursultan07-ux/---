#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

pip install -r requirements.txt
python manage.py collectstatic --noinput
python manage.py migrate
python manage.py create_accountant

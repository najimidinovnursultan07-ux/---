"""
PDF Student Import — API view.

POST /api/students/import-pdf/

Accepts a multipart/form-data request with:
  - file   : PDF file
  - group_id : (optional) StudentGroup pk to assign imported students to

Extraction strategy (in order of preference):
  1. Tables  — looks for columns that resemble student lists
  2. Lines   — each non-empty line is treated as a potential student name

A "name" is accepted when it:
  - Contains ≥ 2 words (FirstName LastName or Surname Name Patronymic)
  - Passes a basic Cyrillic/Latin character check
  - Is NOT a header keyword (Group, Date, №, Name, etc.)

Returns:
  {
    "created": [{"id": 1, "full_name": "Имя", "group_id": 3}],
    "skipped": ["Already Exists"],
    "errors":  ["Could not parse line X"],
    "total_parsed": 12,
    "total_created": 8,
    "total_skipped": 4,
  }
"""

import io
import re

from django.db import transaction
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView

from authentication.permissions import IsMentorOrAdmin
from .models import Student, StudentGroup
from .serializers import StudentSerializer


# ── Text helpers ──────────────────────────────────────────────────────────────

# Words that indicate a header row, not a student name
_HEADER_WORDS = frozenset({
    'no', '№', 'n', 'num', 'fio', 'ф.и.о', 'фио', 'name', 'аты', 'аты-жөнү',
    'full', 'surname', 'group', 'тайпа', 'тайпалар', 'группа', 'groups',
    'phone', 'телефон', 'email', 'дата', 'date', 'жыл', 'notes', 'примечание',
    'comment', 'статус', 'status', 'id', 'score', 'балл', 'итого', 'total',
})

# Minimum words in a valid full name
_MIN_WORDS = 2
# Maximum words (to exclude long sentences)
_MAX_WORDS = 6


def _looks_like_name(text: str) -> bool:
    """Return True if *text* plausibly is a student full name."""
    text = text.strip()
    if not text:
        return False

    # Strip leading index numbers like "1.", "12)", "№3"
    text = re.sub(r'^[\d]+[.)]\s*', '', text)
    text = re.sub(r'^№\s*\d+\s*', '', text)
    text = text.strip()

    if not text:
        return False

    words = text.split()
    if not (_MIN_WORDS <= len(words) <= _MAX_WORDS):
        return False

    # Reject if any word is a known header keyword
    if any(w.lower().strip('.,:-') in _HEADER_WORDS for w in words):
        return False

    # Each word must consist mostly of letters (allow hyphens/apostrophes)
    for w in words:
        cleaned = re.sub(r"[-']", '', w)
        if not cleaned.isalpha():
            return False

    return True


def _clean_name(text: str) -> str:
    """Strip index prefix and normalise whitespace."""
    text = re.sub(r'^[\d]+[.)]\s*', '', text.strip())
    text = re.sub(r'^№\s*\d+\s*', '', text)
    # Title-case each word
    return ' '.join(w.capitalize() for w in text.split())


def _extract_phone(text: str) -> str:
    """Try to extract a phone number from a text cell."""
    m = re.search(r'[\+\d][\d\s\-\(\)]{6,15}', text)
    return m.group().strip() if m else ''


# ── PDF extraction ────────────────────────────────────────────────────────────

def extract_students_from_pdf(file_bytes: bytes) -> list[dict]:
    """
    Parse a PDF and return a list of dicts:
      [{'full_name': str, 'phone': str}, ...]
    """
    try:
        import pdfplumber
    except ImportError:
        raise RuntimeError('pdfplumber is not installed. Run: pip install pdfplumber')

    candidates: list[dict] = []
    seen_names: set[str] = set()

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:

            # ── Strategy 1: tables ──────────────────────────────────────────
            for table in page.extract_tables():
                if not table:
                    continue
                # Find the column index most likely to contain names
                name_col = _find_name_column(table)
                phone_col = _find_phone_column(table)

                for row in table:
                    if not row:
                        continue
                    cell = row[name_col] or ''
                    cell = cell.strip()
                    if _looks_like_name(cell):
                        name = _clean_name(cell)
                        if name not in seen_names:
                            seen_names.add(name)
                            phone = ''
                            if phone_col is not None and phone_col < len(row):
                                phone = _extract_phone(row[phone_col] or '')
                            candidates.append({'full_name': name, 'phone': phone})

            # ── Strategy 2: plain text lines ────────────────────────────────
            text = page.extract_text() or ''
            for line in text.splitlines():
                line = line.strip()
                if _looks_like_name(line):
                    name = _clean_name(line)
                    if name not in seen_names:
                        seen_names.add(name)
                        candidates.append({'full_name': name, 'phone': ''})

    return candidates


def _find_name_column(table: list) -> int:
    """Return the column index that most likely contains full names."""
    col_counts = {}
    for row in table[1:]:  # skip header row
        for i, cell in enumerate(row):
            if cell and _looks_like_name(str(cell)):
                col_counts[i] = col_counts.get(i, 0) + 1
    if col_counts:
        return max(col_counts, key=col_counts.get)
    return 0  # fallback: first column


def _find_phone_column(table: list) -> int | None:
    """Return the column index most likely containing phone numbers, or None."""
    for row in table:
        for i, cell in enumerate(row):
            if cell and re.search(r'[\+\d][\d\s\-\(\)]{6,15}', str(cell)):
                return i
    return None


# ── API view ──────────────────────────────────────────────────────────────────

class StudentPdfImportView(APIView):
    """
    POST /api/students/import-pdf/

    Form fields:
      file     : PDF file (required)
      group_id : integer (optional) — assign imported students to this group
    """
    parser_classes = [MultiPartParser, FormParser]
    permission_classes = [IsMentorOrAdmin]

    def post(self, request):
        pdf_file = request.FILES.get('file')
        if not pdf_file:
            return Response({'detail': 'PDF файл жөнөтүлгөн жок (field: file).'}, status=400)

        if not pdf_file.name.lower().endswith('.pdf'):
            return Response({'detail': 'Файл .pdf форматында болушу керек.'}, status=400)

        # Optional target group
        group = None
        group_id = request.data.get('group_id')
        if group_id:
            try:
                group = StudentGroup.objects.get(pk=int(group_id))
            except (StudentGroup.DoesNotExist, ValueError, TypeError):
                return Response({'detail': f'Группа #{group_id} табылган жок.'}, status=404)

        # Parse PDF
        try:
            file_bytes = pdf_file.read()
            parsed = extract_students_from_pdf(file_bytes)
        except RuntimeError as exc:
            return Response({'detail': str(exc)}, status=500)
        except Exception as exc:
            return Response({'detail': f'PDF файлды окуу мүмкүн болгон жок: {exc}'}, status=400)

        if not parsed:
            return Response({
                'detail': 'PDF файлда студенттердин аттары табылган жок. '
                          'Файл таблица же тизме форматында болушу керек.',
                'total_parsed': 0,
                'total_created': 0,
                'total_skipped': 0,
                'created': [],
                'skipped': [],
            }, status=200)

        # Bulk create — skip existing names in the same group (or globally)
        created_students = []
        skipped_names    = []

        with transaction.atomic():
            for item in parsed:
                full_name = item['full_name']
                phone     = item.get('phone', '')

                # Check for duplicates within the target group (or globally if no group)
                qs = Student.objects.filter(full_name__iexact=full_name, is_active=True)
                if group:
                    qs = qs.filter(group=group)
                if qs.exists():
                    skipped_names.append(full_name)
                    continue

                student = Student.objects.create(
                    full_name=full_name,
                    phone=phone,
                    group=group,
                    group_name=group.name if group else '',
                    is_active=True,
                )
                created_students.append(student)

        return Response({
            'total_parsed':  len(parsed),
            'total_created': len(created_students),
            'total_skipped': len(skipped_names),
            'created':       StudentSerializer(created_students, many=True).data,
            'skipped':       skipped_names,
        }, status=201)

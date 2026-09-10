from django.db import transaction
from datetime import timedelta, date as date_type
import calendar
from pathlib import Path

from django.db.models import Count, Prefetch, Q
from django.shortcuts import get_object_or_404
from django.http import HttpResponse
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Spacer, Table, TableStyle, Paragraph, HRFlowable
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

from authentication.permissions import IsAdminUserRole, IsApprovedUser, IsCurator, IsMentor, IsMentorOrAdmin, request_role

from .models import Attendance, Student, StudentGroup
from .serializers import (
	AttendanceBulkSerializer,
	AttendanceModeBulkSerializer,
	AttendanceReportSerializer,
	AttendanceHistoryStudentSerializer,
	AttendanceSerializer,
	StudentGroupSerializer,
	StudentSerializer,
)


class StudentGroupViewSet(viewsets.ModelViewSet):
	serializer_class = StudentGroupSerializer
	http_method_names = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

	def get_permissions(self):
		if self.action in {'list', 'retrieve'}:
			return [IsApprovedUser()]
		return [IsMentor()]

	def get_queryset(self):
		queryset = StudentGroup.objects.select_related('mentor').prefetch_related(
			Prefetch('students', queryset=Student.objects.filter(is_active=True), to_attr='_active_students'),
		)
		if request_role(self.request) == 'MENTOR':
			queryset = queryset.filter(mentor=self.request.user)
		mentor_id = self.request.query_params.get('mentor_id')
		if mentor_id and request_role(self.request) in {'ADMIN', 'CURATOR'}:
			queryset = queryset.filter(mentor_id=mentor_id)
		return queryset.order_by('name')

	def perform_create(self, serializer):
		mentor = serializer.validated_data.get('mentor')
		if request_role(self.request) == 'MENTOR':
			mentor = self.request.user
		elif not mentor or not hasattr(mentor, 'role_profile') or mentor.role_profile.role != 'MENTOR':
			raise ValidationError({'mentor_id': 'Тайпага ментор тандаңыз.'})
		serializer.save(mentor=mentor)

	def perform_update(self, serializer):
		if request_role(self.request) == 'MENTOR':
			serializer.save(mentor=self.request.user)
		else:
			mentor = serializer.validated_data.get('mentor', serializer.instance.mentor)
			if not hasattr(mentor, 'role_profile') or mentor.role_profile.role != 'MENTOR':
				raise ValidationError({'mentor_id': 'Тайпага ментор тандаңыз.'})
			serializer.save()

	def perform_destroy(self, instance):
		with transaction.atomic():
			instance.students.update(group=None, group_name=instance.name, is_active=False)
			instance.delete()


class StudentViewSet(viewsets.ModelViewSet):
	serializer_class = StudentSerializer
	http_method_names = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

	def get_permissions(self):
		if self.action in {'create', 'update', 'partial_update', 'destroy'}:
			return [IsMentor()]
		return [IsApprovedUser()]

	def get_queryset(self):
		queryset = Student.objects.filter(is_active=True).select_related('group__mentor').order_by('full_name')
		if request_role(self.request) == 'MENTOR':
			queryset = queryset.filter(group__mentor=self.request.user)
		mentor_id = self.request.query_params.get('mentor_id')
		if mentor_id and request_role(self.request) in {'ADMIN', 'CURATOR'}:
			queryset = queryset.filter(group__mentor_id=mentor_id)
		group_id = self.request.query_params.get('group_id')
		if group_id:
			queryset = queryset.filter(group_id=group_id)
		return queryset

	def perform_create(self, serializer):
		student = serializer.save()
		Attendance.objects.get_or_create(student=student, date=timezone.localdate())

	def create(self, request, *args, **kwargs):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		if request_role(request) == 'MENTOR':
			group = serializer.validated_data.get('group')
			if not group or group.mentor_id != request.user.id:
				return Response({'detail': 'Өзүңүздүн тайпаңыздагы окуучуларды гана кошо аласыз.'}, status=status.HTTP_403_FORBIDDEN)
			if Student.objects.filter(group__mentor=request.user, is_active=True).count() >= 300:
				return Response({'detail': 'Бир менторго 300 окуучудан ашык кошууга болбойт.'}, status=status.HTTP_400_BAD_REQUEST)
		self.perform_create(serializer)
		headers = self.get_success_headers(serializer.data)
		return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

	def perform_destroy(self, instance):
		instance.is_active = False
		instance.save(update_fields=['is_active'])

	def perform_update(self, serializer):
		if request_role(self.request) == 'MENTOR':
			group = serializer.validated_data.get('group', serializer.instance.group)
			if not group or group.mentor_id != self.request.user.id:
				raise PermissionDenied('Өзүңүздүн тайпаңыздагы окуучуларды гана өзгөртө аласыз.')
		serializer.save()

	def destroy(self, request, *args, **kwargs):
		student = get_object_or_404(
			Student.objects.filter(is_active=True).select_related('group__mentor'),
			pk=kwargs.get(self.lookup_field),
		)
		if request_role(request) == 'MENTOR' and (not student.group_id or student.group.mentor_id != request.user.id):
			return Response({'error': 'Бул окуучуну өчүрүүгө укугуңуз жок!'}, status=status.HTTP_403_FORBIDDEN)

		self.perform_destroy(student)
		return Response(status=status.HTTP_204_NO_CONTENT)


class AttendanceViewSet(viewsets.ReadOnlyModelViewSet):
	serializer_class = AttendanceSerializer

	def get_permissions(self):
		if self.action == 'save_bulk':
			return [IsMentorOrAdmin()]
		if self.action == 'report':
			return [IsCurator()]
		if self.action in ('report_pdf', 'mentor_monthly_pdf', 'curator_monthly_pdf'):
			return [IsApprovedUser()]
		if self.action == 'save_mode':
			return [IsMentorOrAdmin()]
		if self.action == 'history':
			return [IsCurator()]
		return [IsApprovedUser()]

	def get_queryset(self):
		selected_date = parse_date(self.request.query_params.get('date', '')) or timezone.localdate()
		self._prepare_day(selected_date)
		queryset = Attendance.objects.select_related('student', 'student__group', 'student__group__mentor').filter(
			student__is_active=True,
		)
		if request_role(self.request) == 'MENTOR':
			queryset = queryset.filter(student__group__mentor=self.request.user)
		mentor_id = self.request.query_params.get('mentor_id')
		if mentor_id and request_role(self.request) in {'ADMIN', 'CURATOR'}:
			queryset = queryset.filter(student__group__mentor_id=mentor_id)
		date_filter = self.request.query_params.get('date')
		if date_filter:
			queryset = queryset.filter(date=selected_date)
		return queryset.order_by('student__full_name')

	def _assert_mentor_students(self, records):
		role = request_role(self.request)
		# ADMIN can edit any student's attendance
		if role == 'ADMIN':
			return None
		if role == 'MENTOR' and any(
			not record['student'].group_id or record['student'].group.mentor_id != self.request.user.id
			for record in records
		):
			return Response({'detail': 'Башка ментордун окуучуларынын катышуусун өзгөртө албайсыз.'}, status=status.HTTP_403_FORBIDDEN)
		return None

	def _prepare_day(self, selected_date):
		"""Ensure Attendance rows exist for every active student on selected_date."""
		today = timezone.localdate()
		# Lock past days that are still unlocked (housekeeping)
		Attendance.objects.filter(date__lt=today, is_locked=False).update(is_locked=True)
		# Create default (absent) rows for all active students on the requested date
		students = Student.objects.filter(is_active=True)
		Attendance.objects.bulk_create(
			[Attendance(student=student, date=selected_date) for student in students],
			ignore_conflicts=True,
		)

	@action(detail=False, methods=['post'], url_path='save-bulk')
	def save_bulk(self, request):
		serializer = AttendanceBulkSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		permission_response = self._assert_mentor_students(serializer.validated_data['records'])
		if permission_response:
			return permission_response

		selected_date = serializer.validated_data['date']
		self._prepare_day(selected_date)

		saved_records = []
		with transaction.atomic():
			for record in serializer.validated_data['records']:
				attendance, _ = Attendance.objects.update_or_create(
					student=record['student'],
					date=selected_date,
					defaults={'is_present': record['is_present'], 'is_locked': False},
				)
				saved_records.append(attendance)

		return Response(
			AttendanceSerializer(saved_records, many=True).data,
			status=status.HTTP_200_OK,
		)

	@action(detail=False, methods=['post'], url_path='save-mode')
	def save_mode(self, request):
		serializer = AttendanceModeBulkSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		permission_response = self._assert_mentor_students(serializer.validated_data['records'])
		if permission_response:
			return permission_response
		selected_date = serializer.validated_data['date']
		self._prepare_day(selected_date)

		saved_records = []
		with transaction.atomic():
			for record in serializer.validated_data['records']:
				attendance, _ = Attendance.objects.update_or_create(
					student=record['student'],
					date=selected_date,
					defaults={'attendance_type': record['attendance_type']},
				)
				saved_records.append(attendance)
		return Response(AttendanceSerializer(saved_records, many=True).data)

	@action(detail=False, methods=['get'], url_path='history')
	def history(self, request):
		try:
			months = min(max(int(request.query_params.get('months', 3)), 1), 3)
		except (TypeError, ValueError):
			return Response({'detail': 'months 1ден 3кө чейинки сан болушу керек.'}, status=status.HTTP_400_BAD_REQUEST)

		today = timezone.localdate()
		start_date = today - timedelta(days=months * 30 - 1)
		self._prepare_day(today)
		dates = [start_date + timedelta(days=index) for index in range(months * 30)]
		students = Student.objects.filter(is_active=True).select_related('group', 'group__mentor').order_by('full_name')
		if request_role(request) == 'MENTOR':
			students = students.filter(group__mentor=request.user)
		mentor_id = request.query_params.get('mentor_id')
		if mentor_id and request_role(request) in {'ADMIN', 'CURATOR'}:
			students = students.filter(group__mentor_id=mentor_id)
		records = Attendance.objects.filter(student__in=students, date__range=(start_date, today)).values('student_id', 'date', 'is_present')
		record_map = {(record['student_id'], record['date']): record['is_present'] for record in records}
		rows = []
		for student in students:
			days = [bool(record_map.get((student.id, date), False)) for date in dates]
			rows.append({
				'student_id': student.id,
				'full_name': student.full_name,
				'days': days,
				'attendance_rate': round(sum(days) / len(days) * 100, 2) if days else 0.0,
			})
		return Response({
			'months': months,
			'start_date': start_date,
			'end_date': today,
			'dates': dates,
			'students': AttendanceHistoryStudentSerializer(rows, many=True).data,
		})

	@action(detail=False, methods=['get'], url_path='report')
	def report(self, request):
		start_date = request.query_params.get('start_date')
		end_date = request.query_params.get('end_date')
		if not start_date or not end_date:
			return Response(
				{'detail': 'start_date жана end_date параметрлери милдеттүү.'},
				status=status.HTTP_400_BAD_REQUEST,
			)
		if start_date > end_date:
			return Response(
				{'detail': 'start_date end_date-ден мурун болушу керек.'},
				status=status.HTTP_400_BAD_REQUEST,
			)

		students = Student.objects.filter(is_active=True).select_related('group', 'group__mentor').order_by('full_name')
		if request_role(request) == 'MENTOR':
			students = students.filter(group__mentor=request.user)
		mentor_id = request.query_params.get('mentor_id')
		if mentor_id and request_role(request) in {'ADMIN', 'CURATOR'}:
			students = students.filter(group__mentor_id=mentor_id)
		attendance_counts = Attendance.objects.filter(
			student__in=students,
			date__range=(start_date, end_date),
		).values('student_id').annotate(
			total_days=Count('id'),
			present_days=Count('id', filter=Q(is_present=True)),
		)
		counts_by_student = {item['student_id']: item for item in attendance_counts}
		report_rows = []
		for student in students:
			counts = counts_by_student.get(student.id, {})
			total_days = counts['total_days'] or 0
			present_days = counts['present_days'] or 0
			report_rows.append({
				'student_id': student.id,
				'full_name': student.full_name,
				'group_name': student.group.name if student.group_id else student.group_name,
				'total_days': total_days,
				'present_days': present_days,
				'absent_days': total_days - present_days,
				'attendance_rate': round((present_days / total_days) * 100, 2)
				if total_days else 0.0,
			})

		return Response(AttendanceReportSerializer(report_rows, many=True).data)

	@action(detail=False, methods=['get'], url_path='report-pdf')
	def report_pdf(self, request):
		selected_date = parse_date(request.query_params.get('date', '')) or timezone.localdate()
		present_records = Attendance.objects.select_related('student', 'student__group', 'student__group__mentor').filter(
			date=selected_date,
			is_present=True,
			student__is_active=True,
		).order_by('student__full_name')
		if request_role(request) == 'MENTOR':
			present_records = present_records.filter(student__group__mentor=request.user)
		mentor_id = request.query_params.get('mentor_id')
		if mentor_id and request_role(request) in {'ADMIN', 'CURATOR'}:
			present_records = present_records.filter(student__group__mentor_id=mentor_id)

		font_candidates = [
			Path('C:/Windows/Fonts/arial.ttf'),
			Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
		]
		font_path = next((path for path in font_candidates if path.exists()), None)
		if font_path is None:
			return Response({'detail': 'Кирилл шрифти табылган жок.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
		font_name = 'AttendanceUnicode'
		if font_name not in pdfmetrics.getRegisteredFontNames():
			pdfmetrics.registerFont(TTFont(font_name, str(font_path)))

		response = HttpResponse(content_type='application/pdf')
		response['Content-Disposition'] = f'attachment; filename="Kelgender_Otchet_{selected_date}.pdf"'
		document = SimpleDocTemplate(response, pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm, topMargin=18 * mm, bottomMargin=18 * mm)
		styles = getSampleStyleSheet()
		styles.add(ParagraphStyle(name='CyrillicTitle', parent=styles['Title'], fontName=font_name, fontSize=16, leading=20, textColor=colors.HexColor('#24343a')))
		styles.add(ParagraphStyle(name='CyrillicBody', parent=styles['BodyText'], fontName=font_name, fontSize=10, leading=13))
		content = [
			Paragraph('Attendance Management / Күнүмдүк катышуу', styles['CyrillicTitle']),
			Paragraph(f'Дата: {selected_date} &nbsp;&nbsp; Келгендер: {present_records.count()}', styles['CyrillicBody']),
			Spacer(1, 8 * mm),
		]
		rows = [['№', 'Student Full Name / Аты-жөнү', 'Group / Тайпа', 'Attendance Status / Статус']]
		rows.extend([
				[index, record.student.full_name, record.student.group.name if record.student.group_id else record.student.group_name, 'Келди']
				for index, record in enumerate(present_records, start=1)
		])
		table = Table(rows, colWidths=[12 * mm, 78 * mm, 42 * mm, 42 * mm], repeatRows=1)
		table.setStyle(TableStyle([
			('FONTNAME', (0, 0), (-1, -1), font_name),
			('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dceee1')),
			('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#24343a')),
			('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#cbd8ce')),
			('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
			('FONTSIZE', (0, 0), (-1, -1), 9),
			('BOTTOMPADDING', (0, 0), (-1, -1), 6),
			('TOPPADDING', (0, 0), (-1, -1), 6),
		]))
		content.append(table)
		document.build(content)
		return response

	# ─────────────────────────────────────────────
	# Shared PDF helpers
	# ─────────────────────────────────────────────

	@staticmethod
	def _get_font():
		"""Register and return the Cyrillic-capable font name."""
		font_candidates = [
			Path('C:/Windows/Fonts/arial.ttf'),
			Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
		]
		font_path = next((p for p in font_candidates if p.exists()), None)
		if font_path is None:
			return None, None
		font_name = 'OkurmenUnicode'
		bold_candidates = [
			Path('C:/Windows/Fonts/arialbd.ttf'),
			Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),
		]
		bold_path = next((p for p in bold_candidates if p.exists()), None)
		font_bold = 'OkurmenUnicodeBold'
		if font_name not in pdfmetrics.getRegisteredFontNames():
			pdfmetrics.registerFont(TTFont(font_name, str(font_path)))
		if bold_path and font_bold not in pdfmetrics.getRegisteredFontNames():
			pdfmetrics.registerFont(TTFont(font_bold, str(bold_path)))
		elif not bold_path:
			font_bold = font_name  # fallback to regular
		return font_name, font_bold

	@staticmethod
	def _parse_month_year(request):
		"""Return (year, month, start_date, end_date) from ?year=&month= params."""
		today = timezone.localdate()
		try:
			year = int(request.query_params.get('year', today.year))
			month = int(request.query_params.get('month', today.month))
			if not (1 <= month <= 12):
				raise ValueError
		except (TypeError, ValueError):
			return None, None, None, None, 'year жана month туура сандар болушу керек (1-12).'
		_, last_day = calendar.monthrange(year, month)
		start_date = date_type(year, month, 1)
		end_date = date_type(year, month, last_day)
		return year, month, start_date, end_date, None

	@staticmethod
	def _build_pdf_header(styles, font_name, font_bold, title_text, subtitle_text, period_text):
		"""Return a list of flowables for the branded PDF header."""
		ORANGE = colors.HexColor('#FF6B00')
		NAVY = colors.HexColor('#0B192C')
		content = []
		# Orange top bar row
		header_data = [['  OKURMEN', period_text + '  ']]
		header_table = Table(header_data, colWidths=[100 * mm, 74 * mm])
		header_table.setStyle(TableStyle([
			('BACKGROUND', (0, 0), (-1, -1), ORANGE),
			('TEXTCOLOR', (0, 0), (-1, -1), colors.white),
			('FONTNAME', (0, 0), (-1, -1), font_bold),
			('FONTSIZE', (0, 0), (-1, -1), 11),
			('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
			('BOTTOMPADDING', (0, 0), (-1, -1), 8),
			('TOPPADDING', (0, 0), (-1, -1), 8),
			('ALIGN', (1, 0), (1, 0), 'RIGHT'),
		]))
		content.append(header_table)
		content.append(Spacer(1, 6 * mm))
		content.append(Paragraph(title_text, styles['OkTitle']))
		content.append(Paragraph(subtitle_text, styles['OkSub']))
		content.append(Spacer(1, 4 * mm))
		content.append(HRFlowable(width='100%', thickness=2, color=ORANGE))
		content.append(Spacer(1, 5 * mm))
		return content

	@staticmethod
	def _register_styles(styles, font_name, font_bold):
		NAVY = colors.HexColor('#0B192C')
		ORANGE = colors.HexColor('#FF6B00')
		if 'OkTitle' not in styles:
			styles.add(ParagraphStyle('OkTitle', fontName=font_bold, fontSize=18, leading=22, textColor=NAVY, spaceAfter=2))
		if 'OkSub' not in styles:
			styles.add(ParagraphStyle('OkSub', fontName=font_name, fontSize=10, leading=14, textColor=colors.HexColor('#5a6a7a')))
		if 'OkBody' not in styles:
			styles.add(ParagraphStyle('OkBody', fontName=font_name, fontSize=10, leading=13, textColor=NAVY))
		if 'OkSmall' not in styles:
			styles.add(ParagraphStyle('OkSmall', fontName=font_name, fontSize=8, leading=11, textColor=colors.HexColor('#5a6a7a')))
		if 'OkFooter' not in styles:
			styles.add(ParagraphStyle('OkFooter', fontName=font_name, fontSize=8, leading=10, textColor=colors.HexColor('#9aabb0'), alignment=TA_CENTER))

	# ─────────────────────────────────────────────
	# Mentor monthly PDF
	# ─────────────────────────────────────────────

	@action(detail=False, methods=['get'], url_path='mentor-monthly-pdf')
	def mentor_monthly_pdf(self, request):
		"""
		Monthly PDF for Mentor (or Admin/Curator viewing a mentor):
		  • Attendance table per group: lessons held, students present
		  • Salary calculation @ 150 KGS per attendance
		Query params: year, month, mentor_id (ADMIN/CURATOR only)
		"""
		year, month, start_date, end_date, err = self._parse_month_year(request)
		if err:
			return Response({'detail': err}, status=status.HTTP_400_BAD_REQUEST)

		role = request_role(request)
		mentor_id = request.query_params.get('mentor_id')

		# Determine whose data to fetch
		if role == 'MENTOR':
			mentor_user = request.user
		elif role in {'ADMIN', 'CURATOR'} and mentor_id:
			from django.contrib.auth import get_user_model
			User = get_user_model()
			try:
				mentor_user = User.objects.select_related('role_profile').get(pk=mentor_id)
			except User.DoesNotExist:
				return Response({'detail': 'Ментор табылган жок.'}, status=status.HTTP_404_NOT_FOUND)
		elif role in {'ADMIN', 'CURATOR'}:
			return Response({'detail': 'mentor_id параметри керек.'}, status=status.HTTP_400_BAD_REQUEST)
		else:
			return Response({'detail': 'Уруксат жок.'}, status=status.HTTP_403_FORBIDDEN)

		mentor_name = mentor_user.get_full_name() or mentor_user.username
		month_name_ru = [
			'', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
			'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
		][month]

		# Fetch attendance grouped by group
		from django.db.models import Count, Q
		group_rows = (
			Attendance.objects
			.filter(
				date__range=(start_date, end_date),
				student__group__mentor=mentor_user,
				student__is_active=True,
			)
			.values('student__group_id', 'student__group__name')
			.annotate(
				lessons_count=Count('date', distinct=True),
				present_count=Count('id', filter=Q(is_present=True)),
			)
			.order_by('student__group__name')
		)

		RATE = 150
		total_lessons = 0
		total_present = 0

		font_name, font_bold = self._get_font()
		if font_name is None:
			return Response({'detail': 'Кирилл шрифти табылган жок.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

		response = HttpResponse(content_type='application/pdf')
		safe_name = mentor_name.replace(' ', '_')
		response['Content-Disposition'] = f'attachment; filename="Mentor_Report_{safe_name}_{year}_{month:02d}.pdf"'
		doc = SimpleDocTemplate(
			response, pagesize=A4,
			rightMargin=18 * mm, leftMargin=18 * mm,
			topMargin=18 * mm, bottomMargin=18 * mm,
		)
		styles = getSampleStyleSheet()
		self._register_styles(styles, font_name, font_bold)

		ORANGE = colors.HexColor('#FF6B00')
		NAVY = colors.HexColor('#0B192C')
		LIGHT_ORANGE = colors.HexColor('#FFF4EB')
		LIGHT_GRAY = colors.HexColor('#F5F7F5')

		content = self._build_pdf_header(
			styles, font_name, font_bold,
			title_text=f'Менторлук отчет: {mentor_name}',
			subtitle_text=f'Айлык жыйынтык · {month_name_ru} {year}',
			period_text=f'{start_date} – {end_date}',
		)

		# Groups table
		header_row = ['Тайпа', 'Өткөрүлгөн сабак', 'Келгендер', 'Жалпы эсеп (150 сом)']
		table_data = [header_row]
		for row in group_rows:
			lessons = row['lessons_count'] or 0
			present = row['present_count'] or 0
			salary = present * RATE
			total_lessons += lessons
			total_present += present
			table_data.append([
				row['student__group__name'] or '—',
				str(lessons),
				str(present),
				f'{salary:,} KGS'.replace(',', ' '),
			])

		# Totals row
		total_salary = total_present * RATE
		table_data.append([
			'ЖАЛПЫ',
			str(total_lessons),
			str(total_present),
			f'{total_salary:,} KGS'.replace(',', ' '),
		])

		col_widths = [74 * mm, 32 * mm, 28 * mm, 40 * mm]
		groups_table = Table(table_data, colWidths=col_widths, repeatRows=1)
		n = len(table_data)
		groups_table.setStyle(TableStyle([
			# Header
			('BACKGROUND', (0, 0), (-1, 0), NAVY),
			('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
			('FONTNAME', (0, 0), (-1, 0), font_bold),
			('FONTSIZE', (0, 0), (-1, 0), 9),
			('ALIGN', (0, 0), (-1, 0), 'CENTER'),
			# Body
			('FONTNAME', (0, 1), (-1, -1), font_name),
			('FONTSIZE', (0, 1), (-1, -1), 9),
			('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, LIGHT_GRAY]),
			# Totals row
			('BACKGROUND', (0, -1), (-1, -1), LIGHT_ORANGE),
			('FONTNAME', (0, -1), (-1, -1), font_bold),
			('TEXTCOLOR', (0, -1), (-1, -1), NAVY),
			# Grid
			('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#dde4e0')),
			('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
			('BOTTOMPADDING', (0, 0), (-1, -1), 7),
			('TOPPADDING', (0, 0), (-1, -1), 7),
			('ALIGN', (1, 0), (-1, -1), 'CENTER'),
			('ALIGN', (0, 1), (0, -1), 'LEFT'),
			# Highlight totals salary in orange
			('TEXTCOLOR', (-1, -1), (-1, -1), ORANGE),
		]))
		content.append(groups_table)
		content.append(Spacer(1, 8 * mm))

		# Summary box
		summary_data = [
			['Айлык зарплата эсеби', ''],
			[f'Жалпы келгендер:', f'{total_present} окуучу'],
			[f'Ставка:', f'150 KGS / катышуу'],
			[f'Эсептелген зарплата:', f'{total_salary:,} KGS'.replace(',', ' ')],
		]
		summary_table = Table(summary_data, colWidths=[90 * mm, 60 * mm])
		summary_table.setStyle(TableStyle([
			('BACKGROUND', (0, 0), (-1, 0), ORANGE),
			('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
			('FONTNAME', (0, 0), (-1, 0), font_bold),
			('FONTSIZE', (0, 0), (-1, 0), 10),
			('SPAN', (0, 0), (1, 0)),
			('ALIGN', (0, 0), (-1, 0), 'CENTER'),
			('FONTNAME', (0, 1), (-1, -1), font_name),
			('FONTSIZE', (0, 1), (-1, -1), 10),
			('FONTNAME', (-1, -1), (-1, -1), font_bold),
			('TEXTCOLOR', (-1, -1), (-1, -1), ORANGE),
			('FONTSIZE', (-1, -1), (-1, -1), 11),
			('ROWBACKGROUNDS', (0, 1), (-1, -1), [LIGHT_GRAY, colors.white]),
			('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#dde4e0')),
			('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
			('BOTTOMPADDING', (0, 0), (-1, -1), 7),
			('TOPPADDING', (0, 0), (-1, -1), 7),
			('ALIGN', (1, 1), (1, -1), 'RIGHT'),
		]))
		content.append(summary_table)
		content.append(Spacer(1, 6 * mm))
		content.append(Paragraph(f'Документ түзүлгөн: {timezone.localdate()}  ·  Okurmen Платформасы', styles['OkFooter']))
		doc.build(content)
		return response

	# ─────────────────────────────────────────────
	# Curator monthly PDF
	# ─────────────────────────────────────────────

	@action(detail=False, methods=['get'], url_path='curator-monthly-pdf')
	def curator_monthly_pdf(self, request):
		"""
		Monthly PDF for Curator / Admin:
		  • Per-mentor group: list of students, attendance %, status (online/offline/absent)
		  • Contact info (phone)
		Query params: year, month, mentor_id (optional filter)
		"""
		year, month, start_date, end_date, err = self._parse_month_year(request)
		if err:
			return Response({'detail': err}, status=status.HTTP_400_BAD_REQUEST)

		role = request_role(request)
		if role not in {'ADMIN', 'CURATOR'}:
			return Response({'detail': 'Куратор же Администратордун уруксаты керек.'}, status=status.HTTP_403_FORBIDDEN)

		mentor_id = request.query_params.get('mentor_id')

		students_qs = (
			Student.objects.filter(is_active=True)
			.select_related('group', 'group__mentor')
			.order_by('group__mentor__first_name', 'group__name', 'full_name')
		)
		if mentor_id:
			students_qs = students_qs.filter(group__mentor_id=mentor_id)

		# Attendance stats for the month
		attendance_qs = (
			Attendance.objects
			.filter(student__in=students_qs, date__range=(start_date, end_date))
			.values('student_id')
			.annotate(
				total_days=Count('id'),
				present_days=Count('id', filter=Q(is_present=True)),
				online_days=Count('id', filter=Q(is_present=True, attendance_type='ONLINE')),
				offline_days=Count('id', filter=Q(is_present=True, attendance_type='OFFLINE')),
			)
		)
		stats_map = {item['student_id']: item for item in attendance_qs}

		month_name_ru = [
			'', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
			'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
		][month]

		font_name, font_bold = self._get_font()
		if font_name is None:
			return Response({'detail': 'Кирилл шрифти табылган жок.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

		response = HttpResponse(content_type='application/pdf')
		response['Content-Disposition'] = f'attachment; filename="Curator_Report_{year}_{month:02d}.pdf"'
		doc = SimpleDocTemplate(
			response, pagesize=A4,
			rightMargin=18 * mm, leftMargin=18 * mm,
			topMargin=18 * mm, bottomMargin=18 * mm,
		)
		styles = getSampleStyleSheet()
		self._register_styles(styles, font_name, font_bold)

		ORANGE = colors.HexColor('#FF6B00')
		NAVY = colors.HexColor('#0B192C')
		LIGHT_BLUE = colors.HexColor('#EBF4FF')
		LIGHT_GRAY = colors.HexColor('#F5F7F5')

		content = self._build_pdf_header(
			styles, font_name, font_bold,
			title_text='Куратордук отчет',
			subtitle_text=f'Студенттердин катышуу статистикасы · {month_name_ru} {year}',
			period_text=f'{start_date} – {end_date}',
		)

		# Group students by mentor+group
		from itertools import groupby
		from operator import attrgetter

		# Build rows grouped by group
		current_group_id = None
		table_data = []
		header_row = ['№', 'Студент', 'Телефон', 'Сабак', 'Келди', 'Онлайн', 'Оффлайн', '%']

		for student in students_qs:
			group_id = student.group_id
			group_name = student.group.name if student.group_id else student.group_name
			mentor_name = (student.group.mentor.get_full_name() or student.group.mentor.username) if student.group_id else '—'

			if group_id != current_group_id:
				current_group_id = group_id
				# Group header row
				table_data.append([f'Ментор: {mentor_name}  |  Тайпа: {group_name}', '', '', '', '', '', '', ''])

			stats = stats_map.get(student.id, {})
			total = stats.get('total_days', 0)
			present = stats.get('present_days', 0)
			online = stats.get('online_days', 0)
			offline = stats.get('offline_days', 0)
			rate = round(present / total * 100, 1) if total else 0.0

			# Row number within table_data (excluding group headers)
			row_num = sum(1 for r in table_data if len(r) > 0 and r[0] != '' and not str(r[0]).startswith('Ментор:'))
			table_data.append([
				str(row_num + 1),
				student.full_name,
				student.phone or '—',
				str(total),
				str(present),
				str(online),
				str(offline),
				f'{rate}%',
			])

		if not table_data:
			content.append(Paragraph('Бул мезгилде студент маалыматтары табылган жок.', styles['OkBody']))
		else:
			col_widths = [9 * mm, 55 * mm, 30 * mm, 14 * mm, 14 * mm, 16 * mm, 16 * mm, 20 * mm]
			# Insert column header before first data row
			all_rows = [header_row] + table_data
			table = Table(all_rows, colWidths=col_widths, repeatRows=1)

			style_cmds = [
				# Global
				('FONTNAME', (0, 0), (-1, -1), font_name),
				('FONTSIZE', (0, 0), (-1, -1), 8),
				('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
				('BOTTOMPADDING', (0, 0), (-1, -1), 5),
				('TOPPADDING', (0, 0), (-1, -1), 5),
				('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor('#dde4e0')),
				# Column header row
				('BACKGROUND', (0, 0), (-1, 0), NAVY),
				('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
				('FONTNAME', (0, 0), (-1, 0), font_bold),
				('ALIGN', (0, 0), (-1, 0), 'CENTER'),
			]

			# Style group header rows and alternating data rows
			for i, row in enumerate(all_rows[1:], start=1):
				if str(row[0]).startswith('Ментор:'):
					style_cmds += [
						('BACKGROUND', (0, i), (-1, i), LIGHT_BLUE),
						('FONTNAME', (0, i), (-1, i), font_bold),
						('TEXTCOLOR', (0, i), (-1, i), NAVY),
						('SPAN', (0, i), (-1, i)),
						('FONTSIZE', (0, i), (-1, i), 8),
					]
				else:
					if i % 2 == 0:
						style_cmds.append(('BACKGROUND', (0, i), (-1, i), LIGHT_GRAY))
					# Highlight attendance rate
					try:
						rate_val = float(str(row[-1]).replace('%', ''))
						if rate_val >= 80:
							style_cmds.append(('TEXTCOLOR', (-1, i), (-1, i), colors.HexColor('#2e7d32')))
						elif rate_val >= 50:
							style_cmds.append(('TEXTCOLOR', (-1, i), (-1, i), ORANGE))
						else:
							style_cmds.append(('TEXTCOLOR', (-1, i), (-1, i), colors.HexColor('#c62828')))
					except ValueError:
						pass

			table.setStyle(TableStyle(style_cmds))
			content.append(table)

		content.append(Spacer(1, 8 * mm))
		total_students = students_qs.count()
		content.append(Paragraph(f'Жалпы студент саны: {total_students}  ·  Отчет мезгили: {start_date} – {end_date}', styles['OkBody']))
		content.append(Spacer(1, 3 * mm))
		content.append(Paragraph(f'Документ түзүлгөн: {timezone.localdate()}  ·  Okurmen Платформасы', styles['OkFooter']))
		doc.build(content)
		return response


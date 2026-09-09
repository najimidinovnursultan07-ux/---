from django.db import transaction
from datetime import timedelta
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
from reportlab.platypus import SimpleDocTemplate, Spacer, Table, TableStyle, Paragraph

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
			return [IsMentor()]
		if self.action == 'report':
			return [IsCurator()]
		if self.action == 'report_pdf':
			return [IsApprovedUser()]
		if self.action == 'save_mode':
			return [IsMentor()]
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
		if request_role(self.request) == 'MENTOR' and any(
			not record['student'].group_id or record['student'].group.mentor_id != self.request.user.id
			for record in records
		):
			return Response({'detail': 'Башка ментордун окуучуларынын катышуусун өзгөртө албайсыз.'}, status=status.HTTP_403_FORBIDDEN)
		return None

	def _prepare_day(self, selected_date):
		today = timezone.localdate()
		Attendance.objects.filter(date__lt=today, is_locked=False).update(is_locked=True)
		if selected_date == today:
			students = Student.objects.filter(is_active=True)
			Attendance.objects.bulk_create(
				[Attendance(student=student, date=today) for student in students],
				ignore_conflicts=True,
			)

	@action(detail=False, methods=['post'], url_path='save-bulk')
	def save_bulk(self, request):
		serializer = AttendanceBulkSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		permission_response = self._assert_mentor_students(serializer.validated_data['records'])
		if permission_response:
			return permission_response

		saved_records = []
		selected_date = serializer.validated_data['date']
		self._prepare_day(selected_date)
		if selected_date != timezone.localdate():
			return Response({'detail': 'Өткөн күндөр архивделип, өзгөртүүгө жабылган.'}, status=status.HTTP_409_CONFLICT)
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
		if selected_date != timezone.localdate():
			return Response({'detail': 'Өткөн күндөр архивделип, өзгөртүүгө жабылган.'}, status=status.HTTP_409_CONFLICT)

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

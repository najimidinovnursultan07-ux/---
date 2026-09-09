from rest_framework import serializers

from django.contrib.auth import get_user_model

from .models import Attendance, Student, StudentGroup

User = get_user_model()


class StudentGroupSerializer(serializers.ModelSerializer):
    mentor_id = serializers.PrimaryKeyRelatedField(
        source='mentor',
        queryset=User.objects.filter(is_active=True),
        required=False,
    )
    mentor_name = serializers.SerializerMethodField(read_only=True)
    student_count = serializers.SerializerMethodField()

    class Meta:
        model = StudentGroup
        fields = ['id', 'name', 'mentor_id', 'mentor_name', 'student_count', 'created_at']
        read_only_fields = ['id', 'mentor_name', 'student_count', 'created_at']

    def get_mentor_name(self, group):
        return group.mentor.get_full_name() or group.mentor.email or group.mentor.username

    def get_student_count(self, group):
        if hasattr(group, '_active_students'):
            return len(group._active_students)
        return group.students.filter(is_active=True).count()


class StudentSerializer(serializers.ModelSerializer):
    group_name = serializers.SerializerMethodField()
    group_id = serializers.PrimaryKeyRelatedField(
        source='group',
        queryset=StudentGroup.objects.all(),
        required=False,
        allow_null=True,
    )
    mentor_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Student
        fields = ['id', 'full_name', 'group_id', 'group_name', 'mentor_name', 'phone', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_mentor_name(self, student):
        if not student.group_id:
            return ''
        return student.group.mentor.get_full_name() or student.group.mentor.email

    def get_group_name(self, student):
        return student.group.name if student.group_id else student.group_name


class AttendanceSerializer(serializers.ModelSerializer):
    student_id = serializers.IntegerField(source='student.id', read_only=True)
    full_name = serializers.CharField(source='student.full_name', read_only=True)
    group_name = serializers.SerializerMethodField()

    def get_group_name(self, attendance):
        return attendance.student.group.name if attendance.student.group_id else attendance.student.group_name

    class Meta:
        model = Attendance
        fields = ['id', 'student_id', 'full_name', 'group_name', 'date', 'is_present', 'attendance_type', 'is_locked']


class AttendanceHistoryStudentSerializer(serializers.Serializer):
    student_id = serializers.IntegerField()
    full_name = serializers.CharField()
    days = serializers.ListField(child=serializers.BooleanField())
    attendance_rate = serializers.FloatField()


class AttendanceBulkRecordSerializer(serializers.Serializer):
    student_id = serializers.PrimaryKeyRelatedField(
        source='student',
        queryset=Student.objects.filter(is_active=True),
    )
    is_present = serializers.BooleanField()


class AttendanceBulkSerializer(serializers.Serializer):
    date = serializers.DateField()
    records = AttendanceBulkRecordSerializer(many=True)


class AttendanceModeRecordSerializer(serializers.Serializer):
    student_id = serializers.PrimaryKeyRelatedField(
        source='student',
        queryset=Student.objects.filter(is_active=True),
    )
    attendance_type = serializers.ChoiceField(choices=Attendance.AttendanceType.choices)


class AttendanceModeBulkSerializer(serializers.Serializer):
    date = serializers.DateField()
    records = AttendanceModeRecordSerializer(many=True)


class AttendanceReportSerializer(serializers.Serializer):
    student_id = serializers.IntegerField()
    full_name = serializers.CharField()
    group_name = serializers.CharField()
    total_days = serializers.IntegerField()
    present_days = serializers.IntegerField()
    absent_days = serializers.IntegerField()
    attendance_rate = serializers.FloatField()

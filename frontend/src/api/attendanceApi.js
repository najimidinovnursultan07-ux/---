import axiosInstance from "./axiosInstance";

function unwrapResults(payload) {
  return Array.isArray(payload) ? payload : payload.results ?? [];
}

export async function fetchStudents(groupId, mentorId) {
  const { data } = await axiosInstance.get("/students/", {
    params: { ...(groupId ? { group_id: groupId } : {}), ...(mentorId ? { mentor_id: mentorId } : {}) },
  });
  return unwrapResults(data).sort((first, second) =>
    first.full_name.localeCompare(second.full_name, "ky"),
  );
}

export async function fetchGroups(mentorId) {
  const { data } = await axiosInstance.get("/groups/", {
    params: mentorId ? { mentor_id: mentorId } : undefined,
  });
  return unwrapResults(data);
}

export async function createGroup(group) {
  const { data } = await axiosInstance.post("/groups/", group);
  return data;
}

export async function deleteGroup(groupId) {
  await axiosInstance.delete(`/groups/${groupId}/`);
}

export async function fetchAttendance(date, mentorId) {
  const { data } = await axiosInstance.get("/attendance/", {
    params: { date, ...(mentorId ? { mentor_id: mentorId } : {}) },
  });
  return unwrapResults(data);
}

export async function saveAttendance(date, records) {
  const { data } = await axiosInstance.post("/attendance/save-bulk/", {
    date,
    records,
  });
  return data;
}

export async function createStudent(student) {
  const { data } = await axiosInstance.post("/students/", student);
  return data;
}

export async function updateStudent(studentId, student) {
  const { data } = await axiosInstance.patch(`/students/${studentId}/`, student);
  return data;
}

export async function deleteStudent(studentId) {
  await axiosInstance.delete(`/students/${studentId}/`);
}

export async function fetchAttendanceReport(startDate, endDate) {
  const { data } = await axiosInstance.get("/attendance/report/", {
    params: { start_date: startDate, end_date: endDate },
  });
  return unwrapResults(data);
}

export async function fetchAttendanceHistory(months = 3) {
  const { data } = await axiosInstance.get("/attendance/history/", { params: { months } });
  return data;
}

export async function saveAttendanceModes(date, records) {
  const { data } = await axiosInstance.post("/attendance/save-mode/", { date, records });
  return data;
}

export async function downloadAttendancePdf(date) {
  const response = await axiosInstance.get("/attendance/report-pdf/", {
    params: { date },
    responseType: "blob",
  });
  return response.data;
}

export async function fetchSalaryRows(startDate, endDate) {
  const { data } = await axiosInstance.get("/finance/salaries/", {
    params: { start_date: startDate, end_date: endDate },
  });
  return data;
}

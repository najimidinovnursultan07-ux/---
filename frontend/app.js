const API_BASE_URL = "https://mentor-0qlv.onrender.com/api";

const state = {
    students: [],
    attendance: new Map(),
    saveTimer: null,
};

const dateInput = document.getElementById("attendance-date");
const studentList = document.getElementById("student-list");
const countElement = document.getElementById("count");
const totalElement = document.getElementById("total");
const tableDateElement = document.getElementById("table-date");
const saveButton = document.getElementById("save-button");
const saveStatus = document.getElementById("save-status");
const errorMessage = document.getElementById("error-message");

function getToday() {
    const today = new Date();
    const timezoneOffset = today.getTimezoneOffset() * 60000;
    return new Date(today.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

function setStatus(message, statusClass = "") {
    saveStatus.textContent = message;
    saveStatus.className = `save-status ${statusClass}`.trim();
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.hidden = false;
}

function clearError() {
    errorMessage.hidden = true;
    errorMessage.textContent = "";
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, {
        headers: { "Content-Type": "application/json", ...options.headers },
        ...options,
    });
    if (!response.ok) {
        let detail = `Ката: ${response.status}`;
        try {
            const payload = await response.json();
            detail = payload.detail || detail;
        } catch (error) {
            console.warn("Could not parse API error response", error);
        }
        throw new Error(detail);
    }
    return response.status === 204 ? null : response.json();
}

function normalizeList(payload) {
    return Array.isArray(payload) ? payload : (payload.results || []);
}

function updateCounter() {
    const presentCount = state.students.reduce(
        (count, student) => count + (state.attendance.get(student.id) ? 1 : 0),
        0,
    );
    countElement.textContent = presentCount;
    totalElement.textContent = state.students.length;
}

function renderTable() {
    if (!state.students.length) {
        studentList.innerHTML = '<tr><td class="empty-state" colspan="4">Окуучулар табылган жок.</td></tr>';
        updateCounter();
        return;
    }

    studentList.innerHTML = state.students.map((student, index) => {
        const isPresent = Boolean(state.attendance.get(student.id));
        return `
            <tr data-student-id="${student.id}">
                <td class="number-column">${index + 1}</td>
                <td>${escapeHtml(student.full_name)}</td>
                <td class="attendance-column">
                    <input class="attendance-check" type="checkbox" aria-label="${escapeHtml(student.full_name)} катышты" ${isPresent ? "checked" : ""}>
                </td>
                <td class="status-column"><span class="badge ${isPresent ? "present" : "absent"}">${isPresent ? "Келди" : "Келген жок"}</span></td>
            </tr>
        `;
    }).join("");
    updateCounter();
}

function escapeHtml(value) {
    return value.replace(/[&<>'"]/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;",
    }[character]));
}

async function fetchStudents() {
    const payload = await requestJson(`${API_BASE_URL}/students/`);
    state.students = normalizeList(payload);
    state.students.sort((first, second) => first.full_name.localeCompare(second.full_name, "ky"));
    totalElement.textContent = state.students.length;
}

async function fetchAttendance(date) {
    const payload = await requestJson(`${API_BASE_URL}/attendance/?date=${encodeURIComponent(date)}`);
    state.attendance = new Map(normalizeList(payload).map((record) => [record.student_id, record.is_present]));
    renderTable();
}

async function saveAttendance() {
    clearError();
    setStatus("Сакталууда...", "is-saving");
    saveButton.disabled = true;

    try {
        await requestJson(`${API_BASE_URL}/attendance/save-bulk/`, {
            method: "POST",
            body: JSON.stringify({
                date: dateInput.value,
                records: state.students.map((student) => ({
                    student_id: student.id,
                    is_present: Boolean(state.attendance.get(student.id)),
                })),
            }),
        });
        setStatus("Сакталды", "is-saved");
    } catch (error) {
        console.error("Attendance save failed", error);
        setStatus("Сактоо ишке ашкан жок", "is-error");
        showError("Маалыматты сактоо мүмкүн болгон жок. Django серверин текшериңиз.");
    } finally {
        saveButton.disabled = false;
    }
}

function scheduleAutoSave() {
    window.clearTimeout(state.saveTimer);
    setStatus("Өзгөрүү бар", "is-saving");
    state.saveTimer = window.setTimeout(saveAttendance, 700);
}

async function loadDate(date) {
    clearError();
    tableDateElement.textContent = date;
    state.attendance = new Map();
    renderTable();
    setStatus("Жүктөлүүдө...", "is-saving");
    try {
        await fetchAttendance(date);
        setStatus("Даяр");
    } catch (error) {
        console.error("Attendance load failed", error);
        setStatus("Жүктөө ишке ашкан жок", "is-error");
        showError("Маалыматты жүктөө мүмкүн болгон жок. Django сервери иштеп жатканын текшериңиз.");
    }
}

studentList.addEventListener("change", (event) => {
    if (!event.target.classList.contains("attendance-check")) return;
    const row = event.target.closest("tr");
    const studentId = Number(row.dataset.studentId);
    const isPresent = event.target.checked;
    state.attendance.set(studentId, isPresent);
    const badge = row.querySelector(".badge");
    badge.textContent = isPresent ? "Келди" : "Келген жок";
    badge.className = `badge ${isPresent ? "present" : "absent"}`;
    updateCounter();
    scheduleAutoSave();
});

dateInput.addEventListener("change", () => loadDate(dateInput.value));
saveButton.addEventListener("click", saveAttendance);

async function initialize() {
    dateInput.value = getToday();
    tableDateElement.textContent = dateInput.value;
    try {
        await fetchStudents();
        await loadDate(dateInput.value);
    } catch (error) {
        console.error("Application initialization failed", error);
        setStatus("Туташуу жок", "is-error");
        showError("Окуучуларды жүктөө мүмкүн болгон жок. API дарегин жана Django серверин текшериңиз.");
        studentList.innerHTML = '<tr><td class="empty-state" colspan="4">Маалыматты жүктөөдө ката кетти.</td></tr>';
    }
}

initialize();

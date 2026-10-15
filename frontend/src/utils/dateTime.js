export const REPORT_TIME_ZONE = "Asia/Bishkek";

function getDateTimeParts(date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: REPORT_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
}

export function getBishkekDate(date = new Date()) {
  const { year, month, day } = getDateTimeParts(date);
  return `${year}-${month}-${day}`;
}

export function getBishkekYearMonth(date = new Date()) {
  const { year, month } = getDateTimeParts(date);
  return { year: Number(year), month: Number(month) };
}

export function formatBishkekDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const { year, month, day, hour, minute } = getDateTimeParts(date);
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function toBishkekDateTime(reportDate, time) {
  const localDateTime = `${reportDate}T${time}`;
  const value = `${localDateTime}:00+06:00`;
  const parsedDate = new Date(value);
  if (
    Number.isNaN(parsedDate.getTime())
    || formatBishkekDateTimeInput(value) !== localDateTime
  ) {
    return null;
  }
  return value;
}

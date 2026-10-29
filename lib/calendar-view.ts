export type CalendarView = "day" | "week" | "month";
export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function calendarRange(anchor: Date, view: CalendarView) {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  if (view === "month") {
    start.setDate(1);
    start.setDate(start.getDate() - start.getDay());
  }
  if (view === "week") start.setDate(start.getDate() - start.getDay());
  const count = view === "month" ? 42 : view === "week" ? 7 : 1;
  const days = Array.from({ length: count }, (_, index) => {
    const day = new Date(start);
    day.setDate(day.getDate() + index);
    return day;
  });
  const end = new Date(start);
  end.setDate(end.getDate() + count);
  return { start, end, days };
}
export function eventOverlapsDay(
  event: {
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
  },
  day: Date,
) {
  const parse = (value?: { dateTime?: string; date?: string }) =>
    value?.dateTime
      ? new Date(value.dateTime)
      : value?.date
        ? new Date(value.date + "T00:00:00")
        : null;
  const start = parse(event.start),
    end = parse(event.end),
    midnight = new Date(day);
  midnight.setHours(0, 0, 0, 0);
  const next = new Date(midnight);
  next.setDate(next.getDate() + 1);
  return !!start && !!end && start < next && end > midnight;
}
export function localDateTimeInput(instant: string | Date) {
  const date = new Date(instant);
  return `${localDateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export function formatTripDateRange(
  startDate: string | null,
  endDate: string | null
): string | null {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (!start && !end) return null;
  if (!start) return formatFullDate(end!);
  if (!end || isSameDate(start, end)) return formatFullDate(start);
  if (start.year !== end.year) return `${formatFullDate(start)} – ${formatFullDate(end)}`;

  return `${formatMonthDay(start)} – ${formatMonthDay(end)}, ${end.year}`;
}

function parseDateOnly(value: string | null): CalendarDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    return null;
  }

  return { year, month, day };
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isSameDate(left: CalendarDate, right: CalendarDate): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

function formatMonthDay(date: CalendarDate): string {
  return `${MONTHS[date.month - 1]} ${date.day}`;
}

function formatFullDate(date: CalendarDate): string {
  return `${formatMonthDay(date)}, ${date.year}`;
}

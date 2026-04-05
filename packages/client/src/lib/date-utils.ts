/**
 * Returns the ISO string of Monday midnight UTC for the week
 * `offsetWeeks` weeks from the current week.
 */
export function getWeekStart(offsetWeeks = 0): string {
  const now = new Date();
  // getUTCDay(): 0=Sun, 1=Mon, …, 6=Sat
  const day = now.getUTCDay();
  // Days to subtract to reach Monday (if day=0/Sun, subtract 6; otherwise day-1)
  const daysToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysToMonday + offsetWeeks * 7),
  );
  return monday.toISOString();
}

/**
 * Returns an array of 7 ISO date strings (Mon–Sun) for the week
 * beginning on `weekStart`.
 */
export function getWeekDays(weekStart: string): string[] {
  const start = new Date(weekStart);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d.toISOString();
  });
}

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Returns a label like "Mon 6 Apr" for a given ISO date string. */
export function formatDayLabel(isoDate: string): string {
  const d = new Date(isoDate);
  const day = SHORT_DAYS[d.getUTCDay()];
  const date = d.getUTCDate();
  const month = SHORT_MONTHS[d.getUTCMonth()];
  return `${day} ${date} ${month}`;
}

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
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysToMonday + offsetWeeks * 7,
    ),
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
];

/** Returns a label like "Mon 6 Apr" for a given ISO date string. */
export function formatDayLabel(isoDate: string): string {
  const d = new Date(isoDate);
  const day = SHORT_DAYS[d.getUTCDay()];
  const date = d.getUTCDate();
  const month = SHORT_MONTHS[d.getUTCMonth()];
  return `${day} ${date} ${month}`;
}

/**
 * UTC calendar-day number (1-31) of an ISO date string. Shared by the week
 * grid and the phone day strip (spec 010 research D4) so both read the same
 * date the same way — the app is deliberately UTC-anchored end to end.
 */
export function dayNumber(iso: string): number {
  return new Date(iso).getUTCDate();
}

/** UTC day-of-week index (0=Sun … 6=Sat) of an ISO date string. */
export function dowIndex(iso: string): number {
  return new Date(iso).getUTCDay();
}

/**
 * The user's **local** calendar day as a `YYYY-MM-DD` key on the UTC-midnight axis
 * that meal-plan entries are stored on (`getWeekDays` builds them with `Date.UTC`).
 *
 * Deliberately NOT `new Date().toISOString().slice(0, 10)`: that yields the *UTC*
 * date, which is a day behind the user's own date for the first hours of every day
 * in any positive-offset timezone (e.g. 09:00 AEST on Sun 26 Jul is still Sat 25 Jul
 * in UTC). Because this value decides which day the calendar treats as "today" — the
 * grid's today marker and the phone day strip's default selection (spec 010
 * FR-RS-012) — being a day out means landing the user on yesterday and letting them
 * plan meals against the wrong date.
 *
 * Taking the local Y/M/D and re-projecting it onto the UTC axis compares calendar day
 * to calendar day, mirroring the server's `startOfTodayCutoff()` (spec 008 research
 * D3) so both ends of the app agree on what "today" means.
 */
export function todayUtcDate(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    .toISOString()
    .slice(0, 10);
}

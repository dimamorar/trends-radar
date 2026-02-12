/**
 * Time utilities
 */

/**
 * Get current time in specified timezone
 */
export function getConfiguredTime(timezone: string): Date {
  const now = new Date();
  // Create a date string in the target timezone
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };

  const formatter = new Intl.DateTimeFormat('en-CA', options);
  const parts = formatter.formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value || '0';

  return new Date(
    parseInt(get('year'), 10),
    parseInt(get('month'), 10) - 1,
    parseInt(get('day'), 10),
    parseInt(get('hour'), 10),
    parseInt(get('minute'), 10),
    parseInt(get('second'), 10),
  );
}

/**
 * Format date for folder name (YYYY-MM-DD)
 */
export function formatDateFolder(timezone: string): string {
  const now = getConfiguredTime(timezone);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Format a specific date in a timezone (YYYY-MM-DD)
 */
export function formatDateInTimezone(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Check if a date falls on the target day in a timezone
 */
export function isSameDateInTimezone(date: Date, targetDate: string, timezone: string): boolean {
  return formatDateInTimezone(date, timezone) === targetDate;
}

/**
 * Format time for filename (HH-MM)
 */
export function formatTimeFilename(timezone: string): string {
  const now = getConfiguredTime(timezone);
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}-${minutes}`;
}

/**
 * Get current time display (HH:MM)
 */
export function getCurrentTimeDisplay(timezone: string): string {
  const now = getConfiguredTime(timezone);
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Convert HH-MM to HH:MM
 */
export function convertTimeForDisplay(timeStr: string): string {
  return timeStr.replace('-', ':');
}

/**
 * Get ISO string in timezone
 */
export function getIsoInTimezone(timezone: string): string {
  const now = getConfiguredTime(timezone);
  return now.toISOString();
}

/**
 * Parse date string to Date object
 */
export function parseDate(dateStr: string): Date | null {
  const parsed = new Date(dateStr);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Format date for display
 */
export function formatDateDisplay(date: Date, timezone: string): string {
  return date.toLocaleString('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Get time difference in hours
 */
export function getHoursDiff(date1: Date, date2: Date): number {
  return Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60 * 60);
}

/**
 * Check if date is within last N days
 */
export function isWithinDays(date: Date, days: number): boolean {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  return diff <= days * dayMs;
}

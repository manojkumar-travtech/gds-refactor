/**
 * Parses a Sabre date string into day, monthIndex, and full year
 * @param dateStr - Date string like 01JAN, 01JAN23, 01JAN2023
 * @returns Object with day, monthIndex, year or null if invalid
 */
const parseSabreDateComponents = (
  dateStr: string,
): { day: number; monthIndex: number; year: number } | null => {
  if (!dateStr) return null;

  const match = dateStr.match(/^(\d{1,2})([A-Z]{3})(\d{2,4})?$/i);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const monthStr = match[2].toUpperCase();
  const yearStr = match[3];

  const monthNames = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  const monthIndex = monthNames.indexOf(monthStr);
  if (monthIndex === -1) return null;

  const year = yearStr
    ? yearStr.length === 2
      ? 2000 + parseInt(yearStr, 10)
      : parseInt(yearStr, 10)
    : new Date().getFullYear();

  return { day, monthIndex, year };
};

/**
 * Parses a Sabre date and time into a JavaScript Date object
 * @param dateStr - Date string like 19JAN or 19JAN26
 * @param timeStr - Time string HHMM (optional)
 * @param defaultTime - Default time if timeStr not provided (default '00:00')
 */
const parseSabreDateTime = (
  dateStr: string | undefined,
  timeStr?: string,
  defaultTime: string = "00:00",
): Date | null => {
  if (!dateStr) {
    return null;
  }
  const components = parseSabreDateComponents(dateStr);
  if (!components) return null;

  let hours = 0,
    minutes = 0;

  if (timeStr) {
    const timeMatch = timeStr.match(/^(\d{1,2})(\d{2})$/);
    if (timeMatch) {
      hours = parseInt(timeMatch[1], 10);
      minutes = parseInt(timeMatch[2], 10);
    }
  } else if (defaultTime) {
    const [h, m] = defaultTime.split(":");
    hours = parseInt(h, 10);
    minutes = parseInt(m, 10);
  }

  return new Date(
    components.year,
    components.monthIndex,
    components.day,
    hours,
    minutes,
  );
};

/**
 * Parses a Sabre date string into ISO date format (YYYY-MM-DD)
 * @param dateStr - Date string like 01JAN, 01JAN23, 01JAN2023
 */
const parseSabreDate = (dateStr: string | null): string | null => {
  if (!dateStr) {
    return null;
  }
  const components = parseSabreDateComponents(dateStr);
  if (!components) return null;

  const date = new Date(components.year, components.monthIndex, components.day);
  return isNaN(date.getTime()) ? null : date.toISOString().split("T")[0];
};

export { parseSabreDateTime, parseSabreDate };

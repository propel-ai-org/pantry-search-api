// ABOUTME: Utilities for formatting and cleaning hours strings
// ABOUTME: Removes closed days from hours strings for cleaner output

/**
 * Cleans hours strings by removing days that are closed.
 * Handles various formats including semicolon-separated and newline-separated.
 *
 * @param hours - Raw hours string from Google Places or other sources
 * @returns Cleaned string with only open days
 */
export function cleanHours(hours: string | null | undefined): string {
  if (!hours) return "";

  // Split by semicolon or newline
  const delimiter = hours.includes(';') ? ';' : '\n';
  const days = hours.split(delimiter).map(day => day.trim());

  // Filter out days that are closed (case insensitive)
  const openDays = days.filter(day => {
    if (!day) return false;
    const lowerDay = day.toLowerCase();
    // Check if the day contains "closed" but not other hour information
    return !lowerDay.match(/:\s*closed\s*$/i);
  });

  // Rejoin with semicolon and space
  return openDays.join('; ');
}

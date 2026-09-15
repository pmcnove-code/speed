/**
 * Generates a clean, human-readable label for a video (reel job).
 * Format: {Persona Name} - {DD/MM/YYYY} - {N}
 * Where N is the Nth video generated for that persona on that day.
 *
 * @param personaName The persona's display name
 * @param createdAt The date the video was created
 * @param dailyIndex 1-based index of this video among all that persona's videos created that same day
 * @returns e.g., "Alex Carter - 13/09/2026 - 3"
 */
export function formatVideoLabel(
  personaName: string,
  createdAt: Date,
  dailyIndex: number
): string {
  const day = createdAt.getDate().toString().padStart(2, "0");
  const month = (createdAt.getMonth() + 1).toString().padStart(2, "0");
  const year = createdAt.getFullYear();
  const dateStr = `${day}/${month}/${year}`;
  return `${personaName} - ${dateStr} - ${dailyIndex}`;
}

/**
 * Computes the daily video index for a persona on a given date.
 * Used when generating a new video to know which number it is for that persona that day.
 *
 * @param personaId The persona ID
 * @param createdAt The target date
 * @param existingCount Count of videos already generated for this persona on this date
 * @returns 1-based index (1, 2, 3, ...)
 */
export function computeDailyVideoIndex(
  _personaId: number,
  _createdAt: Date,
  existingCount: number
): number {
  return existingCount + 1;
}

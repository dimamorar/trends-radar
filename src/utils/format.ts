/**
 * Formatting utility functions
 */

/**
 * Format rank display string
 *
 * @param ranks - Array of rank numbers
 * @returns Formatted rank string (e.g., "#1" or "#1-5")
 */
export function formatRankDisplay(ranks: number[]): string {
  if (!ranks || ranks.length === 0) {
    return '';
  }

  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);

  if (minRank === maxRank) {
    return `#${minRank}`;
  }

  return `#${minRank}-${maxRank}`;
}

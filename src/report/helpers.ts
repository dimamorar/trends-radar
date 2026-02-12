/**
 * Report Helpers
 *
 * Utility functions for report generation
 */

import { formatRankDisplay } from "../utils/format.js";
import { escapeHtml } from "../utils/html.js";

// Re-export shared utilities for backwards compatibility
export { escapeHtml as htmlEscape, formatRankDisplay };

/**
 * Format rank badge HTML
 */
export function formatRankBadge(ranks: number[]): string {
  if (!ranks || ranks.length === 0) {
    return "";
  }

  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);

  let badgeClass = "rank-badge";
  if (minRank <= 3) {
    badgeClass += " rank-top";
  } else if (minRank <= 10) {
    badgeClass += " rank-high";
  }

  if (minRank === maxRank) {
    return `<span class="${badgeClass}">#${minRank}</span>`;
  }

  return `<span class="${badgeClass}">#${minRank}-${maxRank}</span>`;
}

/**
 * Format time display
 */
export function formatTimeDisplay(
  firstTime?: string,
  lastTime?: string,
): string {
  if (!firstTime) return "";

  const formatTime = (t: string) => t.replace("-", ":");

  if (!lastTime || firstTime === lastTime) {
    return formatTime(firstTime);
  }

  return `[${formatTime(firstTime)} ~ ${formatTime(lastTime)}]`;
}

/**
 * Truncate text to max length
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

/**
 * Format count with unit
 */
export function formatCount(count: number, unit = "items"): string {
  return `${count} ${unit}`;
}

/**
 * Get CSS for new item badge
 */
export function getNewBadge(): string {
  return '<span class="new-badge">NEW</span>';
}

/**
 * Format date for display
 */
export function formatDateDisplay(date: Date): string {
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default escapeHtml;

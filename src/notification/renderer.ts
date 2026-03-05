/**
 * Content Renderer
 *
 * Renders report data into platform-specific message formats
 */

import type { RssItem, StatisticsEntry } from "../types/index.js";
import { formatRankDisplay } from "../utils/format.js";
import { escapeHtml } from "../utils/html.js";

// Re-export for backwards compatibility
export { escapeHtml, formatRankDisplay };

/**
 * Report data for rendering
 */
export interface ReportData {
  stats: StatisticsEntry[];
  failedIds?: string[];
  newTitles?: Array<{
    sourceId: string;
    sourceName: string;
    titles: Array<{ title: string; url?: string }>;
  }>;
  idToName?: Record<string, string>;
}

/**
 * Render options
 */
export interface RenderOptions {
  reportType?: string;
  mode?: "daily" | "current" | "incremental";
  updateInfo?: { currentVersion?: string; remoteVersion?: string };
  maxItems?: number;
  showRss?: boolean;
  showNewItems?: boolean;
  getTime?: () => Date;
}

/**
 * Escape Markdown special characters
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]()~`>#+=|{}.!-])/g, "\\$1");
}

/**
 * Render report data to HTML format (for Telegram HTML mode)
 */
export function renderHtmlContent(
  data: ReportData,
  rssItems: RssItem[] | null,
  options: RenderOptions = {},
): string {
  const {
    reportType = "TrendRadar Report",
    showRss = true,
    showNewItems = true,
    maxItems = 10,
    getTime = () => new Date(),
  } = options;

  const lines: string[] = [];
  const now = getTime();
  const timeStr = now.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // Header
  lines.push(`<b>${escapeHtml(reportType)}</b>`);
  lines.push(`${timeStr}\n`);

  // RSS Section
  if (showRss && rssItems && rssItems.length > 0) {
    lines.push("<b>RSS Updates</b>");

    // Group by feed
    const feedGroups = new Map<string, RssItem[]>();
    for (const item of rssItems) {
      const feedName = item.feedName || item.feedId;
      if (!feedGroups.has(feedName)) {
        feedGroups.set(feedName, []);
      }
      feedGroups.get(feedName)?.push(item);
    }

    for (const [feedName, items] of feedGroups) {
      lines.push(`\n<b>${escapeHtml(feedName)}</b> (${items.length})`);

      const displayItems = maxItems > 0 ? items.slice(0, maxItems) : items;
      for (const item of displayItems) {
        const title = escapeHtml(item.title);
        if (item.url) {
          lines.push(`  - <a href="${item.url}">${title}</a>`);
        } else {
          lines.push(`  - ${title}`);
        }
      }

      if (maxItems > 0 && items.length > maxItems) {
        lines.push(`  ... and ${items.length - maxItems} more`);
      }
    }

    lines.push("");
  }

  // Keyword Statistics Section
  if (data.stats && data.stats.length > 0) {
    lines.push("<b>Keyword Matches</b>");

    for (const stat of data.stats) {
      if (stat.count === 0) continue;

      lines.push(`\n<b>${escapeHtml(stat.word)}</b> (${stat.count})`);

      const displayTitles =
        maxItems > 0 ? stat.titles.slice(0, maxItems) : stat.titles;
      for (const titleInfo of displayTitles) {
        const title = escapeHtml(titleInfo.title);
        const rankStr = formatRankDisplay(titleInfo.ranks);
        const source = escapeHtml(titleInfo.sourceName);

        let line = `  - ${title}`;
        if (rankStr) {
          line += ` ${rankStr}`;
        }
        line += ` [${source}]`;

        if (titleInfo.url) {
          line = `  - <a href="${titleInfo.url}">${title}</a>`;
          if (rankStr) line += ` ${rankStr}`;
          line += ` [${source}]`;
        }

        if (titleInfo.isNew) {
          line += " [NEW]";
        }

        lines.push(line);
      }

      if (maxItems > 0 && stat.titles.length > maxItems) {
        lines.push(`  ... and ${stat.titles.length - maxItems} more`);
      }
    }

    lines.push("");
  }

  // New Items Section
  if (showNewItems && data.newTitles && data.newTitles.length > 0) {
    lines.push("<b>New Items</b>");

    for (const source of data.newTitles) {
      lines.push(`\n<b>${escapeHtml(source.sourceName)}</b>`);

      const displayTitles =
        maxItems > 0 ? source.titles.slice(0, maxItems) : source.titles;
      for (const item of displayTitles) {
        const title = escapeHtml(item.title);
        if (item.url) {
          lines.push(`  - <a href="${item.url}">${title}</a>`);
        } else {
          lines.push(`  - ${title}`);
        }
      }
    }

    lines.push("");
  }

  // Update info
  if (options.updateInfo?.remoteVersion) {
    lines.push(`\nUpdate available: v${options.updateInfo.remoteVersion}`);
  }

  return lines.join("\n");
}

/**
 * Render report data to plain text format
 */
export function renderPlainTextContent(
  data: ReportData,
  rssItems: RssItem[] | null,
  options: RenderOptions = {},
): string {
  const {
    reportType = "TrendRadar Report",
    maxItems = 10,
    showRss = true,
    getTime = () => new Date(),
  } = options;

  const lines: string[] = [];
  const now = getTime();
  const timeStr = now.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  // Header
  lines.push(`${reportType}`);
  lines.push(`${timeStr}`);
  lines.push("─".repeat(30));
  lines.push("");

  // RSS Section
  if (showRss && rssItems && rssItems.length > 0) {
    lines.push("RSS Updates");
    lines.push("─".repeat(20));

    const feedGroups = new Map<string, RssItem[]>();
    for (const item of rssItems) {
      const feedName = item.feedName || item.feedId;
      if (!feedGroups.has(feedName)) {
        feedGroups.set(feedName, []);
      }
      feedGroups.get(feedName)?.push(item);
    }

    for (const [feedName, items] of feedGroups) {
      lines.push(`\n[${feedName}] (${items.length})`);

      const displayItems = maxItems > 0 ? items.slice(0, maxItems) : items;
      for (const item of displayItems) {
        lines.push(`  • ${item.title}`);
        if (item.url) {
          lines.push(`    ${item.url}`);
        }
      }

      if (maxItems > 0 && items.length > maxItems) {
        lines.push(`  ... and ${items.length - maxItems} more`);
      }
    }

    lines.push("");
  }

  // Keyword Statistics
  if (data.stats && data.stats.length > 0) {
    lines.push("Keyword Matches");
    lines.push("─".repeat(20));

    for (const stat of data.stats) {
      if (stat.count === 0) continue;

      lines.push(`\n[${stat.word}] (${stat.count})`);

      const displayTitles =
        maxItems > 0 ? stat.titles.slice(0, maxItems) : stat.titles;
      for (const titleInfo of displayTitles) {
        const rankStr = formatRankDisplay(titleInfo.ranks);
        let line = `  • ${titleInfo.title}`;
        if (rankStr) line += ` ${rankStr}`;
        line += ` - ${titleInfo.sourceName}`;
        if (titleInfo.isNew) line += " [NEW]";
        lines.push(line);
      }

      if (maxItems > 0 && stat.titles.length > maxItems) {
        lines.push(`  ... and ${stat.titles.length - maxItems} more`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Render simple RSS summary for Telegram
 */
export function renderRssSummary(
  rssItems: RssItem[],
  options: { maxItems?: number; getTime?: () => Date } = {},
): string {
  const { maxItems = 20, getTime = () => new Date() } = options;

  if (!rssItems || rssItems.length === 0) {
    return "No RSS updates.";
  }

  const lines: string[] = [];
  const now = getTime();
  const timeStr = now.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  lines.push(`<b>RSS Updates</b> | ${timeStr}`);
  lines.push(`Total: ${rssItems.length} items\n`);

  // Group by feed
  const feedGroups = new Map<string, RssItem[]>();
  for (const item of rssItems) {
    const feedName = item.feedName || item.feedId;
    if (!feedGroups.has(feedName)) {
      feedGroups.set(feedName, []);
    }
    feedGroups.get(feedName)?.push(item);
  }

  for (const [feedName, items] of feedGroups) {
    lines.push(`<b>${escapeHtml(feedName)}</b> (${items.length})`);

    const displayItems = maxItems > 0 ? items.slice(0, maxItems) : items;
    for (const item of displayItems) {
      const title = escapeHtml(item.title);
      if (item.url) {
        lines.push(`• <a href="${item.url}">${title}</a>`);
      } else {
        lines.push(`• ${title}`);
      }
    }

    if (maxItems > 0 && items.length > maxItems) {
      lines.push(`  <i>... and ${items.length - maxItems} more</i>`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Render cluster-based topic report for Telegram (HTML mode)
 */
export function renderClusterReport(
  summaries: ClusterReportTopic[],
  options: { reportType?: string; getTime?: () => Date } = {},
): string {
  const { reportType = "TrendRadar Daily Digest", getTime = () => new Date() } =
    options;

  const now = getTime();
  const timeStr = now.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const lines: string[] = [];

  // Header
  lines.push(`<b>${escapeHtml(reportType)}</b>`);
  lines.push(`${timeStr}\n`);

  for (let i = 0; i < summaries.length; i++) {
    const topic = summaries[i];
    const rank = i + 1;

    lines.push(`<b>${rank}. ${escapeHtml(topic.headline)}</b>`);

    // Summary
    if (topic.summary) {
      lines.push(escapeHtml(topic.summary));
    }

    // Representative links
    if (topic.urls && topic.urls.length > 0) {
      const linkParts: string[] = [];
      for (const link of topic.urls.slice(0, 5)) {
        const label = escapeHtml(link.name || link.url);
        linkParts.push(`<a href="${link.url}">${label}</a>`);
      }
      lines.push(`  ${linkParts.join(" | ")}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Topic data for cluster report rendering
 */
export interface ClusterReportTopic {
  headline: string;
  summary: string;
  urls: Array<{ name: string; url: string }>;
  distinctSources: number;
  totalMentions: number;
  score: number;
}

export default renderHtmlContent;

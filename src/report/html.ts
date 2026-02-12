/**
 * HTML Report Generator
 *
 * Generates HTML reports for news analysis
 */

import type { AIAnalysisResult } from '../ai/index.js';
import type { RssItem, StatisticsEntry } from '../types/index.js';
import { formatDateDisplay, formatRankBadge, htmlEscape } from './helpers.js';

/**
 * Report data structure
 */
export interface ReportData {
  stats: StatisticsEntry[];
  newTitles?: Array<{
    sourceId: string;
    sourceName: string;
    titles: Array<{ title: string; url?: string; isNew?: boolean }>;
  }>;
  failedIds?: string[];
  idToName?: Record<string, string>;
  totalNewCount?: number;
}

/**
 * Report options
 */
export interface HtmlReportOptions {
  mode?: 'daily' | 'current' | 'incremental';
  displayMode?: 'keyword' | 'platform';
  showNewSection?: boolean;
  regionOrder?: string[];
  getTime?: () => Date;
  updateInfo?: { currentVersion?: string; remoteVersion?: string };
  rssItems?: RssItem[] | null;
  rssNewItems?: RssItem[] | null;
  aiAnalysis?: AIAnalysisResult | null;
  uiLanguage?: string;
}

/**
 * Get CSS styles for the report
 */
function getStyles(): string {
  return `
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      margin: 0;
      padding: 16px;
      background: #fafafa;
      color: #333;
      line-height: 1.6;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 2px 16px rgba(0,0,0,0.06);
    }

    .header {
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      color: white;
      padding: 32px 24px;
      text-align: center;
    }

    .header-title {
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 16px 0;
    }

    .header-info {
      display: flex;
      justify-content: center;
      gap: 32px;
      font-size: 14px;
      opacity: 0.95;
    }

    .content {
      padding: 24px;
    }

    .section {
      margin-bottom: 32px;
    }

    .section-title {
      font-size: 16px;
      font-weight: 600;
      color: #1f2937;
      margin: 0 0 16px 0;
      padding-bottom: 8px;
      border-bottom: 2px solid #e5e7eb;
    }

    .keyword-group {
      margin-bottom: 24px;
    }

    .keyword-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      color: #4f46e5;
      margin-bottom: 12px;
    }

    .keyword-count {
      font-size: 12px;
      background: #eef2ff;
      color: #4f46e5;
      padding: 2px 8px;
      border-radius: 12px;
    }

    .news-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .news-item {
      padding: 12px;
      margin-bottom: 8px;
      background: #f9fafb;
      border-radius: 8px;
      border-left: 3px solid #e5e7eb;
    }

    .news-item.is-new {
      border-left-color: #10b981;
      background: #ecfdf5;
    }

    .news-title {
      font-weight: 500;
      margin-bottom: 4px;
    }

    .news-title a {
      color: #1f2937;
      text-decoration: none;
    }

    .news-title a:hover {
      color: #4f46e5;
    }

    .news-meta {
      font-size: 12px;
      color: #6b7280;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .rank-badge {
      background: #e5e7eb;
      color: #374151;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 11px;
    }

    .rank-badge.rank-top {
      background: #fef3c7;
      color: #92400e;
    }

    .rank-badge.rank-high {
      background: #dbeafe;
      color: #1e40af;
    }

    .new-badge {
      background: #10b981;
      color: white;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
    }

    .rss-section .feed-group {
      margin-bottom: 16px;
    }

    .feed-header {
      font-weight: 600;
      color: #059669;
      margin-bottom: 8px;
    }

    .ai-section {
      background: #fefce8;
      border-radius: 8px;
      padding: 16px;
    }

    .ai-content {
      white-space: pre-wrap;
      font-size: 14px;
      line-height: 1.8;
    }

    .ai-content h3 {
      color: #4f46e5;
      margin: 16px 0 8px 0;
      font-size: 15px;
    }

    .footer {
      text-align: center;
      padding: 16px;
      color: #9ca3af;
      font-size: 12px;
      border-top: 1px solid #e5e7eb;
    }

    @media (max-width: 600px) {
      body { padding: 8px; }
      .header { padding: 24px 16px; }
      .content { padding: 16px; }
      .header-info { flex-direction: column; gap: 8px; }
    }
  `;
}

/**
 * Render HTML report
 */
export function renderHtmlReport(
  reportData: ReportData,
  totalTitles: number,
  options: HtmlReportOptions = {},
): string {
  const {
    mode = 'daily',
    displayMode = 'keyword',
    showNewSection = true,
    regionOrder = ['hotlist', 'rss', 'new_items', 'ai_analysis'],
    getTime = () => new Date(),
    updateInfo,
    rssItems,
    rssNewItems: _rssNewItems,
    aiAnalysis,
    uiLanguage = 'en',
  } = options;

  const isEn = uiLanguage.toLowerCase().startsWith('en');
  const unitItems = isEn ? 'items' : 'items';

  const now = getTime();
  const dateStr = formatDateDisplay(now);

  // Mode title
  const modeTitle: Record<string, string> = {
    daily: isEn ? 'Daily Summary' : 'Daily Summary',
    current: isEn ? 'Current List' : 'Current List',
    incremental: isEn ? 'Incremental Update' : 'Incremental Update',
  };

  const title = modeTitle[mode] || 'News Report';

  let html = `<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'zh'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TrendRadar - ${title}</title>
  <style>${getStyles()}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="header-title">TrendRadar - ${htmlEscape(title)}</h1>
      <div class="header-info">
        <span>${dateStr}</span>
        <span>${totalTitles} ${unitItems}</span>
      </div>
    </div>
    <div class="content">`;

  // Render sections in order
  for (const region of regionOrder) {
    switch (region) {
      case 'hotlist':
        html += renderHotlistSection(reportData.stats, displayMode, isEn);
        break;
      case 'rss':
        if (rssItems && rssItems.length > 0) {
          html += renderRssSection(rssItems, isEn);
        }
        break;
      case 'new_items':
        if (showNewSection && reportData.newTitles && reportData.newTitles.length > 0) {
          html += renderNewItemsSection(reportData.newTitles, isEn);
        }
        break;
      case 'ai_analysis':
        if (aiAnalysis?.success) {
          html += renderAiSection(aiAnalysis, isEn);
        }
        break;
    }
  }

  html += `
    </div>
    <div class="footer">
      Generated by TrendRadar`;

  if (updateInfo?.remoteVersion) {
    html += ` | Update available: v${htmlEscape(updateInfo.remoteVersion)}`;
  }

  html += `
    </div>
  </div>
</body>
</html>`;

  return html;
}

/**
 * Render hotlist section
 */
function renderHotlistSection(
  stats: StatisticsEntry[],
  displayMode: 'keyword' | 'platform',
  isEn: boolean,
): string {
  if (!stats || stats.length === 0) {
    return '';
  }

  const sectionTitle =
    displayMode === 'keyword'
      ? isEn
        ? 'Keyword Matches'
        : 'Keyword Matches'
      : isEn
        ? 'Platform Summary'
        : 'Platform Summary';

  let html = `
      <div class="section hotlist-section">
        <h2 class="section-title">${sectionTitle}</h2>`;

  for (const stat of stats) {
    if (stat.count === 0) continue;

    html += `
        <div class="keyword-group">
          <div class="keyword-header">
            <span>${htmlEscape(stat.word)}</span>
            <span class="keyword-count">${stat.count}</span>
          </div>
          <ul class="news-list">`;

    for (const title of stat.titles) {
      const isNew = title.isNew;
      html += `
            <li class="news-item${isNew ? ' is-new' : ''}">
              <div class="news-title">`;

      if (title.url) {
        html += `<a href="${htmlEscape(title.url)}" target="_blank">${htmlEscape(title.title)}</a>`;
      } else {
        html += htmlEscape(title.title);
      }

      html += `</div>
              <div class="news-meta">`;

      if (title.ranks && title.ranks.length > 0) {
        html += formatRankBadge(title.ranks);
      }

      html += `<span>${htmlEscape(title.sourceName)}</span>`;

      if (title.timeDisplay) {
        html += `<span>${htmlEscape(title.timeDisplay)}</span>`;
      }

      if (isNew) {
        html += '<span class="new-badge">NEW</span>';
      }

      html += `
              </div>
            </li>`;
    }

    html += `
          </ul>
        </div>`;
  }

  html += `
      </div>`;

  return html;
}

/**
 * Render RSS section
 */
function renderRssSection(rssItems: RssItem[], isEn: boolean): string {
  const sectionTitle = isEn ? 'RSS Updates' : 'RSS Updates';

  // Group by feed
  const feedGroups = new Map<string, RssItem[]>();
  for (const item of rssItems) {
    const feedName = item.feedName || item.feedId;
    if (!feedGroups.has(feedName)) {
      feedGroups.set(feedName, []);
    }
    feedGroups.get(feedName)?.push(item);
  }

  let html = `
      <div class="section rss-section">
        <h2 class="section-title">${sectionTitle}</h2>`;

  for (const [feedName, items] of feedGroups) {
    html += `
        <div class="feed-group">
          <div class="feed-header">${htmlEscape(feedName)} (${items.length})</div>
          <ul class="news-list">`;

    for (const item of items.slice(0, 20)) {
      html += `
            <li class="news-item">
              <div class="news-title">`;

      if (item.url) {
        html += `<a href="${htmlEscape(item.url)}" target="_blank">${htmlEscape(item.title)}</a>`;
      } else {
        html += htmlEscape(item.title);
      }

      html += `</div>`;

      if (item.publishedAt) {
        const pubDate = new Date(item.publishedAt);
        html += `<div class="news-meta"><span>${formatDateDisplay(pubDate)}</span></div>`;
      }

      html += `
            </li>`;
    }

    if (items.length > 20) {
      html += `<li class="news-item"><em>... and ${items.length - 20} more</em></li>`;
    }

    html += `
          </ul>
        </div>`;
  }

  html += `
      </div>`;

  return html;
}

/**
 * Render new items section
 */
function renderNewItemsSection(
  newTitles: Array<{
    sourceId: string;
    sourceName: string;
    titles: Array<{ title: string; url?: string }>;
  }>,
  isEn: boolean,
): string {
  const sectionTitle = isEn ? 'New Items' : 'New Items';

  let html = `
      <div class="section new-items-section">
        <h2 class="section-title">${sectionTitle}</h2>`;

  for (const source of newTitles) {
    html += `
        <div class="feed-group">
          <div class="feed-header">${htmlEscape(source.sourceName)}</div>
          <ul class="news-list">`;

    for (const title of source.titles.slice(0, 10)) {
      html += `
            <li class="news-item is-new">
              <div class="news-title">`;

      if (title.url) {
        html += `<a href="${htmlEscape(title.url)}" target="_blank">${htmlEscape(title.title)}</a>`;
      } else {
        html += htmlEscape(title.title);
      }

      html += `</div>
            </li>`;
    }

    if (source.titles.length > 10) {
      html += `<li class="news-item"><em>... and ${source.titles.length - 10} more</em></li>`;
    }

    html += `
          </ul>
        </div>`;
  }

  html += `
      </div>`;

  return html;
}

/**
 * Render AI analysis section
 */
function renderAiSection(aiAnalysis: AIAnalysisResult, isEn: boolean): string {
  const sectionTitle = isEn ? 'AI Analysis' : 'AI Analysis';

  let html = `
      <div class="section ai-section">
        <h2 class="section-title">${sectionTitle}</h2>
        <div class="ai-content">`;

  // Render each section
  if (aiAnalysis.coreTrends) {
    html += `<h3>Core Trends</h3>\n${htmlEscape(aiAnalysis.coreTrends)}\n\n`;
  }

  if (aiAnalysis.sentimentControversy) {
    html += `<h3>Sentiment & Controversy</h3>\n${htmlEscape(aiAnalysis.sentimentControversy)}\n\n`;
  }

  if (aiAnalysis.signals) {
    html += `<h3>Signals</h3>\n${htmlEscape(aiAnalysis.signals)}\n\n`;
  }

  if (aiAnalysis.rssInsights) {
    html += `<h3>RSS Insights</h3>\n${htmlEscape(aiAnalysis.rssInsights)}\n\n`;
  }

  if (aiAnalysis.outlookStrategy) {
    html += `<h3>Outlook & Strategy</h3>\n${htmlEscape(aiAnalysis.outlookStrategy)}\n\n`;
  }

  html += `
        </div>
      </div>`;

  return html;
}

export default renderHtmlReport;

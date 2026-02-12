/**
 * Report Generator
 *
 * Prepares data and generates reports in various formats
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AIAnalysisResult } from '../ai/index.js';
import type { RssItem, StatisticsEntry } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { type HtmlReportOptions, type ReportData, renderHtmlReport } from './html.js';

/**
 * Report generation options
 */
export interface GeneratorOptions {
  outputDir?: string;
  mode?: 'daily' | 'current' | 'incremental';
  displayMode?: 'keyword' | 'platform';
  showNewSection?: boolean;
  regionOrder?: string[];
  getTime?: () => Date;
}

/**
 * Report Generator class
 */
export class ReportGenerator {
  private outputDir: string;
  private mode: 'daily' | 'current' | 'incremental';
  private displayMode: 'keyword' | 'platform';
  private showNewSection: boolean;
  private regionOrder: string[];
  private getTime: () => Date;

  constructor(options: GeneratorOptions = {}) {
    this.outputDir = options.outputDir ?? 'output/html';
    this.mode = options.mode ?? 'daily';
    this.displayMode = options.displayMode ?? 'keyword';
    this.showNewSection = options.showNewSection ?? true;
    this.regionOrder = options.regionOrder ?? ['hotlist', 'rss', 'new_items', 'ai_analysis'];
    this.getTime = options.getTime ?? (() => new Date());
  }

  /**
   * Prepare report data from statistics
   */
  prepareReportData(
    stats: StatisticsEntry[],
    options: {
      idToName?: Record<string, string>;
      newTitles?: Record<string, Record<string, unknown>>;
    } = {},
  ): ReportData {
    const { idToName = {}, newTitles = {} } = options;

    // Convert newTitles to structured format
    const newTitlesList: ReportData['newTitles'] = [];

    for (const [sourceId, titles] of Object.entries(newTitles)) {
      const sourceName = idToName[sourceId] || sourceId;
      const titlesList: Array<{ title: string; url?: string }> = [];

      for (const title of Object.keys(titles)) {
        const data = titles[title] as { url?: string };
        titlesList.push({
          title,
          url: data?.url,
        });
      }

      if (titlesList.length > 0) {
        newTitlesList.push({
          sourceId,
          sourceName,
          titles: titlesList,
        });
      }
    }

    return {
      stats,
      newTitles: newTitlesList,
      idToName,
      totalNewCount: newTitlesList.reduce((sum, s) => sum + s.titles.length, 0),
    };
  }

  /**
   * Generate HTML report
   */
  generateHtml(
    reportData: ReportData,
    totalTitles: number,
    options: {
      rssItems?: RssItem[] | null;
      rssNewItems?: RssItem[] | null;
      aiAnalysis?: AIAnalysisResult | null;
      updateInfo?: { currentVersion?: string; remoteVersion?: string };
      filename?: string;
    } = {},
  ): { html: string; filePath: string | null } {
    const htmlOptions: HtmlReportOptions = {
      mode: this.mode,
      displayMode: this.displayMode,
      showNewSection: this.showNewSection,
      regionOrder: this.regionOrder,
      getTime: this.getTime,
      rssItems: options.rssItems,
      rssNewItems: options.rssNewItems,
      aiAnalysis: options.aiAnalysis,
      updateInfo: options.updateInfo,
    };

    const html = renderHtmlReport(reportData, totalTitles, htmlOptions);

    // Generate filename
    const now = this.getTime();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const filename = options.filename ?? `report-${dateStr}-${timeStr}.html`;

    // Save to file
    const filePath = this.saveToFile(html, filename);

    return { html, filePath };
  }

  /**
   * Generate summary HTML (index.html)
   */
  generateSummaryHtml(
    reportData: ReportData,
    totalTitles: number,
    options: {
      rssItems?: RssItem[] | null;
      aiAnalysis?: AIAnalysisResult | null;
    } = {},
  ): { html: string; filePath: string | null } {
    const htmlOptions: HtmlReportOptions = {
      mode: this.mode,
      displayMode: this.displayMode,
      showNewSection: false, // No new items in summary
      regionOrder: this.regionOrder,
      getTime: this.getTime,
      rssItems: options.rssItems,
      aiAnalysis: options.aiAnalysis,
    };

    const html = renderHtmlReport(reportData, totalTitles, htmlOptions);

    // Save as index.html
    const filePath = this.saveToFile(html, 'index.html');

    return { html, filePath };
  }

  /**
   * Save HTML to file
   */
  private saveToFile(content: string, filename: string): string | null {
    try {
      // Ensure output directory exists
      if (!existsSync(this.outputDir)) {
        mkdirSync(this.outputDir, { recursive: true });
      }

      const filePath = join(this.outputDir, filename);
      writeFileSync(filePath, content, 'utf-8');

      logger.info(`Report saved to: ${filePath}`);
      return filePath;
    } catch (error) {
      logger.error({ error }, 'Failed to save report');
      return null;
    }
  }

  /**
   * Get report title based on mode
   */
  getReportTitle(): string {
    const titles: Record<string, string> = {
      daily: 'Daily Summary',
      current: 'Current List',
      incremental: 'Incremental Update',
    };

    return titles[this.mode] || 'News Report';
  }
}

/**
 * Create report generator
 */
export function createReportGenerator(options: GeneratorOptions = {}): ReportGenerator {
  return new ReportGenerator(options);
}

export default ReportGenerator;

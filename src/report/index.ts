/**
 * Report module exports
 */

export {
  createReportGenerator,
  type GeneratorOptions,
  ReportGenerator,
} from './generator.js';
export {
  formatCount,
  formatDateDisplay,
  formatRankBadge,
  formatRankDisplay,
  formatTimeDisplay,
  getNewBadge,
  htmlEscape,
  truncateText,
} from './helpers.js';
export {
  type HtmlReportOptions,
  type ReportData,
  renderHtmlReport,
} from './html.js';

import type { RssItem, StatisticsEntry } from '../../types/index';

export function prepareNewsContent(
  stats: StatisticsEntry[],
  rssItems: RssItem[] | null | undefined,
  maxNews: number,
  includeRss: boolean,
): {
  newsContent: string;
  rssContent: string;
  hotlistCount: number;
  rssCount: number;
  analyzedCount: number;
} {
  const newsLines: string[] = [];
  let hotlistCount = 0;
  let itemIndex = 0;

  for (const stat of stats) {
    for (const title of stat.titles) {
      if (itemIndex >= maxNews) break;

      const line = `[${stat.word}] ${title.title} (${title.sourceName})`;
      newsLines.push(line);
      hotlistCount++;
      itemIndex++;
    }
    if (itemIndex >= maxNews) break;
  }

  const newsContent = newsLines.join('\n');

  const rssLines: string[] = [];
  let rssCount = 0;

  if (includeRss && rssItems && rssItems.length > 0) {
    for (const item of rssItems) {
      if (itemIndex >= maxNews) break;

      const feedName = item.feedName || item.feedId;
      const line = `[${feedName}] ${item.title}`;
      rssLines.push(line);
      rssCount++;
      itemIndex++;
    }
  }

  const rssContent = rssLines.join('\n');

  return {
    newsContent,
    rssContent,
    hotlistCount,
    rssCount,
    analyzedCount: hotlistCount + rssCount,
  };
}

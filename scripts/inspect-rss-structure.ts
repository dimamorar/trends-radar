import { loadConfig } from "../src/core/config.js";
import { RssParser } from "../src/crawler/index.js";

const configPath = process.argv[2] ?? "config/config.yaml";
const config = loadConfig(configPath);

const feeds = (config.rss?.feeds ?? []).filter(
  (feed) => feed.enabled !== false,
);
if (feeds.length === 0) {
  console.error("No enabled RSS feeds found in config.");
  process.exit(1);
}

const parser = new RssParser();

function detectJsonFeed(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) return false;
  try {
    const data = JSON.parse(trimmed) as { version?: string };
    return (
      typeof data.version === "string" && data.version.includes("jsonfeed.org")
    );
  } catch {
    return false;
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.floor(p * (sorted.length - 1));
  return sorted[idx] ?? 0;
}

async function fetchText(
  url: string,
): Promise<{ text: string; status: number; contentType: string | null }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "TrendRadar/2.0 RSS Reader (https://github.com/trendradar)",
      Accept:
        "application/feed+json, application/json, application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  const text = await res.text();
  return {
    text,
    status: res.status,
    contentType: res.headers.get("content-type"),
  };
}

for (const feed of feeds) {
  console.log(`\n[${feed.id}] ${feed.name}`);
  console.log(`URL: ${feed.url}`);

  try {
    const { text, status, contentType } = await fetchText(feed.url);
    const isJson = detectJsonFeed(text);

    let items = [] as Awaited<ReturnType<RssParser["parse"]>>;
    try {
      items = await parser.parse(text, feed.url);
    } catch (parseError) {
      const message =
        parseError instanceof Error ? parseError.message : String(parseError);
      console.log(`HTTP: ${status}${contentType ? ` (${contentType})` : ""}`);
      console.log(`Format: ${isJson ? "JSON Feed" : "RSS/Atom"}`);
      console.log(`Parse error: ${message}`);
      continue;
    }

    const total = items.length;
    const counts = {
      title: 0,
      link: 0,
      pubDate: 0,
      summary: 0,
      author: 0,
      guid: 0,
    };

    const summaryLengths: number[] = [];

    for (const item of items) {
      if (item.title) counts.title += 1;
      if (item.link) counts.link += 1;
      if (item.pubDate) counts.pubDate += 1;
      if (item.summary) {
        counts.summary += 1;
        summaryLengths.push(item.summary.length);
      }
      if (item.author) counts.author += 1;
      if (item.guid) counts.guid += 1;
    }

    summaryLengths.sort((a, b) => a - b);

    const pct = (count: number) =>
      total > 0 ? Math.round((count / total) * 100) : 0;

    console.log(`HTTP: ${status}${contentType ? ` (${contentType})` : ""}`);
    console.log(`Format: ${isJson ? "JSON Feed" : "RSS/Atom"}`);
    console.log(`Items parsed: ${total}`);
    console.log(
      `Fields: title ${pct(counts.title)}%, link ${pct(
        counts.link,
      )}%, pubDate ${pct(counts.pubDate)}%, summary ${pct(
        counts.summary,
      )}%, author ${pct(counts.author)}%, guid ${pct(counts.guid)}%`,
    );

    if (summaryLengths.length > 0) {
      const p50 = percentile(summaryLengths, 0.5);
      const p90 = percentile(summaryLengths, 0.9);
      const min = summaryLengths[0];
      const max = summaryLengths[summaryLengths.length - 1];
      console.log(
        `Summary length: min ${min}, p50 ${p50}, p90 ${p90}, max ${max}`,
      );
    }

    if (total > 0) {
      const sample = items[0];
      const sampleOut = {
        title: sample.title?.slice(0, 140),
        link: sample.link,
        pubDate: sample.pubDate,
        summary: sample.summary?.slice(0, 140),
        author: sample.author,
        guid: sample.guid,
      };
      console.log("Sample item (trimmed):");
      console.log(JSON.stringify(sampleOut, null, 2));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Fetch error: ${message}`);
  }
}

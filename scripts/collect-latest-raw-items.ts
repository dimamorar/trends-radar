import { mkdir, writeFile } from "node:fs/promises";

import { loadConfig } from "../src/core/config.js";

const configPath = process.argv[2] ?? "config/config.yaml";
const outFile = process.argv[3] ?? "output/rss-raw/latest-items.xml";

const config = loadConfig(configPath);
const feeds = (config.rss?.feeds ?? []).filter(
  (feed) => feed.enabled !== false,
);

if (feeds.length === 0) {
  console.error("No enabled RSS feeds found in config.");
  process.exit(1);
}

await mkdir("output/rss-raw", { recursive: true });

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "TrendRadar/2.0 RSS Reader (https://github.com/trendradar)",
      Accept:
        "application/feed+json, application/json, application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.text();
}

function extractBlocks(xml: string, tag: "item" | "entry"): string[] {
  const blocks: string[] = [];
  const openRe = new RegExp(`<${tag}\\b[\\s\\S]*?>`, "g");
  let match: RegExpExecArray | null;

  while (openRe.exec(xml)) {
    match = openRe.exec(xml);
    const start = match?.index ?? 0;
    const close = `</${tag}>`;
    const end = xml.indexOf(close, start);
    if (end === -1) break;
    blocks.push(xml.slice(start, end + close.length));
    openRe.lastIndex = end + close.length;
  }
  return blocks;
}

function extractDate(block: string): string | null {
  const tags = ["pubDate", "updated", "published", "dc:date"];
  for (const tag of tags) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
    const m = block.match(re);
    if (m && m[1]) {
      return m[1].trim();
    }
  }
  return null;
}

function pickLatest(blocks: string[]): string | null {
  let latest: { block: string; time: number } | null = null;
  for (const block of blocks) {
    const dateStr = extractDate(block);
    const time = dateStr ? Date.parse(dateStr) : NaN;
    if (!Number.isNaN(time)) {
      if (!latest || time > latest.time) {
        latest = { block, time };
      }
    }
  }

  if (latest) return latest.block;
  return blocks[0] ?? null;
}

const sections: string[] = [];

for (const feed of feeds) {
  sections.push(`${feed.id}:`);
  try {
    const xml = await fetchText(feed.url);
    let blocks = extractBlocks(xml, "item");
    let tag: "item" | "entry" = "item";

    if (blocks.length === 0) {
      blocks = extractBlocks(xml, "entry");
      tag = "entry";
    }

    if (blocks.length === 0) {
      sections.push("<no item/entry found>");
      sections.push("");
      continue;
    }

    const latest = pickLatest(blocks);
    if (!latest) {
      sections.push("<no item/entry found>");
      sections.push("");
      continue;
    }

    sections.push(latest);
    sections.push("");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sections.push(`<fetch error: ${message}>`);
    sections.push("");
  }
}

await writeFile(outFile, sections.join("\n"), "utf8");
console.log(`Wrote ${outFile}`);

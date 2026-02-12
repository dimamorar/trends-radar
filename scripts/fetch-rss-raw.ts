import { mkdir, writeFile } from "node:fs/promises";
import { loadConfig } from "../src/core/config.js";

const configPath = process.argv[2] ?? "config/config.yaml";
const outDir = process.argv[3] ?? "output/rss-raw";

const config = loadConfig(configPath);
const feeds = (config.rss?.feeds ?? []).filter(
  (feed) => feed.enabled !== false,
);

if (feeds.length === 0) {
  console.error("No enabled RSS feeds found in config.");
  process.exit(1);
}

await mkdir(outDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

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
  const safeId = feed.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const base = `${outDir}/${safeId}__${timestamp}`;
  console.log(`Fetching ${feed.name} (${feed.url})`);

  try {
    const { text, status, contentType } = await fetchText(feed.url);
    const meta = {
      id: feed.id,
      name: feed.name,
      url: feed.url,
      fetchedAt: new Date().toISOString(),
      status,
      contentType,
      bytes: text.length,
    };

    await writeFile(`${base}.xml`, text, "utf8");
    await writeFile(`${base}.meta.json`, JSON.stringify(meta, null, 2), "utf8");
    console.log(`Saved: ${base}.xml`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Failed: ${feed.id} - ${message}`);
  }
}

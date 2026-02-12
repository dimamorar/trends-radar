import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const rawDir = process.argv[2] ?? "output/rss-raw";
const outFile = process.argv[3] ?? "output/rss-raw/sample-items.txt";

const files = await readdir(rawDir);

const byId = new Map<string, { file: string; ts: string }>();

for (const file of files) {
  if (!file.endsWith(".xml")) continue;
  const [id, tsWithExt] = file.split("__");
  if (!id || !tsWithExt) continue;

  const ts = tsWithExt.replace(/\.xml$/, "");
  const current = byId.get(id);
  if (!current || ts > current.ts) {
    byId.set(id, { file, ts });
  }
}

const sections: string[] = [];

function extractFirstBlock(xml: string, tag: string): string | null {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  const start = xml.indexOf(open);
  if (start === -1) return null;
  const end = xml.indexOf(close, start);
  if (end === -1) return null;
  return xml.slice(start, end + close.length);
}

for (const [id, info] of Array.from(byId.entries()).sort()) {
  const path = join(rawDir, info.file);
  const xml = await readFile(path, "utf8");

  let sample = extractFirstBlock(xml, "item");
  let tag = "item";
  if (!sample) {
    sample = extractFirstBlock(xml, "entry");
    tag = "entry";
  }

  if (!sample) {
    sections.push(`${id}: <no item/entry found>`);
    continue;
  }

  sections.push(`${id} (${tag}):\n${sample}`);
}

await writeFile(outFile, sections.join("\n\n"), "utf8");
console.log(`Wrote ${outFile}`);

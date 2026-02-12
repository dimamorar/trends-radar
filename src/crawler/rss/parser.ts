/**
 * RSS Parser
 *
 * Supports RSS 2.0, Atom, and JSON Feed 1.1 formats
 */

import Parser from "rss-parser";
import type { ParsedRssItem } from "../../types/rss.js";

/**
 * RSS Parser class
 */
export class RssParser {
  private parser: Parser;
  private maxSummaryLength: number;

  constructor(maxSummaryLength = 1200) {
    this.maxSummaryLength = maxSummaryLength;
    this.parser = new Parser({
      customFields: {
        item: [
          ["dc:creator", "dcCreator"],
          ["content:encoded", "contentEncoded"],
        ],
      },
      timeout: 30000,
    });
  }

  /**
   * Parse RSS/Atom/JSON Feed content
   */
  async parse(content: string, feedUrl = ""): Promise<ParsedRssItem[]> {
    // Check for JSON Feed first
    if (this.isJsonFeed(content)) {
      return this.parseJsonFeed(content, feedUrl);
    }

    // Use rss-parser for RSS/Atom
    try {
      const feed = await this.parser.parseString(content);
      const items: ParsedRssItem[] = [];

      for (const entry of feed.items || []) {
        const item = this.parseEntry(entry);
        if (item) {
          items.push(item);
        }
      }

      return items;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`RSS parse failed (${feedUrl}): ${message}`);
    }
  }

  /**
   * Parse from URL directly
   */
  async parseUrl(url: string): Promise<ParsedRssItem[]> {
    try {
      const feed = await this.parser.parseURL(url);
      const items: ParsedRssItem[] = [];

      for (const entry of feed.items || []) {
        const item = this.parseEntry(entry);
        if (item) {
          items.push(item);
        }
      }

      return items;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`RSS fetch failed (${url}): ${message}`);
    }
  }

  /**
   * Check if content is JSON Feed format
   */
  private isJsonFeed(content: string): boolean {
    const trimmed = content.trim();
    if (!trimmed.startsWith("{")) {
      return false;
    }

    try {
      const data = JSON.parse(content);
      const version = data.version || "";
      return version.includes("jsonfeed.org");
    } catch {
      return false;
    }
  }

  /**
   * Parse JSON Feed 1.1 format
   */
  private parseJsonFeed(content: string, feedUrl = ""): ParsedRssItem[] {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`JSON Feed parse failed (${feedUrl}): ${message}`);
    }

    const itemsData = (data.items as Record<string, unknown>[]) || [];
    if (!itemsData.length) {
      return [];
    }

    const items: ParsedRssItem[] = [];
    for (const itemData of itemsData) {
      const item = this.parseJsonFeedItem(itemData);
      if (item) {
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Parse single JSON Feed item
   */
  private parseJsonFeedItem(
    itemData: Record<string, unknown>,
  ): ParsedRssItem | null {
    // Title: prefer title, fallback to content_text truncated
    let title = (itemData.title as string) || "";
    if (!title) {
      const contentText = (itemData.content_text as string) || "";
      if (contentText) {
        title =
          contentText.length > 100
            ? `${contentText.slice(0, 100)}...`
            : contentText;
      }
    }

    title = this.cleanText(title);
    if (!title) {
      return null;
    }

    // URL
    const link =
      (itemData.url as string) || (itemData.external_url as string) || "";

    // Published date (ISO 8601)
    let pubDate: string | undefined;
    const dateStr =
      (itemData.date_published as string) || (itemData.date_modified as string);
    if (dateStr) {
      pubDate = this.parseIsoDate(dateStr);
    }

    // Summary
    let summary = (itemData.summary as string) || "";
    if (!summary) {
      const contentText = (itemData.content_text as string) || "";
      const contentHtml = (itemData.content_html as string) || "";
      summary = contentText || this.cleanText(contentHtml);
    }

    if (summary) {
      summary = this.cleanText(summary);
      if (summary.length > this.maxSummaryLength) {
        summary = `${summary.slice(0, this.maxSummaryLength)}...`;
      }
    }

    // Author
    let author: string | undefined;
    const authors = itemData.authors as Array<{ name?: string }> | undefined;
    if (authors && Array.isArray(authors)) {
      const names = authors
        .filter((a) => a && typeof a === "object" && a.name)
        .map((a) => a.name as string);
      if (names.length) {
        author = names.join(", ");
      }
    }

    // GUID
    const guid = (itemData.id as string) || link;

    return {
      title,
      link,
      pubDate,
      summary: summary || undefined,
      author,
      guid,
    };
  }

  /**
   * Parse ISO 8601 date format
   */
  private parseIsoDate(dateStr: string): string | undefined {
    if (!dateStr) {
      return undefined;
    }

    try {
      // Replace Z with +00:00 for compatibility
      const normalized = dateStr.replace("Z", "+00:00");
      const date = new Date(normalized);
      if (Number.isNaN(date.getTime())) {
        return undefined;
      }
      return date.toISOString();
    } catch {
      return undefined;
    }
  }

  /**
   * Parse single RSS/Atom entry
   */
  private parseEntry(entry: Parser.Item): ParsedRssItem | null {
    const title = this.cleanText(entry.title || "");
    if (!title) {
      return null;
    }

    // URL
    const link = entry.link || "";

    // Published date
    let pubDate: string | undefined;
    if (entry.isoDate) {
      pubDate = entry.isoDate;
    } else if (entry.pubDate) {
      try {
        const date = new Date(entry.pubDate);
        if (!Number.isNaN(date.getTime())) {
          pubDate = date.toISOString();
        }
      } catch {
        // Ignore parse error
      }
    }

    // Summary
    let summary =
      entry.contentSnippet ||
      ((entry as Record<string, unknown>).summary as string) ||
      "";
    if (!summary) {
      const content =
        entry.content || (entry as Record<string, unknown>).contentEncoded;
      if (typeof content === "string") {
        summary = this.cleanText(content);
      }
    }

    if (summary) {
      summary = this.cleanText(summary);
      if (summary.length > this.maxSummaryLength) {
        summary = `${summary.slice(0, this.maxSummaryLength)}...`;
      }
    }

    // Author
    let author =
      entry.creator ||
      (entry as Record<string, unknown>).author ||
      (entry as Record<string, unknown>).dcCreator;
    if (typeof author === "string") {
      author = this.cleanText(author);
    } else {
      author = undefined;
    }

    // GUID
    const guid =
      entry.guid || ((entry as Record<string, unknown>).id as string) || link;

    return {
      title,
      link,
      pubDate,
      summary: summary || undefined,
      author: author as string | undefined,
      guid,
    };
  }

  /**
   * Clean text by removing HTML and extra whitespace
   */
  private cleanText(text: string): string {
    if (!text) {
      return "";
    }

    // Decode HTML entities
    text = this.decodeHtmlEntities(text);

    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, "");

    // Remove extra whitespace
    text = text.replace(/\s+/g, " ");

    return text.trim();
  }

  /**
   * Decode common HTML entities
   */
  private decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      "&amp;": "&",
      "&lt;": "<",
      "&gt;": ">",
      "&quot;": '"',
      "&#39;": "'",
      "&apos;": "'",
      "&nbsp;": " ",
      "&#x27;": "'",
      "&#x2F;": "/",
      "&#x60;": "`",
      "&#x3D;": "=",
    };

    let result = text;
    for (const [entity, char] of Object.entries(entities)) {
      result = result.split(entity).join(char);
    }

    // Handle numeric entities
    result = result.replace(/&#(\d+);/g, (_, code) => {
      return String.fromCharCode(parseInt(code, 10));
    });

    result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
      return String.fromCharCode(parseInt(code, 16));
    });

    return result;
  }
}

export default RssParser;

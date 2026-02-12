/**
 * Message Splitter
 *
 * Splits long messages into batches that fit within platform limits
 */

/**
 * Platform message limits (in bytes)
 */
export const PLATFORM_LIMITS: Record<string, number> = {
  telegram: 4096,
  feishu: 29000,
  dingtalk: 20000,
  wework: 4000,
  slack: 4000,
  bark: 3600,
  ntfy: 3800,
  default: 4000,
};

/**
 * Split content into batches that fit within size limit
 */
export function splitIntoBatches(content: string, maxBytes: number): string[] {
  if (!content) {
    return [];
  }

  const contentBytes = Buffer.byteLength(content, 'utf-8');
  if (contentBytes <= maxBytes) {
    return [content];
  }

  const batches: string[] = [];
  const lines = content.split('\n');
  let currentBatch = '';

  for (const line of lines) {
    const lineWithNewline = currentBatch ? `\n${line}` : line;
    const potentialSize = Buffer.byteLength(currentBatch + lineWithNewline, 'utf-8');

    if (potentialSize <= maxBytes) {
      currentBatch += lineWithNewline;
    } else {
      if (currentBatch) {
        batches.push(currentBatch);
      }
      // If single line exceeds limit, truncate it
      if (Buffer.byteLength(line, 'utf-8') > maxBytes) {
        currentBatch = `${truncateToBytes(line, maxBytes - 3)}...`;
      } else {
        currentBatch = line;
      }
    }
  }

  if (currentBatch) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Truncate string to fit within byte limit
 */
export function truncateToBytes(str: string, maxBytes: number): string {
  let result = '';
  let bytes = 0;

  for (const char of str) {
    const charBytes = Buffer.byteLength(char, 'utf-8');
    if (bytes + charBytes > maxBytes) {
      break;
    }
    result += char;
    bytes += charBytes;
  }

  return result;
}

/**
 * Add batch headers to messages
 */
export function addBatchHeaders(batches: string[], title?: string, includeCount = true): string[] {
  if (batches.length <= 1) {
    if (title && batches.length === 1) {
      return [`${title}\n\n${batches[0]}`];
    }
    return batches;
  }

  return batches.map((batch, index) => {
    const header = includeCount
      ? `${title ? `${title} ` : ''}(${index + 1}/${batches.length})`
      : title || '';

    return header ? `${header}\n\n${batch}` : batch;
  });
}

/**
 * Get platform limit
 */
export function getPlatformLimit(platform: string): number {
  return PLATFORM_LIMITS[platform.toLowerCase()] || PLATFORM_LIMITS.default;
}

/**
 * Split message for specific platform
 */
export function splitForPlatform(
  content: string,
  platform: string,
  reserveBytes = 100, // Reserve for headers
): string[] {
  const limit = getPlatformLimit(platform);
  return splitIntoBatches(content, limit - reserveBytes);
}

export default splitIntoBatches;

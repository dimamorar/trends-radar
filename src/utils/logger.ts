import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

const REDACT_PATHS = [
  'apiKey',
  'botToken',
  'secretAccessKey',
  'accessKeyId',
  'password',
  'token',
  'secret',
  '*.apiKey',
  '*.botToken',
  '*.secretAccessKey',
  '*.accessKeyId',
  '*.password',
  '*.token',
  '*.secret',
];

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});

/**
 * Mask a numeric ID for logging, showing only the last 4 digits.
 * In dev mode the full value is shown for easier debugging.
 */
export function maskId(id: number | string): string {
  if (isDev) return String(id);
  const s = String(id);
  return s.length <= 4 ? '****' : `***${s.slice(-4)}`;
}

export default logger;

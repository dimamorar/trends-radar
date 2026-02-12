/**
 * Configuration loader
 *
 * Loads and validates configuration from YAML files and environment variables.
 */

import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { ConfigSchema } from "./configSchema";
import type { Config } from "../types/index.js";
import { logger } from "../utils/logger.js";

const ENV_VAR_REGEX = /\$\{([^}]+)\}/g;

/**
 * Replace ${VAR} with environment variable values
 */
function interpolateEnvVars(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(ENV_VAR_REGEX, (_, varName) => {
      return process.env[varName] || "";
    });
  }
  if (Array.isArray(value)) {
    return value.map(interpolateEnvVars);
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = interpolateEnvVars(v);
    }
    return result;
  }
  return value;
}

/**
 * Apply runtime overrides (formerly CLI flags) onto config.
 * Returns a new config object (does not mutate input).
 */
const VALID_ENTRYPOINTS = ["run", "bot", "both"] as const;

export function applyRuntimeOverrides(config: Config): Config {
  const runtime = config.runtime;
  // Clone so we can apply env overrides even when runtime is missing from YAML
  const next: Config = JSON.parse(JSON.stringify(config)) as Config;

  if (runtime) {
    if (runtime.outputDir) {
      next.storage.local.dataDir = runtime.outputDir;
    }

    if (runtime.ai === "on") {
      next.aiAnalysis.enabled = true;
    } else if (runtime.ai === "off") {
      next.aiAnalysis.enabled = false;
    }

    if (runtime.mode !== "config") {
      next.report.mode = runtime.mode;
    }
  }

  // Env overrides (e.g. for IDE launch configs)
  const entrypointEnv = process.env.TRENDRADAR_ENTRYPOINT;
  if (
    entrypointEnv &&
    (VALID_ENTRYPOINTS as readonly string[]).includes(entrypointEnv)
  ) {
    next.app.entrypoint = entrypointEnv as "run" | "bot" | "both";
  }

  if (process.env.TRENDRADAR_VERBOSE === "1") {
    if (!next.runtime) {
      next.runtime = {
        verbose: true,
        dryRun: false,
        ai: "config",
        mode: "config",
      };
    } else {
      next.runtime.verbose = true;
    }
  }

  return next;
}

/**
 * Load configuration from YAML file
 */
export function loadConfig(): Config {
  if (!existsSync("config/config.yaml")) {
    throw new Error(`Configuration file not found: config/config.yaml`);
  }

  const content = readFileSync("config/config.yaml", "utf-8");
  let rawConfig = parseYaml(content);

  // Interpolate environment variables
  rawConfig = interpolateEnvVars(rawConfig);

  // Validate and return
  try {
    const config = ConfigSchema.parse(rawConfig);
    return config as Config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error("Configuration validation errors:");
      error.errors.forEach((err) => {
        logger.error(`  ${err.path.join(".")}: ${err.message}`);
      });
    }
    throw error;
  }
}

/**
 * Parse multi-account configuration value
 * Supports multiple accounts separated by semicolon
 */
export function parseMultiAccountConfig(
  value: string,
  separator = ";",
): string[] {
  if (!value) return [];

  const accounts = value.split(separator).map((acc) => acc.trim());

  // Return empty if all are empty
  if (accounts.every((acc) => !acc)) return [];

  return accounts;
}

/**
 * Validate paired configurations have matching counts
 */
export function validatePairedConfigs(
  configs: Record<string, string[]>,
  channelName: string,
  requiredKeys?: string[],
): { valid: boolean; count: number } {
  // Filter out empty arrays
  const nonEmpty = Object.fromEntries(
    Object.entries(configs).filter(([_, v]) => v.length > 0),
  );

  if (Object.keys(nonEmpty).length === 0) {
    return { valid: true, count: 0 };
  }

  // Check required keys
  if (requiredKeys) {
    for (const key of requiredKeys) {
      if (!nonEmpty[key] || nonEmpty[key].length === 0) {
        return { valid: true, count: 0 };
      }
    }
  }

  // Get all lengths
  const lengths = Object.values(nonEmpty).map((v) => v.length);
  const uniqueLengths = [...new Set(lengths)];

  if (uniqueLengths.length > 1) {
    logger.error(
      `${channelName} config error: paired config counts don't match`,
    );
    for (const [key, value] of Object.entries(nonEmpty)) {
      logger.error(`  - ${key}: ${value.length}`);
    }
    return { valid: false, count: 0 };
  }

  return { valid: true, count: uniqueLengths[0] || 0 };
}

/**
 * Limit accounts to maximum count
 */
export function limitAccounts(
  accounts: string[],
  maxCount: number,
  channelName: string,
): string[] {
  if (accounts.length > maxCount) {
    logger.warn(
      `${channelName} has ${accounts.length} accounts, exceeds max ${maxCount}, using first ${maxCount}`,
    );
    return accounts.slice(0, maxCount);
  }
  return accounts;
}

/**
 * Safely get account at index
 */
export function getAccountAtIndex(
  accounts: string[],
  index: number,
  defaultValue = "",
): string {
  if (index < accounts.length) {
    return accounts[index] || defaultValue;
  }
  return defaultValue;
}

export default loadConfig;

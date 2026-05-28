/**
 * Structured JSON logger — no external dependencies.
 *
 * Outputs one JSON line per log entry, compatible with log aggregators
 * (Loki, Datadog, CloudWatch, etc.).
 *
 * Usage:
 *   import { createLogger } from './utilities/logger.js';
 *   const log = createLogger('MyComponent');
 *   log.info('Track started', { guild_id: '123', title: 'Song' });
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;

function log(level, component, message, extra = {}) {
  if (LEVELS[level] < currentLevel) return;

  const entry = {
    time: new Date().toISOString(),
    level,
    component,
    message,
    ...extra,
  };

  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * Create a logger bound to a component name.
 * @param {string} component
 */
export function createLogger(component) {
  return {
    debug: (msg, extra) => log("debug", component, msg, extra),
    info:  (msg, extra) => log("info",  component, msg, extra),
    warn:  (msg, extra) => log("warn",  component, msg, extra),
    error: (msg, extra) => log("error", component, msg, extra),
  };
}

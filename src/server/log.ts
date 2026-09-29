import "server-only";

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Keys whose values are never logged, at any depth. */
const REDACT = /pass(word)?|token|secret|authorization|cookie|api[-_]?key|email|phone|health|dietary|allerg|restriction|nutrition|weight|steps/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, REDACT.test(k) ? "[redacted]" : redact(v, depth + 1)]),
    );
  }
  return value;
}

const threshold = ORDER[(process.env.LOG_LEVEL as Level) ?? "info"] ?? ORDER.info;

function emit(level: Level, msg: string, context?: Record<string, unknown>) {
  if (ORDER[level] < threshold) return;
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...(context ? (redact(context) as object) : {}) });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const log = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown> & { err?: unknown }) => {
    const err = ctx?.err;
    emit("error", msg, {
      ...ctx,
      err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
    });
  },
};

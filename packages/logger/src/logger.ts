import { redactValue } from "./redact";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type Sink = (line: string) => void;

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  /** Returns a logger that merges `bindings` into every record. */
  child(bindings: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  service: string;
  level?: LogLevel;
  /** Defaults to writing one JSON object per line to stdout. */
  sink?: Sink;
  now?: () => number;
}

function stdoutSink(line: string): void {
  process.stdout.write(`${line}\n`);
}

export function createLogger(options: LoggerOptions): Logger {
  const { service } = options;
  const minWeight = LEVEL_WEIGHT[options.level ?? "info"];
  const sink = options.sink ?? stdoutSink;
  const now = options.now ?? (() => Date.now());

  const write = (level: LogLevel, msg: string, fields?: Record<string, unknown>): void => {
    if (LEVEL_WEIGHT[level] < minWeight) return;
    const redactedFields = (fields ?? {}) as Record<string, unknown>;
    const record = {
      time: new Date(now()).toISOString(),
      level,
      service,
      ...(redactValue(redactedFields) as Record<string, unknown>),
      msg: redactValue(msg) as string,
    };
    sink(JSON.stringify(record));
  };

  const makeLogger = (bindings: Record<string, unknown>): Logger => ({
    debug: (msg, fields) => write("debug", msg, { ...bindings, ...fields }),
    info: (msg, fields) => write("info", msg, { ...bindings, ...fields }),
    warn: (msg, fields) => write("warn", msg, { ...bindings, ...fields }),
    error: (msg, fields) => write("error", msg, { ...bindings, ...fields }),
    child: (extra) => makeLogger({ ...bindings, ...extra }),
  });

  return makeLogger({});
}

export { redactValue, REDACTED } from "./redact";

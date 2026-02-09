type LogLevel = "info" | "warn" | "error";

type LogEntry = {
  level: LogLevel;
  event: string;
  payload?: unknown;
};

type StructuredPayload = {
  appVersion: string;
  timestamp: string;
  message?: string;
  stack?: string;
  [key: string]: unknown;
};

const toStructuredPayload = (payload: unknown): StructuredPayload => {
  const env = import.meta.env as { PACKAGE_VERSION?: unknown };
  const packageVersion = env.PACKAGE_VERSION;
  const appVersion = typeof packageVersion === "string" ? packageVersion : "dev";
  const base: StructuredPayload = {
    appVersion,
    timestamp: new Date().toISOString(),
  };

  if (payload instanceof Error) {
    const errorPayload: StructuredPayload = {
      ...base,
      message: payload.message,
      name: payload.name,
    };
    if (payload.stack) {
      errorPayload.stack = payload.stack;
    }

    return {
      ...errorPayload,
    };
  }

  if (payload && typeof payload === "object") {
    return {
      ...base,
      ...(payload as Record<string, unknown>),
    };
  }

  if (typeof payload === "string") {
    return {
      ...base,
      message: payload,
    };
  }

  if (payload !== undefined) {
    return {
      ...base,
      value: payload,
    };
  }

  return base;
};

const log = (entry: LogEntry): void => {
  const message = `[floorplan-editor] ${entry.event}`;
  const structuredPayload = toStructuredPayload(entry.payload);

  if (entry.level === "error") {
    console.error(message, structuredPayload);
    return;
  }

  if (entry.level === "warn") {
    console.warn(message, structuredPayload);
    return;
  }

  console.info(message, structuredPayload);
};

export const clientLogger = {
  info: (event: string, payload?: unknown) => log({ level: "info", event, payload }),
  warn: (event: string, payload?: unknown) => log({ level: "warn", event, payload }),
  error: (event: string, payload?: unknown) => log({ level: "error", event, payload }),
};

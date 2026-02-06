type LogLevel = "info" | "warn" | "error";

type LogEntry = {
  level: LogLevel;
  event: string;
  payload?: unknown;
};

const log = (entry: LogEntry): void => {
  const message = `[floorplan-editor] ${entry.event}`;

  if (entry.level === "error") {
    console.error(message, entry.payload);
    return;
  }

  if (entry.level === "warn") {
    console.warn(message, entry.payload);
    return;
  }

  console.info(message, entry.payload);
};

export const clientLogger = {
  info: (event: string, payload?: unknown) => log({ level: "info", event, payload }),
  warn: (event: string, payload?: unknown) => log({ level: "warn", event, payload }),
  error: (event: string, payload?: unknown) => log({ level: "error", event, payload }),
};

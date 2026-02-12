import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_TIMEOUT_MS = 240_000;
const GRACEFUL_KILL_MS = 5_000;
const LOCK_PATH = path.join(process.cwd(), ".test-run.lock");

const parseArgs = (argv) => {
  let timeoutMs = DEFAULT_TIMEOUT_MS;
  const passthrough = [];
  let seenDelimiter = false;

  for (const arg of argv) {
    if (!seenDelimiter && arg === "--") {
      seenDelimiter = true;
      continue;
    }
    if (!seenDelimiter && arg.startsWith("--timeout=")) {
      const raw = Number(arg.slice("--timeout=".length));
      if (Number.isFinite(raw) && raw > 0) {
        timeoutMs = raw;
      }
      continue;
    }
    passthrough.push(arg);
  }

  return { timeoutMs, passthrough };
};

const isProcessAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const killProcessTree = async (pid) => {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, GRACEFUL_KILL_MS));
  if (!isProcessAlive(pid)) {
    return;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // no-op
  }
};

const removeLock = () => {
  try {
    if (fs.existsSync(LOCK_PATH)) {
      fs.unlinkSync(LOCK_PATH);
    }
  } catch {
    // no-op
  }
};

const acquireLock = async () => {
  if (!fs.existsSync(LOCK_PATH)) {
    fs.writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
    return;
  }

  try {
    const raw = fs.readFileSync(LOCK_PATH, "utf8");
    const parsed = JSON.parse(raw);
    const previousPid =
      parsed && typeof parsed === "object" && Number.isInteger(parsed.pid) ? parsed.pid : undefined;

    if (typeof previousPid === "number" && previousPid > 0 && previousPid !== process.pid) {
      if (isProcessAlive(previousPid)) {
        console.error(
          `[test-runner] Found previous test runner (pid=${previousPid}). Terminating stale run...`,
        );
        await killProcessTree(previousPid);
      }
    }
  } catch {
    // no-op
  }

  removeLock();
  fs.writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, startedAt: Date.now() }));
};

const main = async () => {
  const { timeoutMs, passthrough } = parseArgs(process.argv.slice(2));
  if (passthrough.length === 0) {
    console.error(
      "Usage: node scripts/run-with-timeout.mjs [--timeout=<ms>] -- <command> [args...]",
    );
    process.exit(2);
  }

  await acquireLock();

  const command = passthrough[0];
  const args = passthrough.slice(1);
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: false,
    env: process.env,
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    console.error(
      `[test-runner] Timeout reached (${timeoutMs}ms). Terminating hung test process...`,
    );
    try {
      child.kill("SIGTERM");
    } catch {
      // no-op
    }

    setTimeout(() => {
      if (!child.killed) {
        try {
          child.kill("SIGKILL");
        } catch {
          // no-op
        }
      }
    }, GRACEFUL_KILL_MS);
  }, timeoutMs);

  const forwardSignal = (signal) => {
    try {
      child.kill(signal);
    } catch {
      // no-op
    }
  };

  process.on("SIGINT", () => forwardSignal("SIGINT"));
  process.on("SIGTERM", () => forwardSignal("SIGTERM"));

  child.on("exit", (code, signal) => {
    clearTimeout(timer);
    removeLock();

    if (timedOut) {
      process.exit(124);
    }
    if (signal) {
      process.exit(1);
    }
    process.exit(code ?? 1);
  });
};

await main();

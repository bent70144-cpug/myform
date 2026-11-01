import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import { join } from "node:path";

/** Free TCP port helper (bind 0 → close → reuse). */
export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address !== "string" ? address.port : 0;
      server.close(() => (port ? resolve(port) : reject(new Error("no free port"))));
    });
    server.on("error", reject);
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll an async condition until it holds or the timeout elapses. */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number,
  everyMs = 200,
): Promise<void> {
  const started = Date.now();
  for (;;) {
    if (await condition()) return;
    if (Date.now() - started > timeoutMs) {
      throw new Error(`timed out after ${timeoutMs}ms waiting for condition`);
    }
    await sleep(everyMs);
  }
}

/** Wait until an HTTP endpoint answers with any status < 500. */
export async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  let lastError = "";
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
      lastError = `status ${res.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(300);
  }
  throw new Error(`service at ${url} not ready: ${lastError}`);
}

const SPIKE_ROOT = join(__dirname, "..", "..", "spike");
const REPO_ROOT = join(__dirname, "..", "..");

export const paths = {
  spikeRoot: SPIKE_ROOT,
  repoRoot: REPO_ROOT,
  probe: join(SPIKE_ROOT, "probes", "web-env-probe.cjs"),
  spikeApiMain: join(SPIKE_ROOT, "dist", "apiapp", "main.js"),
  nextBin: join(SPIKE_ROOT, "node_modules", "next", "dist", "bin", "next"),
  webappRoot: join(SPIKE_ROOT, "webapp"),
  artifactsDir: join(SPIKE_ROOT, "artifacts"),
};

export interface SpawnedProcess {
  child: ChildProcess;
  stderr: string;
  stdout: string;
  stop(): void;
}

/** Spawn a child capturing output for failure diagnostics. */
export function spawnCaptured(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv },
): SpawnedProcess {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const state: SpawnedProcess = {
    child,
    stderr: "",
    stdout: "",
    stop(): void {
      child.kill("SIGTERM");
    },
  };
  child.stdout?.on("data", (chunk: Buffer) => {
    state.stdout += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    state.stderr += chunk.toString();
  });
  return state;
}

export function dumpOnFailure(label: string, ...outputs: string[]): void {
  for (const output of outputs) {
    if (output.length > 0) process.stderr.write(`--- ${label} ---\n${output}\n`);
  }
}

import { ChildProcess, spawn } from "child_process";
import * as net from "net";

export function spawnProcess(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {}
): ChildProcess {
  const proc = spawn(cmd, args, {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env ?? {}) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout?.on("data", (d) => process.stdout.write(`[${cmd}] ${d}`));
  proc.stderr?.on("data", (d) => process.stderr.write(`[${cmd}] ${d}`));
  return proc;
}

export function waitForPort(port: number, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      const sock = net.createConnection({ port, host: "127.0.0.1" });
      sock.once("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() >= deadline) {
          reject(new Error(`port ${port} not ready after ${timeoutMs}ms`));
        } else {
          setTimeout(attempt, 200);
        }
      });
    };
    attempt();
  });
}

export function killProcess(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (proc.exitCode !== null) {
      resolve();
      return;
    }
    proc.once("exit", () => resolve());
    proc.kill("SIGTERM");
    setTimeout(() => {
      if (proc.exitCode === null) proc.kill("SIGKILL");
    }, 3000);
  });
}

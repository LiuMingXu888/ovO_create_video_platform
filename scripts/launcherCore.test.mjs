import { describe, expect, it, vi } from "vitest";
import { createLauncher } from "./launcherCore.mjs";

describe("Mac launcher core", () => {
  it("pulls the ui-shell branch, starts Vite then Electron, and cleans up after Electron exits", async () => {
    const calls = [];
    const viteProcess = createFakeProcess();
    const electronProcess = createFakeProcess();
    const launcher = createLauncher({
      cwd: "/repo",
      env: { PATH: "/bin" },
      port: 5173,
      spawnProcess(command, args, options) {
        calls.push({ command, args, cwd: options.cwd, env: options.env });

        if (command === "npm" && args.join(" ") === "run dev") {
          return viteProcess;
        }

        if (command === "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" && args.join(" ") === "/repo") {
          return electronProcess;
        }

        return createFakeProcess();
      },
      runCommand: vi.fn(async (command, args) => {
        calls.push({ command, args });
      }),
      waitForPort: vi.fn(async () => undefined),
      log: vi.fn()
    });

    const launchPromise = launcher.launch();

    await waitUntil(() => calls.some((call) => call.command.includes("Contents/MacOS/Electron")));
    electronProcess.emit("exit", 0);
    await launchPromise;

    expect(calls).toMatchObject([
      { command: "git", args: ["pull", "origin", "feature/ui-shell"] },
      { command: "bash", args: ["-lc", "lsof -ti tcp:5173 | xargs kill -TERM 2>/dev/null || true"] },
      { command: "npm", args: ["run", "dev"], cwd: "/repo" },
      { command: "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron", args: ["/repo"], cwd: "/repo" },
      { command: "bash", args: ["-lc", "lsof -ti tcp:5173 | xargs kill -TERM 2>/dev/null || true"] }
    ]);
    expect(viteProcess.killedWith).toEqual(["SIGTERM"]);
  });

  it("passes --remote-debugging-port to Electron when debugPort is set", async () => {
    const calls = [];
    const electronProcess = createFakeProcess();
    const launcher = createLauncher({
      cwd: "/repo",
      env: { PATH: "/bin" },
      port: 5173,
      debugPort: 9222,
      spawnProcess(command, args, options) {
        calls.push({ command, args, cwd: options.cwd });
        if (command === "npm" && args.join(" ") === "run dev") {
          return createFakeProcess();
        }
        if (command.includes("Contents/MacOS/Electron")) {
          return electronProcess;
        }
        return createFakeProcess();
      },
      runCommand: vi.fn(async () => undefined),
      waitForPort: vi.fn(async () => undefined),
      log: vi.fn()
    });

    const launchPromise = launcher.launch();
    await waitUntil(() => calls.some((call) => call.command.includes("Contents/MacOS/Electron")));
    electronProcess.emit("exit", 0);
    await launchPromise;

    const electronCall = calls.find((call) => call.command.includes("Contents/MacOS/Electron"));
    expect(electronCall.args).toEqual(["/repo", "--remote-debugging-port=9222"]);
  });
});

function createFakeProcess() {
  const handlers = new Map();

  return {
    killedWith: [],
    on(event, handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
      return this;
    },
    emit(event, ...args) {
      for (const handler of handlers.get(event) ?? []) {
        handler(...args);
      }
    },
    kill(signal) {
      this.killedWith.push(signal);
    }
  };
}

function waitUntil(predicate) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    function check() {
      if (predicate()) {
        resolve();
        return;
      }

      if (Date.now() - startedAt > 1000) {
        reject(new Error("Timed out waiting for predicate"));
        return;
      }

      setTimeout(check, 0);
    }

    check();
  });
}

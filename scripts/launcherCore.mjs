import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";

export function createLauncher({
  cwd,
  env = process.env,
  port = 5173,
  spawnProcess = spawn,
  runCommand = defaultRunCommand,
  waitForPort = defaultWaitForPort,
  log = console.log
}) {
  const children = new Set();
  let cleaningUp = false;

  async function killPort() {
    await runCommand("bash", ["-lc", `lsof -ti tcp:${port} | xargs kill -TERM 2>/dev/null || true`], {
      cwd,
      env,
      stdio: "inherit"
    });
  }

  function spawnTracked(command, args, options) {
    const child = spawnProcess(command, args, options);
    children.add(child);
    child.on?.("exit", () => children.delete(child));
    return child;
  }

  function cleanupChildren() {
    if (cleaningUp) {
      return;
    }

    cleaningUp = true;
    for (const child of children) {
      child.kill?.("SIGTERM");
    }
    cleaningUp = false;
  }

  async function launch() {
    installSignalHandlers(async () => {
      cleanupChildren();
      await killPort();
    });

    log("正在同步 feature/ui-shell...");
    await runCommand("git", ["pull", "origin", "feature/ui-shell"], { cwd, env, stdio: "inherit" });

    log(`正在清理 ${port} 端口...`);
    await killPort();

    log("正在启动 ovO...");
    spawnTracked("npm", ["run", "dev"], { cwd, env, stdio: "inherit" });
    await waitForPort(port, "127.0.0.1");

    const electronEnv = {
      ...env,
      VITE_DEV_SERVER_URL: `http://127.0.0.1:${port}`
    };
    const electronBinary = path.join(cwd, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron");
    const electronProcess = spawnTracked(electronBinary, [cwd], { cwd, env: electronEnv, stdio: "inherit" });

    const exitCode = await waitForExit(electronProcess);
    cleanupChildren();
    await killPort();

    return exitCode;
  }

  return { launch };
}

function installSignalHandlers(cleanup) {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, async () => {
      await cleanup();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }
}

function defaultRunCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0 || code === null) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.on?.("error", reject);
    child.on?.("exit", (code) => resolve(code ?? 0));
  });
}

function defaultWaitForPort(port, host, timeoutMs = 30_000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    function tryConnect() {
      const socket = net.createConnection({ port, host }, () => {
        socket.end();
        resolve();
      });

      socket.on("error", () => {
        socket.destroy();

        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${host}:${port}`));
          return;
        }

        setTimeout(tryConnect, 250);
      });
    }

    tryConnect();
  });
}

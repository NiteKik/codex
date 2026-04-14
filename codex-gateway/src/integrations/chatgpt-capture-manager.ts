import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { platform } from "node:os";
import { join } from "node:path";
import WebSocket, { type RawData } from "ws";
import type { WorkspaceContext } from "../types.js";
import { resolveManagedBrowserExecutablePath } from "./chatgpt-managed-browser.js";
import { parseSessionPayload } from "./chatgpt-session-utils.js";
import { nowIso } from "../utils/time.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizeProfileKey = (value: string) => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9_-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "default";
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const removeDirectoryBestEffort = async (targetDir: string) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(targetDir, {
        recursive: true,
        force: true,
      });
      return;
    } catch {
      await sleep(300 * (attempt + 1));
    }
  }
};

const getFreeTcpPort = async () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to acquire free TCP port.")));
        return;
      }

      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });

const closeBrowserProcess = async (pid: number) => {
  if (platform() === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });
      killer.once("error", () => resolve());
      killer.once("exit", () => resolve());
    });
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // ignore already exited
  }
};

type CdpPageTarget = {
  id: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
};

const waitForPageWsDebuggerTarget = async (port: number, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const payload = (await response.json()) as unknown;
        if (Array.isArray(payload)) {
          let fallback: CdpPageTarget | null = null;
          for (const item of payload) {
            if (!isRecord(item)) {
              continue;
            }

            const type = item.type;
            const url = item.url;
            const ws = item.webSocketDebuggerUrl;
            if (
              type !== "page" ||
              typeof url !== "string" ||
              typeof ws !== "string" ||
              !ws.startsWith("ws://")
            ) {
              continue;
            }

            if (url.includes("chatgpt.com") || url.includes("auth.openai.com")) {
              return {
                url,
                wsDebuggerUrl: ws,
              };
            }

            fallback ??= {
              id: typeof item.id === "string" ? item.id : "",
              type,
              url,
              webSocketDebuggerUrl: ws,
            };
          }

          if (fallback?.webSocketDebuggerUrl) {
            return {
              url: fallback.url,
              wsDebuggerUrl: fallback.webSocketDebuggerUrl,
            };
          }
        }
      }
    } catch {
      // wait until cdp endpoint is ready
    }

    await sleep(300);
  }

  throw new Error("浏览器调试端口未就绪或未检测到可调试页面。");
};

const runCdpCommand = async <T>(
  wsUrl: string,
  method: string,
  params: Record<string, unknown>,
  extractValue: (parsed: Record<string, unknown>) => T,
  timeoutMs = 15_000,
) =>
  new Promise<T>((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      try {
        socket.close();
      } catch {
        // ignore close errors
      }
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => {
        reject(new Error(`CDP ${method} timeout.`));
      });
    }, timeoutMs);

    socket.on("open", () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method,
          params,
        }),
      );
    });

    socket.on("message", (raw: RawData) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (!isRecord(parsed) || parsed.id !== 1) {
        return;
      }

      if (parsed.error) {
        finish(() => {
          reject(new Error(`CDP ${method} failed: ${JSON.stringify(parsed.error)}`));
        });
        return;
      }

      finish(() => {
        try {
          resolve(extractValue(parsed));
        } catch (error) {
          reject(error);
        }
      });
    });

    socket.on("error", (error: Error) => {
      finish(() => {
        reject(error);
      });
    });
  });

const evaluateCdpExpression = async <T>(
  wsUrl: string,
  expression: string,
  timeoutMs = 15_000,
) =>
  runCdpCommand<T>(
    wsUrl,
    "Runtime.evaluate",
    {
      expression,
      awaitPromise: true,
      returnByValue: true,
    },
    (parsed) => {
      const resultRoot = parsed.result;
      if (!isRecord(resultRoot)) {
        throw new Error("CDP evaluate returned invalid result.");
      }

      const runtimeResult = resultRoot.result;
      if (!isRecord(runtimeResult)) {
        throw new Error("CDP evaluate returned invalid runtime result.");
      }

      return runtimeResult.value as T;
    },
    timeoutMs,
  );

const navigateCdpPage = async (wsUrl: string, url: string, timeoutMs = 15_000) =>
  runCdpCommand<void>(
    wsUrl,
    "Page.navigate",
    {
      url,
    },
    () => undefined,
    timeoutMs,
  );

const tryFetchSessionViaCdp = async (wsUrl: string) =>
  evaluateCdpExpression<{
    ok: boolean;
    status?: number;
    text?: string;
    error?: string;
  }>(
    wsUrl,
    `(async () => {
      try {
        const response = await fetch('/api/auth/session', {
          credentials: 'include',
          cache: 'no-store'
        });
        const text = await response.text();
        return { ok: response.ok, status: response.status, text };
      } catch (error) {
        return { ok: false, error: String(error) };
      }
    })()`,
  );

const tryFetchUsageViaCdp = async (wsUrl: string, accessToken: string) =>
  evaluateCdpExpression<{
    ok: boolean;
    status?: number;
    payload?: unknown;
  }>(
    wsUrl,
    (() => {
      const tokenLiteral = JSON.stringify(accessToken);
      return `(async () => {
      const token = ${tokenLiteral};
      try {
        const response = await fetch('/backend-api/wham/usage', {
          method: 'GET',
          credentials: 'include',
          headers: {
            'accept': 'application/json, text/plain, */*',
            'authorization': \`Bearer \${token}\`,
            'x-openai-target-path': '/backend-api/wham/usage',
            'x-openai-target-route': '/backend-api/wham/usage'
          }
        });

        if (!response.ok) {
          return { ok: false, status: response.status };
        }

        const payload = await response.json();
        return { ok: true, status: response.status, payload };
      } catch {
        return { ok: false };
      }
    })()`;
    })(),
  );

export type ChatgptCaptureTaskState = "running" | "completed" | "failed";

type ChatgptCaptureResult = {
  email: string;
  accessToken: string;
  workspace: WorkspaceContext;
  sessionPayload: unknown;
  usagePayload: unknown | null;
  capturedAt: string;
  profileKey: string;
};

type ChatgptCaptureTask = {
  id: string;
  state: ChatgptCaptureTaskState;
  profileKey: string;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  progressMessage: string;
  errorMessage: string | null;
  result: ChatgptCaptureResult | null;
};

export type ChatgptCapturePublicTask = {
  id: string;
  state: ChatgptCaptureTaskState;
  profileKey: string;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  progressMessage: string;
  errorMessage: string | null;
  result:
    | {
        email: string;
        workspace: WorkspaceContext;
        hasUsagePayload: boolean;
        capturedAt: string;
        profileKey: string;
      }
    | null;
};

type StartCaptureOptions = {
  profileKey: string;
  timeoutMs: number;
  pollIntervalMs: number;
  browserExecutablePath?: string;
};

const toPublicTask = (task: ChatgptCaptureTask): ChatgptCapturePublicTask => ({
  id: task.id,
  state: task.state,
  profileKey: task.profileKey,
  startedAt: task.startedAt,
  updatedAt: task.updatedAt,
  finishedAt: task.finishedAt,
  progressMessage: task.progressMessage,
  errorMessage: task.errorMessage,
  result: task.result
    ? {
        email: task.result.email,
        workspace: task.result.workspace,
        hasUsagePayload: task.result.usagePayload !== null,
        capturedAt: task.result.capturedAt,
        profileKey: task.result.profileKey,
      }
    : null,
});

const captureSessionWithBrowser = async (
  options: StartCaptureOptions,
  profileDir: string,
  onProgress: (message: string) => void,
) => {
  const executablePath = resolveManagedBrowserExecutablePath(options.browserExecutablePath);
  if (!executablePath) {
    throw new Error(
      "未找到可用 Chrome 浏览器。请安装 Chrome 或设置 chrome.exe 路径。",
    );
  }

  onProgress("启动浏览器并挂载调试通道...");
  const debugPort = await getFreeTcpPort();
  mkdirSync(profileDir, { recursive: true });
  const sessionDir = mkdtempSync(join(profileDir, "capture-"));
  const browserArgs = [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${sessionDir}`,
    "https://chatgpt.com/",
  ];
  const browserProcess = spawn(executablePath, browserArgs, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  browserProcess.unref();

  try {
    const target = await waitForPageWsDebuggerTarget(debugPort, 20_000);
    const wsDebuggerUrl = target.wsDebuggerUrl;
    if (!target.url.includes("chatgpt.com") && !target.url.includes("auth.openai.com")) {
      onProgress("浏览器首屏不是 ChatGPT，正在自动从 about:blank/new tab 跳转...");
      await navigateCdpPage(wsDebuggerUrl, "https://chatgpt.com/");
      await sleep(1_500);
    }
    onProgress("浏览器已启动，本次使用全新会话环境，并已打开 ChatGPT 首页，请像正常用户一样点击登录并完成流程。");

    const deadline = Date.now() + options.timeoutMs;
    while (Date.now() < deadline) {
      onProgress("等待登录完成并抓取会话中...");
      const sessionResult = await tryFetchSessionViaCdp(wsDebuggerUrl);

      if (sessionResult.ok && typeof sessionResult.text === "string") {
        try {
          const sessionPayload = JSON.parse(sessionResult.text) as unknown;
          const parsed = parseSessionPayload(sessionPayload);
          if (parsed) {
            onProgress(`已识别账号 ${parsed.email}，正在获取额度信息...`);
            const usageResult = await tryFetchUsageViaCdp(wsDebuggerUrl, parsed.accessToken);

            return {
              email: parsed.email,
              accessToken: parsed.accessToken,
              workspace: parsed.workspace,
              sessionPayload,
              usagePayload: usageResult.ok ? usageResult.payload ?? null : null,
              capturedAt: nowIso(),
              profileKey: options.profileKey,
            };
          }
        } catch {
          // keep polling until session payload is ready
        }
      }

      await sleep(options.pollIntervalMs);
    }

    throw new Error("登录会话采集超时，请重试。");
  } finally {
    if (typeof browserProcess.pid === "number") {
      await closeBrowserProcess(browserProcess.pid);
    }
    await removeDirectoryBestEffort(sessionDir);
  }
};

export class ChatgptCaptureManager {
  private readonly tasks = new Map<string, ChatgptCaptureTask>();

  constructor(private readonly profileRootDir: string) {
    mkdirSync(this.profileRootDir, { recursive: true });
  }

  startCapture(options: StartCaptureOptions) {
    const profileKey = sanitizeProfileKey(options.profileKey);
    const taskId = `capture_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = nowIso();

    const task: ChatgptCaptureTask = {
      id: taskId,
      state: "running",
      profileKey,
      startedAt,
      updatedAt: startedAt,
      finishedAt: null,
      progressMessage: "初始化登录采集任务中...",
      errorMessage: null,
      result: null,
    };
    this.tasks.set(taskId, task);

    void this.runCaptureTask(taskId, {
      ...options,
      profileKey,
    });

    return toPublicTask(task);
  }

  getTask(taskId: string) {
    const task = this.tasks.get(taskId);
    return task ? toPublicTask(task) : null;
  }

  getCompletedResult(taskId: string) {
    const task = this.tasks.get(taskId);
    if (!task || task.state !== "completed" || !task.result) {
      return null;
    }

    return task.result;
  }

  private async runCaptureTask(taskId: string, options: StartCaptureOptions) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    const updateProgress = (message: string) => {
      const current = this.tasks.get(taskId);
      if (!current) {
        return;
      }
      current.progressMessage = message;
      current.updatedAt = nowIso();
    };

    try {
      const result = await captureSessionWithBrowser(
        options,
        join(this.profileRootDir, options.profileKey),
        updateProgress,
      );

      const current = this.tasks.get(taskId);
      if (!current) {
        return;
      }

      current.state = "completed";
      current.result = result;
      current.finishedAt = nowIso();
      current.updatedAt = current.finishedAt;
      current.progressMessage = "采集完成，可保存到账号池。";
    } catch (error) {
      const current = this.tasks.get(taskId);
      if (!current) {
        return;
      }

      current.state = "failed";
      current.errorMessage = error instanceof Error ? error.message : "Unknown capture error.";
      current.finishedAt = nowIso();
      current.updatedAt = current.finishedAt;
      current.progressMessage = "采集失败。";
    }
  }
}

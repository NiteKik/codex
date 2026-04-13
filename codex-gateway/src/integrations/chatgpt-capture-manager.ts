import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { platform } from "node:os";
import { join } from "node:path";
import WebSocket, { type RawData } from "ws";
import { nowIso } from "../utils/time.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const pickStringAtPath = (payload: unknown, path: string[]) => {
  let cursor: unknown = payload;
  for (const key of path) {
    if (!isRecord(cursor)) {
      return null;
    }
    cursor = cursor[key];
  }

  return typeof cursor === "string" && cursor.trim().length > 0 ? cursor.trim() : null;
};

const parseSessionPayload = (payload: unknown) => {
  const email = pickStringAtPath(payload, ["user", "email"]) ?? pickStringAtPath(payload, ["email"]);
  const accessToken =
    pickStringAtPath(payload, ["accessToken"]) ?? pickStringAtPath(payload, ["access_token"]);

  if (!email || !accessToken) {
    return null;
  }

  return {
    email,
    accessToken,
  };
};

const sanitizeProfileKey = (value: string) => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9_-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "default";
};

const resolveBrowserExecutablePath = (preferredPath?: string) => {
  const candidates = [
    preferredPath,
    process.env.BROWSER_EXECUTABLE_PATH,
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium",
  ].filter((candidate): candidate is string => Boolean(candidate && candidate.trim().length > 0));

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

const waitForChatgptPageWsDebuggerUrl = async (port: number, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const payload = (await response.json()) as unknown;
        if (Array.isArray(payload)) {
          const target = payload.find((item): item is CdpPageTarget => {
            if (!isRecord(item)) {
              return false;
            }

            const type = item.type;
            const url = item.url;
            const ws = item.webSocketDebuggerUrl;
            return (
              type === "page" &&
              typeof url === "string" &&
              url.includes("chatgpt.com") &&
              typeof ws === "string" &&
              ws.startsWith("ws://")
            );
          });

          if (target?.webSocketDebuggerUrl) {
            return target.webSocketDebuggerUrl;
          }
        }
      }
    } catch {
      // wait until cdp endpoint is ready
    }

    await sleep(300);
  }

  throw new Error("浏览器调试端口未就绪或未检测到 chatgpt 页面。");
};

const evaluateCdpExpression = async <T>(
  wsUrl: string,
  expression: string,
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
        reject(new Error("CDP Runtime.evaluate timeout."));
      });
    }, timeoutMs);

    socket.on("open", () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: {
            expression,
            awaitPromise: true,
            returnByValue: true,
          },
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
          reject(new Error(`CDP evaluate failed: ${JSON.stringify(parsed.error)}`));
        });
        return;
      }

      const resultRoot = parsed.result;
      if (!isRecord(resultRoot)) {
        finish(() => {
          reject(new Error("CDP evaluate returned invalid result."));
        });
        return;
      }

      const runtimeResult = resultRoot.result;
      if (!isRecord(runtimeResult)) {
        finish(() => {
          reject(new Error("CDP evaluate returned invalid runtime result."));
        });
        return;
      }

      finish(() => {
        resolve(runtimeResult.value as T);
      });
    });

    socket.on("error", (error: Error) => {
      finish(() => {
        reject(error);
      });
    });
  });

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
  const executablePath = resolveBrowserExecutablePath(options.browserExecutablePath);
  if (!executablePath) {
    throw new Error(
      "未找到可用浏览器可执行文件。请安装 Edge/Chrome 或设置 BROWSER_EXECUTABLE_PATH。",
    );
  }

  onProgress("启动浏览器并挂载调试通道...");
  const debugPort = await getFreeTcpPort();
  const browserArgs = [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${join(profileDir, "profile")}`,
    "https://chatgpt.com/auth/login",
  ];
  const browserProcess = spawn(executablePath, browserArgs, {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  browserProcess.unref();

  try {
    const wsDebuggerUrl = await waitForChatgptPageWsDebuggerUrl(debugPort, 20_000);
    onProgress("浏览器已启动，请在窗口中完成 ChatGPT 登录。");

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

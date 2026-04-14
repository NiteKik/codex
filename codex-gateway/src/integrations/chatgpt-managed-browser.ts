import { existsSync } from "node:fs";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

export type ManagedBrowserSession = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
};

const normalizeUrl = (value: string) => value.trim().toLowerCase();

const isHttpUrl = (value: string) => {
  const normalized = normalizeUrl(value);
  return normalized.startsWith("https://") || normalized.startsWith("http://");
};

const isBrowserInternalUrl = (value: string) => {
  const normalized = normalizeUrl(value);
  if (!normalized || normalized === "about:blank") {
    return true;
  }

  return (
    normalized.startsWith("chrome://") ||
    normalized.startsWith("edge://") ||
    normalized.startsWith("about:")
  );
};

const shouldNavigateToStartupUrl = (value: string, startupUrl: string) => {
  if (isBrowserInternalUrl(value)) {
    return true;
  }

  if (!isHttpUrl(value)) {
    return true;
  }

  const startupHost = (() => {
    try {
      return new URL(startupUrl).host.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (!startupHost) {
    return false;
  }

  try {
    const currentHost = new URL(value).host.toLowerCase();
    return currentHost !== startupHost;
  } catch {
    return true;
  }
};

const resolvePrimaryPage = async (context: BrowserContext, startupUrl: string) => {
  const pages = context.pages().filter((page) => !page.isClosed());
  const existing =
    pages.find((page) => {
      const url = normalizeUrl(page.url());
      return url.startsWith("https://chatgpt.com") || url.startsWith("https://auth.openai.com");
    }) ??
    pages.find((page) => {
      const url = normalizeUrl(page.url());
      return url.length > 0 && url !== "about:blank";
    });

  let page = existing ?? (pages[0] ?? (await context.newPage()));
  if (shouldNavigateToStartupUrl(page.url(), startupUrl)) {
    try {
      await page.goto(startupUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
    } catch {
      page = await context.newPage();
      await page.goto(startupUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
    }
  }

  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(60_000);
  await page.bringToFront().catch(() => undefined);
  return page;
};

const isChromeExecutablePath = (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized.endsWith("\\chrome.exe") ||
    normalized.includes("/google chrome.app/contents/macos/google chrome") ||
    normalized.endsWith("/google-chrome")
  );
};

export const resolveManagedBrowserExecutablePath = (preferredPath?: string) => {
  const candidates = [
    preferredPath,
    process.env.BROWSER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
  ]
    .filter((candidate): candidate is string => Boolean(candidate && candidate.trim().length > 0))
    .filter((candidate) => isChromeExecutablePath(candidate));

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
};

export const launchManagedBrowserSession = async (options: {
  executablePath?: string;
  headless: boolean;
  startupUrl: string;
  timeoutMs?: number;
}) => {
  if (process.versions.bun) {
    throw new Error(
      "检测到 Bun 运行时。当前 Windows + Bun 与 Playwright 浏览器启动存在兼容性问题，请使用 Node 启动网关（例如：bun run --cwd ./codex-gateway start）。",
    );
  }

  const launchTimeoutMs = Math.max(30_000, options.timeoutMs ?? 30_000);
  const executablePath =
    options.executablePath?.trim() || resolveManagedBrowserExecutablePath() || undefined;
  const browser = await chromium.launch({
    executablePath,
    headless: options.headless,
    timeout: launchTimeoutMs,
    args: [
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-search-engine-choice-screen",
      "--disable-extensions",
      "--disable-component-extensions-with-background-pages",
      "--disable-default-apps",
      "--no-service-autorun",
      "--new-window",
    ],
  });

  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
  });

  const page = await resolvePrimaryPage(context, options.startupUrl);
  return {
    browser,
    context,
    page,
  } satisfies ManagedBrowserSession;
};

export const closeManagedBrowserSession = async (session: ManagedBrowserSession) => {
  await session.context.close().catch(() => undefined);
  await session.browser.close().catch(() => undefined);
};

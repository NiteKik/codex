import { mkdirSync } from "node:fs";
import { type Locator, type Page } from "playwright-core";
import { AccountManager } from "../accounts/account-manager.js";
import { GatewayDatabase } from "../db/database.js";
import { getAccountAutomationSettings } from "../runtime-settings.js";
import type { Account, WorkspaceContext } from "../types.js";
import { nowIso } from "../utils/time.js";
import {
  closeManagedBrowserSession,
  launchManagedBrowserSession,
} from "./chatgpt-managed-browser.js";
import { parseSessionPayload } from "./chatgpt-session-utils.js";
import { TempMailClient } from "./temp-mail-client.js";

const loginUrl = "https://chatgpt.com/";
const sessionInfoSettingKey = (accountId: string) => `account_session_info:${accountId}`;
const phoneFailureMessage = "检测到手机号验证或 add-phone 风控，自动刷新 session 失败。";
const computeBrowserLaunchTimeoutMs = (taskTimeoutMs: number) =>
  Math.min(180_000, Math.max(60_000, Math.floor(taskTimeoutMs * 0.4)));

const emailSelectors = [
  "input[type='email']",
  "input[name='email']",
  "input[name='username']",
  "input[autocomplete='email']",
];
const loginEntrySelectors = [
  "[data-testid='login-button']",
  "button:has-text('Log in')",
  "a:has-text('Log in')",
  "button:has-text('Login')",
  "a:has-text('Login')",
  "button:has-text('登录')",
  "a:has-text('登录')",
  "button:has-text('开始使用')",
  "a:has-text('开始使用')",
];
const continueWithEmailSelectors = [
  "button:has-text('Continue with email')",
  "button:has-text('Continue with email address')",
  "button:has-text('使用邮箱继续')",
  "button:has-text('继续使用邮箱')",
];
const passwordSelectors = [
  "input[type='password']",
  "input[name='password']",
  "input[name='current-password']",
];
const loginPasswordUrlMarkers = ["/u/login/password", "/log-in/password", "/login/password"];
const otpSelectors = [
  "input[name='code']",
  "input[name*='otp']",
  "input[name*='verification']",
  "input[inputmode='numeric']",
  "input[autocomplete='one-time-code']",
  "input[data-index='0']",
];
const primaryActionSelectors = [
  "button[type='submit']",
  "button:has-text('Continue')",
  "button:has-text('Next')",
  "button:has-text('Verify')",
  "button:has-text('Log in')",
  "button:has-text('Login')",
  "button:has-text('继续')",
  "button:has-text('下一步')",
  "button:has-text('验证')",
  "button:has-text('登录')",
];
const passiveOverlaySelectors = [
  "button:has-text('Accept')",
  "button:has-text('Accept all')",
  "button:has-text('Reject all')",
  "button:has-text('Reject non-essential')",
  "button:has-text('I agree')",
  "button:has-text('Allow all')",
  "button:has-text('Got it')",
  "button:has-text('全部接受')",
  "button:has-text('拒绝非必需')",
  "button:has-text('接受')",
  "button:has-text('同意')",
  "button:has-text('知道了')",
];
const interstitialSelectors = [
  "button:has-text('Continue')",
  "button:has-text('Next')",
  "button:has-text('Done')",
  "button:has-text('Get started')",
  "button:has-text('Let\\'s go')",
  "button:has-text('Skip')",
  "button:has-text('Not now')",
  "button:has-text('Start chatting')",
  "button:has-text('继续')",
  "button:has-text('下一步')",
  "button:has-text('完成')",
  "button:has-text('跳过')",
  "button:has-text('暂不')",
  "button:has-text('稍后')",
  "button:has-text('以后再说')",
  "button:has-text('下次再说')",
  "button:has-text('开始使用')",
];
const phoneMarkers = [
  "add-phone",
  "add_phone",
  "phone-verification",
  "phone_verification",
  "verify-phone",
  "verify_phone",
  "/phone",
  "phone number",
  "phone required",
  "verify your phone",
  "手机号",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const pageText = async (page: Page) => {
  try {
    return (await page.locator("body").innerText({ timeout: 2_000 })).toLowerCase();
  } catch {
    return "";
  }
};

const isVisible = async (page: Page, selector: string) => {
  try {
    const locator = page.locator(selector).first();
    return (await locator.count()) > 0 && (await locator.isVisible());
  } catch {
    return false;
  }
};

const isAnyVisible = async (page: Page, selectors: string[]) => {
  for (const selector of selectors) {
    if (await isVisible(page, selector)) {
      return true;
    }
  }

  return false;
};

const hasAuthLikeUrl = (page: Page) => {
  const url = page.url().toLowerCase();
  return url.includes("/auth/") || url.includes("/login") || url.includes("auth.openai.com");
};

const typeIntoLocator = async (locator: Locator, value: string) => {
  await locator.click({ delay: 80 + Math.floor(Math.random() * 80) });
  await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(
    () => undefined,
  );
  await locator.press("Backspace").catch(() => undefined);
  await locator.type(value, { delay: 35 + Math.floor(Math.random() * 30) });
};

const fillFirstVisible = async (page: Page, selectors: string[], value: string) => {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if ((await locator.count()) > 0 && (await locator.isVisible())) {
        await typeIntoLocator(locator, value);
        return true;
      }
    } catch {
      // keep trying other selectors
    }
  }

  return false;
};

const clickFirstVisible = async (page: Page, selectors: string[]) => {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if ((await locator.count()) > 0 && (await locator.isVisible())) {
        await locator.click({ delay: 80 + Math.floor(Math.random() * 80) });
        return true;
      }
    } catch {
      // keep trying
    }
  }

  return false;
};

const isPhoneBlocked = async (page: Page) => {
  const url = page.url().toLowerCase();
  if (phoneMarkers.some((marker) => url.includes(marker))) {
    return true;
  }

  const text = await pageText(page);
  return phoneMarkers.some((marker) => text.includes(marker));
};

const dismissPassiveOverlays = async (page: Page, onProgress: (message: string) => void) => {
  if (await clickFirstVisible(page, passiveOverlaySelectors)) {
    onProgress("检测到欢迎弹窗，正在按页面提示继续...");
    await page.waitForTimeout(1_000);
    return true;
  }

  return false;
};

const clickThroughInterstitials = async (page: Page, onProgress: (message: string) => void) => {
  if (await clickFirstVisible(page, interstitialSelectors)) {
    onProgress("检测到欢迎页或引导页，正在继续进入主界面...");
    await page.waitForTimeout(1_000);
    return true;
  }

  return false;
};

const isLoginPasswordPage = async (page: Page) => {
  const url = page.url().toLowerCase();
  if (loginPasswordUrlMarkers.some((marker) => url.includes(marker))) {
    return true;
  }

  if (!(await isVisible(page, "input[type='password'], input[name='current-password']"))) {
    return false;
  }

  const text = await pageText(page);
  return (
    text.includes("enter your password") ||
    text.includes("输入密码") ||
    text.includes("password")
  );
};

const fillOtpCode = async (page: Page, code: string) => {
  if (await isVisible(page, "input[data-index='0']")) {
    for (let index = 0; index < code.length; index += 1) {
      const selector = `input[data-index='${index}']`;
      if (await isVisible(page, selector)) {
        await typeIntoLocator(page.locator(selector).first(), code[index] ?? "");
      }
    }
    return true;
  }

  return fillFirstVisible(page, otpSelectors, code);
};

const tryCaptureSessionPayload = async (page: Page) => {
  try {
    const result = await page.evaluate(async () => {
      try {
        const response = await fetch("/api/auth/session", {
          credentials: "include",
          cache: "no-store",
        });
        const text = await response.text();
        return {
          ok: response.ok,
          text,
        };
      } catch (error) {
        return {
          ok: false,
          text: String(error),
        };
      }
    });

    if (!result.ok || typeof result.text !== "string") {
      return null;
    }

    const payload = JSON.parse(result.text) as unknown;
    const parsed = parseSessionPayload(payload);
    return parsed
      ? {
          sessionPayload: payload,
          parsed,
        }
      : null;
  } catch {
    return null;
  }
};

const isReadyForLogin = async (page: Page) =>
  (await isAnyVisible(page, emailSelectors)) ||
  (await isLoginPasswordPage(page)) ||
  (await isAnyVisible(page, otpSelectors));

const openLoginFromHomepage = async (page: Page, onProgress: (message: string) => void) => {
  const entryPoints = [
    {
      url: loginUrl,
      progress: "正在打开 ChatGPT 登录入口...",
    },
  ];

  let navigated = false;
  let lastNavigationError: unknown = null;
  for (const entry of entryPoints) {
    onProgress(entry.progress);
    try {
      await page.goto(entry.url, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForTimeout(1_200);
      navigated = true;
      break;
    } catch (error) {
      lastNavigationError = error;
    }
  }

  if (!navigated) {
    throw new Error(
      `无法打开 ChatGPT 登录入口：${
        lastNavigationError instanceof Error ? lastNavigationError.message : "未知导航错误"
      }`,
    );
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (page.url().toLowerCase() === "about:blank") {
      onProgress("浏览器停留在 about:blank，正在重试跳转登录入口...");
      await page.goto(loginUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForTimeout(1_000);
    }

    if (await isReadyForLogin(page)) {
      return;
    }

    if (await dismissPassiveOverlays(page, onProgress)) {
      continue;
    }

    if (await clickFirstVisible(page, continueWithEmailSelectors)) {
      onProgress("正在切换到邮箱登录表单...");
      await page.waitForTimeout(1_200);
      continue;
    }

    if (await clickFirstVisible(page, loginEntrySelectors)) {
      onProgress("正在通过首页入口进入登录流程...");
      await page.waitForTimeout(1_500);
      if ((await isReadyForLogin(page)) || hasAuthLikeUrl(page)) {
        return;
      }
      continue;
    }

    if (await clickThroughInterstitials(page, onProgress)) {
      continue;
    }

    if (hasAuthLikeUrl(page)) {
      return;
    }

    await page.waitForTimeout(1_500);
  }

  throw new Error("未能进入登录流程，请检查首页按钮或登录页结构是否变化。");
};

type BrowserRefreshCapture = {
  parsed: {
    email: string;
    accessToken: string;
    workspace: WorkspaceContext;
  };
  sessionPayload: unknown;
  capturedAt: string;
};

export type ManagedSessionRefreshResult = {
  accountId: string;
  email: string;
  capturedAt: string;
  workspace: WorkspaceContext;
};

type RefreshAccountOptions = {
  reason: string;
  timeoutMs?: number;
  headless?: boolean;
  browserExecutablePath?: string;
};

export class ChatgptSessionRefreshManager {
  private readonly executions = new Map<string, Promise<ManagedSessionRefreshResult>>();

  constructor(
    private readonly profileRootDir: string,
    private readonly db: GatewayDatabase,
    private readonly accountManager: AccountManager,
  ) {
    mkdirSync(this.profileRootDir, { recursive: true });
  }

  canRefreshAccount(account: Account | null | undefined) {
    return Boolean(
      account &&
        account.managedByGateway &&
        account.auth.mode === "bearer" &&
        account.loginEmail?.trim() &&
        account.loginPassword?.trim(),
    );
  }

  async refreshAccountSession(
    accountId: string,
    options: RefreshAccountOptions,
  ): Promise<ManagedSessionRefreshResult> {
    const running = this.executions.get(accountId);
    if (running) {
      return running;
    }

    const execution = this.runRefresh(accountId, options).finally(() => {
      this.executions.delete(accountId);
    });
    this.executions.set(accountId, execution);
    return execution;
  }

  private async runRefresh(accountId: string, options: RefreshAccountOptions) {
    const account = this.accountManager.getAccount(accountId);
    if (!account || !this.canRefreshAccount(account)) {
      throw new Error(`账号 ${accountId} 缺少受管登录信息，无法自动刷新 session。`);
    }
    const loginEmail = account.loginEmail?.trim();
    const loginPassword = account.loginPassword?.trim();
    if (!loginEmail || !loginPassword) {
      throw new Error(`账号 ${accountId} 缺少受管登录信息，无法自动刷新 session。`);
    }

    const startedAt = nowIso();
    this.updateAccount(accountId, {
      provisionState: "running",
      lastProvisionAttemptAt: startedAt,
      lastProvisionError: null,
    });

    const reason = options.reason.trim() || "managed-refresh";
    this.db.logRuntime({
      level: "info",
      scope: "session-refresh",
      event: "refresh.started",
      message: "受管账号开始自动刷新 session",
      accountId,
      detailsJson: JSON.stringify({
        reason,
      }),
      createdAt: startedAt,
    });

    try {
      const settings = getAccountAutomationSettings(this.db);
      const timeoutMs = Math.max(60_000, options.timeoutMs ?? settings.autoRegisterTimeoutMs);
      const headless = options.headless ?? settings.autoRegisterHeadless;
      const tempMail =
        settings.tempMailBaseUrl.trim() &&
        settings.tempMailAdminPassword.trim() &&
        settings.tempMailDefaultDomain.trim()
          ? new TempMailClient({
              baseUrl: settings.tempMailBaseUrl,
              adminPassword: settings.tempMailAdminPassword,
              sitePassword: settings.tempMailSitePassword,
              defaultDomain: settings.tempMailDefaultDomain,
            })
          : null;

      const capture = await this.loginWithBrowser(
        {
          email: loginEmail,
          password: loginPassword,
          timeoutMs,
          headless,
        },
        tempMail,
        (message) => {
          this.db.logRuntime({
            level: "info",
            scope: "session-refresh",
            event: "refresh.progress",
            message,
            accountId,
            detailsJson: JSON.stringify({
              reason,
            }),
            createdAt: nowIso(),
          });
        },
      );

      if (capture.parsed.email.toLowerCase() !== loginEmail.toLowerCase()) {
        throw new Error(
          `刷新 session 时登录到了 ${capture.parsed.email}，与账号池记录 ${loginEmail} 不一致。`,
        );
      }

      this.updateAccount(accountId, {
        auth: {
          mode: "bearer",
          token: capture.parsed.accessToken,
        },
        workspace: capture.parsed.workspace,
        status: "healthy",
        provisionState: "ready",
        lastProvisionAttemptAt: capture.capturedAt,
        lastProvisionedAt: capture.capturedAt,
        lastProvisionError: null,
        consecutiveFailures: 0,
        consecutive429: 0,
        cooldownUntil: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      });
      this.db.setRuntimeSetting(sessionInfoSettingKey(accountId), JSON.stringify(capture.sessionPayload));

      this.db.logRuntime({
        level: "info",
        scope: "session-refresh",
        event: "refresh.completed",
        message: "受管账号 session 刷新完成",
        accountId,
        detailsJson: JSON.stringify({
          reason,
          email: capture.parsed.email,
        }),
        createdAt: nowIso(),
      });

      return {
        accountId,
        email: capture.parsed.email,
        capturedAt: capture.capturedAt,
        workspace: capture.parsed.workspace,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "自动刷新 session 失败。";
      this.updateAccount(accountId, {
        provisionState: "failed",
        lastProvisionAttemptAt: nowIso(),
        lastProvisionError: message,
      });
      this.db.logRuntime({
        level: "warn",
        scope: "session-refresh",
        event: "refresh.failed",
        message,
        accountId,
        detailsJson: JSON.stringify({
          reason,
        }),
        createdAt: nowIso(),
      });
      throw error;
    }
  }

  private updateAccount(accountId: string, patch: Partial<Account>) {
    const current = this.accountManager.getAccount(accountId);
    if (!current) {
      return;
    }

    this.accountManager.upsertAccount({
      ...current,
      ...patch,
      updatedAt: nowIso(),
    });
  }

  private async loginWithBrowser(
    options: {
      email: string;
      password: string;
      timeoutMs: number;
      headless: boolean;
    },
    tempMail: TempMailClient | null,
    onProgress: (message: string) => void,
  ): Promise<BrowserRefreshCapture> {
    onProgress("正在以新方式启动自动化浏览器...");
    const launchTimeoutMs = computeBrowserLaunchTimeoutMs(options.timeoutMs);
    const session = await launchManagedBrowserSession({
      headless: options.headless,
      startupUrl: loginUrl,
      timeoutMs: launchTimeoutMs,
    });
    const { page } = session;

    try {
      onProgress("正在进入 ChatGPT 登录流程...");
      await openLoginFromHomepage(page, onProgress);
      await page.bringToFront().catch(() => undefined);

      const deadline = Date.now() + options.timeoutMs;
      let lastOtpCode: string | null = null;

      while (Date.now() < deadline) {
        if (page.url().toLowerCase() === "about:blank") {
          onProgress("浏览器停留在 about:blank，正在重新打开登录入口...");
          await page.goto(loginUrl, {
            waitUntil: "domcontentloaded",
            timeout: 60_000,
          });
          await page.waitForTimeout(1_200);
          continue;
        }

        if (await isPhoneBlocked(page)) {
          throw new Error(phoneFailureMessage);
        }

        const captured = await tryCaptureSessionPayload(page);
        if (captured) {
          if (await clickThroughInterstitials(page, onProgress)) {
            continue;
          }
          return {
            parsed: captured.parsed,
            sessionPayload: captured.sessionPayload,
            capturedAt: nowIso(),
          };
        }

        if (await dismissPassiveOverlays(page, onProgress)) {
          continue;
        }

        if (await clickFirstVisible(page, continueWithEmailSelectors)) {
          onProgress("正在切换到邮箱登录表单...");
          await page.waitForTimeout(1_000);
          continue;
        }

        if (await isAnyVisible(page, emailSelectors)) {
          onProgress("正在提交登录邮箱...");
          await fillFirstVisible(page, emailSelectors, options.email);
          await clickFirstVisible(page, primaryActionSelectors);
          await page.waitForTimeout(1_200);
          continue;
        }

        if (await isLoginPasswordPage(page)) {
          onProgress("正在提交登录密码...");
          await fillFirstVisible(page, passwordSelectors, options.password);
          await clickFirstVisible(page, primaryActionSelectors);
          await page.waitForTimeout(1_200);
          continue;
        }

        if (await isAnyVisible(page, otpSelectors)) {
          if (!tempMail) {
            throw new Error("当前账号登录需要邮箱验证码，但未配置可用的 Temp Mail 接口。");
          }

          onProgress("正在等待邮箱验证码...");
          const code = await tempMail.waitForVerificationCode(options.email, {
            timeoutMs: Math.min(120_000, Math.max(20_000, deadline - Date.now())),
            excludeCodes: lastOtpCode ? [lastOtpCode] : [],
          });
          lastOtpCode = code;
          onProgress("已收到验证码，正在自动填写...");
          await fillOtpCode(page, code);
          await clickFirstVisible(page, primaryActionSelectors);
          await page.waitForTimeout(1_200);
          continue;
        }

        if (await clickThroughInterstitials(page, onProgress)) {
          continue;
        }

        await page.waitForLoadState("domcontentloaded").catch(() => undefined);
        await sleep(1_200);
      }

      throw new Error("自动刷新 session 超时，未能在限定时间内完成登录采集。");
    } finally {
      await closeManagedBrowserSession(session);
    }
  }
}

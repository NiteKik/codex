import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { type BrowserContext, type Locator, type Page } from "playwright-core";
import { AccountManager } from "../accounts/account-manager.js";
import { config } from "../config.js";
import { GatewayDatabase } from "../db/database.js";
import { parseSessionPayload } from "./chatgpt-session-utils.js";
import {
  closeManagedBrowserSession,
  launchManagedBrowserSession,
} from "./chatgpt-managed-browser.js";
import { TempMailClient } from "./temp-mail-client.js";
import { GenericHttpProvider } from "../providers/generic-http-provider.js";
import { getAccountAutomationSettings } from "../runtime-settings.js";
import type { WorkspaceContext } from "../types.js";
import { nowIso } from "../utils/time.js";

const phoneFailureMessage = "检测到手机号验证或 add-phone 风控，自动注册失败。";
const sessionInfoSettingKey = (accountId: string) => `account_session_info:${accountId}`;
const chatgptHomeUrl = "https://chatgpt.com/";
const reusableMailboxPoolSettingKey = "auto_register_reusable_mailboxes";
const reusableMailboxPoolMaxSize = 60;
const reusableMailboxRetentionMs = 7 * 24 * 60 * 60_000;

const passwordCharacters =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
const emailSelectors = [
  "input[type='email']",
  "input[name='email']",
  "input[name='username']",
  "input[autocomplete='email']",
];
const continueWithEmailSelectors = [
  "button:has-text('Continue with email')",
  "button:has-text('Continue with email address')",
  "a:has-text('Continue with email')",
  "a:has-text('Continue with email address')",
  "button:has-text('使用邮箱继续')",
  "button:has-text('继续使用邮箱')",
  "button:has-text('继续使用电子邮件地址登录')",
  "button:has-text('继续使用邮箱地址登录')",
  "button:has-text('继续使用工作电子邮件地址登录')",
  "[role='button']:has-text('继续使用电子邮件地址登录')",
  "[role='button']:has-text('继续使用邮箱地址登录')",
  "[role='button']:has-text('继续使用邮箱')",
];
const phoneEntrySelectors = [
  "input[type='tel']",
  "input[inputmode='tel']",
  "input[autocomplete='tel']",
  "input[placeholder*='Phone']",
  "input[placeholder*='phone']",
  "input[placeholder*='手机号']",
  "input[aria-label*='Phone']",
  "input[aria-label*='phone']",
  "input[aria-label*='手机号']",
  "button:has-text('国家')",
  "button:has-text('国家/地区')",
  "button:has-text('日本 +(81)')",
];
const signupEntrySelectors = [
  "[data-testid='signup-button']",
  "button:has-text('免费注册')",
  "a:has-text('免费注册')",
  "button:has-text('Sign up')",
  "a:has-text('Sign up')",
  "button:has-text('Create account')",
  "a:has-text('Create account')",
  "button:has-text('注册')",
  "a:has-text('注册')",
];
const homepageFallbackEntrySelectors = [
  "[data-testid='login-button']",
  "button:has-text('Log in')",
  "a:has-text('Log in')",
  "button:has-text('Get started')",
  "a:has-text('Get started')",
  "button:has-text('Try ChatGPT')",
  "a:has-text('Try ChatGPT')",
  "button:has-text('开始使用')",
  "a:has-text('开始使用')",
  "button:has-text('注册')",
  "a:has-text('注册')",
  "button:has-text('登录')",
  "a:has-text('登录')",
];
const createPasswordUrlMarkers = ["create-account/password", "signup/password"];
const loginPasswordUrlMarkers = ["/u/login/password", "/log-in/password", "/login/password"];
const otpSelectors = [
  "input[name='code']",
  "input[name*='otp']",
  "input[name*='verification']",
  "input[autocomplete='one-time-code']",
  "input[data-index='0']",
];
const profileFirstNameSelectors = [
  "input[name='first-name']",
  "input[id*='first-name']",
  "input[autocomplete='given-name']",
];
const profileLastNameSelectors = [
  "input[name='last-name']",
  "input[id*='last-name']",
  "input[autocomplete='family-name']",
];
const profileFullNameSelectors = [
  "input[name='name']",
  "input[name='fullname']",
  "input[autocomplete='name']",
  "input[placeholder*='Full name']",
  "input[placeholder*='full name']",
  "input[placeholder*='Name']",
  "input[placeholder*='name']",
  "input[placeholder*='全名']",
  "input[placeholder*='姓名']",
  "input[aria-label*='Full name']",
  "input[aria-label*='full name']",
  "input[aria-label*='Name']",
  "input[aria-label*='name']",
  "input[aria-label*='全名']",
  "input[aria-label*='姓名']",
];
const profileAgeSelectors = [
  "input[name='age']",
  "input[name*='age']",
  "input[id*='age']",
  "input[type='number'][name*='age']",
  "input[placeholder*='Age']",
  "input[placeholder*='age']",
  "input[aria-label*='How old']",
  "input[aria-label*='how old']",
  "input[aria-label*='Age']",
  "input[aria-label*='age']",
  "input[placeholder*='年龄']",
  "input[aria-label*='年龄']",
  "input[inputmode='numeric'][placeholder*='年龄']",
  "input[inputmode='numeric'][aria-label*='年龄']",
];
const profileAgeSelectSelectors = ["select[name*='age']", "select[id*='age']"];
const profileBirthdayFieldSelectors = [
  "input[name='birthdate']",
  "input[name='birthday']",
  "input[autocomplete='bday']",
  "input[autocomplete='bday-day']",
  "input[autocomplete='bday-month']",
  "input[autocomplete='bday-year']",
  "input[name*='birth'][name*='date']",
  "input[name*='birth'][name*='day']",
  "input[name*='birth'][name*='month']",
  "input[name*='birth'][name*='year']",
  "input[id*='birth'][id*='date']",
  "input[id*='birth'][id*='day']",
  "input[id*='birth'][id*='month']",
  "input[id*='birth'][id*='year']",
  "input[placeholder*='Date of birth']",
  "input[placeholder*='date of birth']",
  "input[placeholder*='Birthday']",
  "input[placeholder*='birthday']",
  "input[placeholder*='出生']",
  "input[placeholder*='生日']",
  "input[placeholder*='YYYY']",
  "input[placeholder*='MM']",
  "input[placeholder*='DD']",
  "input[aria-label*='Date of birth']",
  "input[aria-label*='date of birth']",
  "input[aria-label*='Birthday']",
  "input[aria-label*='birthday']",
  "input[aria-label*='出生']",
  "input[aria-label*='生日']",
];
const profileBirthdaySpinbuttonSelectors = [
  "[role='spinbutton'][data-type='year']",
  "[role='spinbutton'][data-type='month']",
  "[role='spinbutton'][data-type='day']",
  "[role='spinbutton'][aria-label*='Year']",
  "[role='spinbutton'][aria-label*='Month']",
  "[role='spinbutton'][aria-label*='Day']",
  "[role='spinbutton'][aria-label*='year']",
  "[role='spinbutton'][aria-label*='month']",
  "[role='spinbutton'][aria-label*='day']",
  "[role='spinbutton'][aria-label*='年']",
  "[role='spinbutton'][aria-label*='月']",
  "[role='spinbutton'][aria-label*='日']",
];
const profileSelectors = [
  ...profileFirstNameSelectors,
  ...profileFullNameSelectors,
  ...profileAgeSelectors,
  ...profileAgeSelectSelectors,
  ...profileBirthdayFieldSelectors,
  ...profileBirthdaySpinbuttonSelectors,
];
const primaryActionSelectors = [
  "button[type='submit']",
  "button:has-text('Continue')",
  "button:has-text('Next')",
  "button:has-text('Verify')",
  "button:has-text('Agree')",
  "button:has-text('Create')",
  "button:has-text('继续')",
  "button:has-text('下一步')",
  "button:has-text('验证')",
  "button:has-text('同意')",
  "button:has-text('完成帐户创建')",
  "button:has-text('完成账户创建')",
  "button:has-text('完成账号创建')",
  "button:has-text('Complete account creation')",
  "button:has-text('Complete account setup')",
  "button:has-text('Finish account creation')",
  "[role='button']:has-text('完成帐户创建')",
  "[role='button']:has-text('完成账户创建')",
  "[role='button']:has-text('Complete account creation')",
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
const cloudflareChallengeMarkers = [
  "just a moment",
  "checking your browser",
  "checking if the site connection is secure",
  "verify you are human",
  "please wait",
  "请稍候",
  "验证您是否是真人",
  "安全检查",
  "cloudflare",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ReusableMailbox = {
  address: string;
  createdAt: string;
  taskId: string | null;
  password: string | null;
  submitted: boolean;
};

type MailboxAllocation = {
  address: string;
  source: "new" | "reused";
  password: string | null;
  submitted: boolean;
};

type RegistrationFailureMeta = {
  mailboxSubmitted: boolean;
};

type RegistrationError = Error & {
  registrationMeta?: RegistrationFailureMeta;
};

const computeBrowserLaunchTimeoutMs = (taskTimeoutMs: number) =>
  Math.min(180_000, Math.max(60_000, Math.floor(taskTimeoutMs * 0.4)));

const normalizeMailboxAddress = (value: string) => value.trim().toLowerCase();

const closeBlankPagesExcept = async (context: BrowserContext, activePage: Page) => {
  const pages = context.pages();
  for (const page of pages) {
    if (page === activePage) {
      continue;
    }

    if (page.url().trim().toLowerCase() !== "about:blank") {
      continue;
    }

    await page.close().catch(() => undefined);
  }
};

const generatePassword = (length = 16) => {
  const targetLength = Math.max(12, length);
  const bytes = randomBytes(targetLength);
  return Array.from(bytes, (value) => passwordCharacters[value % passwordCharacters.length]).join(
    "",
  );
};

const registrationFirstNames = [
  "Alex",
  "Ava",
  "Chloe",
  "Emma",
  "Ethan",
  "Lily",
  "Lucas",
  "Mason",
  "Mia",
  "Noah",
  "Nora",
  "Owen",
  "Ryan",
  "Sophie",
] as const;

const registrationLastNames = [
  "Bennett",
  "Brooks",
  "Carter",
  "Foster",
  "Hayes",
  "Morgan",
  "Parker",
  "Reed",
  "Turner",
  "Walker",
] as const;

const pickRandom = <T>(items: readonly T[]) =>
  items[Math.floor(Math.random() * items.length)] ?? items[0];

const randomAdultBirthdate = () => {
  const year = 1988 + Math.floor(Math.random() * 12);
  const month = 1 + Math.floor(Math.random() * 12);
  const day = 1 + Math.floor(Math.random() * 28);
  return `${String(year)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const makeAccountIdFromEmail = (email: string) =>
  `acc_${email
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "")}`;

const createRegistrationProfile = () => ({
  name: `${pickRandom(registrationFirstNames)} ${pickRandom(registrationLastNames)}`,
  birthdate: randomAdultBirthdate(),
});

const pageText = async (page: Page) => {
  try {
    return (await page.locator("body").innerText({ timeout: 2_000 })).toLowerCase();
  } catch {
    return "";
  }
};

const isVisible = async (page: Page, selector: string) => {
  try {
    const locator = page.locator(selector);
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      if (await locator.nth(index).isVisible()) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
};

const findFirstVisibleLocator = async (page: Page, selector: string) => {
  try {
    const locator = page.locator(selector);
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      if (await candidate.isVisible()) {
        return candidate;
      }
    }
    return null;
  } catch {
    return null;
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
      const locator = await findFirstVisibleLocator(page, selector);
      if (locator) {
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
      const locator = await findFirstVisibleLocator(page, selector);
      if (locator) {
        await locator.scrollIntoViewIfNeeded().catch(() => undefined);
        try {
          await locator.click({ delay: 80 + Math.floor(Math.random() * 80) });
        } catch {
          await locator.click({ force: true });
        }
        return true;
      }
    } catch {
      // keep trying
    }
  }

  return false;
};

const hasMeaningfulInputValue = (value: string, minDigits = 6) =>
  value.replaceAll(/\D/g, "").length >= minDigits;

const primeInputForTyping = async (page: Page, locator: Locator) => {
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  await locator.hover().catch(() => undefined);
  try {
    await locator.click({ delay: 90 + Math.floor(Math.random() * 60) });
  } catch {
    await locator.click({ force: true }).catch(() => undefined);
  }
  await page.waitForTimeout(120);
  await locator.press("ArrowRight").catch(() => undefined);
  await page.waitForTimeout(80);
};

const setHiddenBirthdayValue = async (page: Page, birthdate: string) => {
  try {
    return await page.evaluate((value) => {
      const doc = (globalThis as { document?: { querySelector(selector: string): unknown } }).document;
      const target = doc?.querySelector("input[name='birthday'], input[name='birthdate']") as
        | {
            value?: string;
            dispatchEvent?: (event: { type?: string }) => boolean;
            blur?: () => void;
          }
        | undefined;
      if (!target || typeof target !== "object") {
        return false;
      }

      const prototype = Object.getPrototypeOf(target) as {
        value?: { set?: (this: { value?: string }, v: string) => void };
      };
      prototype.value?.set?.call(target, value);
      target.dispatchEvent?.(new Event("input", { bubbles: true }));
      target.dispatchEvent?.(new Event("change", { bubbles: true }));
      target.blur?.();
      return true;
    }, birthdate);
  } catch {
    return false;
  }
};

const tryFillInputWithCandidates = async (
  page: Page,
  selectors: string[],
  candidates: string[],
  options?: {
    minDigits?: number;
  },
) => {
  const minDigits = Math.max(1, options?.minDigits ?? 6);
  for (const selector of selectors) {
    try {
      const locator = await findFirstVisibleLocator(page, selector);
      if (!locator) {
        continue;
      }

      await primeInputForTyping(page, locator).catch(() => undefined);
      for (const candidate of candidates) {
        const next = candidate.trim();
        if (!next) {
          continue;
        }

        await primeInputForTyping(page, locator).catch(() => undefined);
        await locator.fill("").catch(() => undefined);
        await locator.fill(next).catch(() => undefined);
        await locator.press("Tab").catch(() => undefined);
        await page.waitForTimeout(60);
        const filledByFill = await locator.inputValue().catch(() => "");
        if (hasMeaningfulInputValue(filledByFill, minDigits)) {
          return true;
        }

        await typeIntoLocator(locator, next).catch(() => undefined);
        await locator.press("Tab").catch(() => undefined);
        await page.waitForTimeout(60);
        const filledByType = await locator.inputValue().catch(() => "");
        if (hasMeaningfulInputValue(filledByType, minDigits)) {
          return true;
        }

        await locator
          .evaluate((node, value) => {
            const element = node as {
              value?: string;
              dispatchEvent?: (event: { type?: string }) => boolean;
              blur?: () => void;
            };
            const prototype = Object.getPrototypeOf(element) as {
              value?: { set?: (this: { value?: string }, v: string) => void };
            };
            prototype.value?.set?.call(element, value);
            element.dispatchEvent?.(new Event("input", { bubbles: true }));
            element.dispatchEvent?.(new Event("change", { bubbles: true }));
            element.blur?.();
          }, next)
          .catch(() => undefined);
        await page.waitForTimeout(60);
        const filledByEvaluate = await locator.inputValue().catch(() => "");
        if (hasMeaningfulInputValue(filledByEvaluate, minDigits)) {
          return true;
        }
      }
    } catch {
      // keep trying
    }
  }

  return false;
};

const tryFillBirthdayByRawTyping = async (page: Page, selectors: string[], birthdate: string) => {
  const [year, month, day] = birthdate.split("-");
  const mmddyyyy = `${month}${day}${year}`;
  const ddmmyyyy = `${day}${month}${year}`;

  for (const selector of selectors) {
    try {
      const locator = await findFirstVisibleLocator(page, selector);
      if (!locator) {
        continue;
      }

      const placeholder =
        (
          (await locator.getAttribute("placeholder").catch(() => null)) ??
          (await locator.getAttribute("aria-label").catch(() => null)) ??
          ""
        ).toUpperCase();
      const raw = placeholder.includes("DD") &&
        placeholder.includes("MM") &&
        placeholder.indexOf("DD") < placeholder.indexOf("MM")
        ? ddmmyyyy
        : mmddyyyy;

      await primeInputForTyping(page, locator).catch(() => undefined);
      await locator.fill("").catch(() => undefined);
      await page.keyboard.type(raw, { delay: 35 });
      await locator.press("Tab").catch(() => undefined);
      await page.waitForTimeout(90);

      const typedValue = await locator.inputValue().catch(() => "");
      if (hasMeaningfulInputValue(typedValue, 6)) {
        return true;
      }
    } catch {
      // keep trying
    }
  }

  return false;
};

const activateAboutYouInputs = async (page: Page) => {
  try {
    const currentUrl = page.url().toLowerCase();
    if (!currentUrl.includes("auth.openai.com/about-you")) {
      return;
    }

    for (const selector of profileBirthdayFieldSelectors) {
      const locator = await findFirstVisibleLocator(page, selector);
      if (!locator) {
        continue;
      }
      await primeInputForTyping(page, locator).catch(() => undefined);
      await page.waitForTimeout(80);
      break;
    }
  } catch {
    // no-op
  }
};

const selectOptionFirstVisible = async (
  page: Page,
  selectors: string[],
  values: string[],
) => {
  for (const selector of selectors) {
    try {
      const locator = await findFirstVisibleLocator(page, selector);
      if (!locator) {
        continue;
      }

      for (const value of values) {
        const normalized = value.trim();
        if (!normalized) {
          continue;
        }
        if (await locator.selectOption({ label: normalized }).then(() => true).catch(() => false)) {
          return true;
        }
        if (await locator.selectOption(normalized).then(() => true).catch(() => false)) {
          return true;
        }
      }
    } catch {
      // keep trying
    }
  }

  return false;
};

const clickHomepageEntryByHeuristics = async (
  page: Page,
  mode: "signup" | "login",
) => {
  try {
    return await page.evaluate((targetMode) => {
      const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLowerCase();
      const runtime = globalThis as unknown as {
        document?: { querySelectorAll?: (selector: string) => ArrayLike<unknown> };
        getComputedStyle?: (element: object) => {
          display?: string;
          visibility?: string;
          opacity?: string;
        };
      };
      const isVisibleElement = (element: unknown) => {
        const node = element as {
          getBoundingClientRect?: () => { width?: number; height?: number };
        };
        const style = runtime.getComputedStyle?.(node as object);
        if (!style) {
          return false;
        }
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
          return false;
        }
        const rect = node.getBoundingClientRect?.();
        return (rect?.width ?? 0) > 0 && (rect?.height ?? 0) > 0;
      };
      const includesAny = (value: string, keywords: string[]) =>
        keywords.some((keyword) => value.includes(keyword));

      const signupKeywords = [
        "signup",
        "sign up",
        "register",
        "create account",
        "免费注册",
        "注册",
      ];
      const loginKeywords = [
        "login",
        "log in",
        "signin",
        "sign in",
        "登录",
        "开始使用",
        "get started",
        "try chatgpt",
      ];
      const expectedKeywords = targetMode === "signup" ? signupKeywords : loginKeywords;
      const selectorNodes = runtime.document?.querySelectorAll?.(
        "button, a, [role='button'], div[role='button']",
      );
      if (!selectorNodes) {
        return false;
      }
      const nodes = Array.from(selectorNodes);
      let bestCandidate: { click?: () => void } | null = null;
      let bestScore = Number.NEGATIVE_INFINITY;

      for (const node of nodes) {
        if (!isVisibleElement(node)) {
          continue;
        }

        const element = node as {
          getAttribute?: (name: string) => string | null;
          innerText?: string;
          textContent?: string;
          click?: () => void;
        };
        const href = normalize(element.getAttribute?.("href") ?? "");
        const text = normalize(element.innerText || element.textContent || "");
        const testId = normalize(element.getAttribute?.("data-testid") ?? "");
        const aria = normalize(element.getAttribute?.("aria-label") ?? "");
        const combined = `${text} ${href} ${testId} ${aria}`;
        if (!combined) {
          continue;
        }

        let score = 0;
        if (targetMode === "signup") {
          if (testId.includes("signup")) {
            score += 10;
          }
        } else if (testId.includes("login")) {
          score += 10;
        }
        if (includesAny(combined, expectedKeywords)) {
          score += 6;
        }
        if (href.includes("/auth/") || href.includes("/login")) {
          score += 3;
        }
        if (text.length > 0 && text.length <= 18) {
          score += 1;
        }

        if (score > bestScore) {
          bestScore = score;
          bestCandidate = element;
        }
      }

      if (!bestCandidate || bestScore < 6 || typeof bestCandidate.click !== "function") {
        return false;
      }

      bestCandidate.click();
      return true;
    }, mode);
  } catch {
    return false;
  }
};

const isRegistrationSurfaceVisible = async (page: Page) => {
  if (await isAnyVisible(page, emailSelectors)) {
    return true;
  }

  if (await isCreatePasswordPage(page)) {
    return true;
  }

  if (await isLoginPasswordPage(page)) {
    return true;
  }

  if (await isAnyVisible(page, otpSelectors)) {
    return true;
  }

  if (await isAnyVisible(page, profileSelectors)) {
    return true;
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

const isCloudflareChallengePage = async (page: Page) => {
  const url = page.url().toLowerCase();
  if (
    url.includes("/cdn-cgi/challenge") ||
    url.includes("challenge-platform") ||
    url.includes("cf_chl")
  ) {
    return true;
  }

  const title = (await page.title().catch(() => "")).toLowerCase();
  const text = await pageText(page);
  return cloudflareChallengeMarkers.some(
    (marker) => title.includes(marker) || text.includes(marker),
  );
};

const dismissPassiveOverlays = async (page: Page, onProgress: (message: string) => void) => {
  if (await clickFirstVisible(page, passiveOverlaySelectors)) {
    onProgress("检测到首页/欢迎弹窗，正在按页面提示继续...");
    await page.waitForTimeout(1_200);
    return true;
  }

  return false;
};

const clickThroughInterstitials = async (
  page: Page,
  onProgress: (message: string) => void,
) => {
  if (await isRegistrationSurfaceVisible(page)) {
    return false;
  }

  if (await clickFirstVisible(page, interstitialSelectors)) {
    onProgress("检测到欢迎页或教程引导，正在逐步点击继续...");
    await page.waitForTimeout(1_200);
    return true;
  }

  return false;
};

const trySwitchToEmailAuth = async (page: Page, onProgress: (message: string) => void) => {
  if (!(await clickFirstVisible(page, continueWithEmailSelectors))) {
    return false;
  }

  onProgress("检测到手机号登录入口，正在切换到邮箱登录/注册...");
  await page.waitForTimeout(1_200);
  return true;
};

const openRegistrationFromHomepage = async (
  page: Page,
  onProgress: (message: string) => void,
) => {
  const entryPoints = [
    {
      url: chatgptHomeUrl,
      progress: "正在打开 ChatGPT 注册入口...",
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
      onProgress(`注册页已导航到 ${page.url() || entry.url}`);
      await page.waitForTimeout(1_500);
      navigated = true;
      break;
    } catch (error) {
      lastNavigationError = error;
    }
  }

  if (!navigated) {
    throw new Error(
      `无法打开 ChatGPT 注册入口：${
        lastNavigationError instanceof Error
          ? lastNavigationError.message
          : "未知导航错误"
      }`,
    );
  }

  onProgress("正在等待首页的登录/注册入口加载...");
  await page.waitForTimeout(1_000);

  const deadline = Date.now() + 120_000;
  let challengeTipAt = 0;
  while (Date.now() < deadline) {
    if (page.url().toLowerCase() === "about:blank") {
      onProgress("浏览器停留在空白页，正在重试跳转注册入口...");
      await page.goto(chatgptHomeUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      onProgress(`已重新跳转到 ${page.url() || chatgptHomeUrl}`);
      await page.waitForTimeout(1_200);
    }

    if (await trySwitchToEmailAuth(page, onProgress)) {
      continue;
    }

    if (await isPhoneBlocked(page)) {
      if ((await isAnyVisible(page, phoneEntrySelectors)) && (await trySwitchToEmailAuth(page, onProgress))) {
        continue;
      }
      throw new Error(phoneFailureMessage);
    }

    if (await isCloudflareChallengePage(page)) {
      const now = Date.now();
      if (now - challengeTipAt >= 8_000) {
        onProgress("检测到 Cloudflare 校验页，正在等待校验通过...");
        challengeTipAt = now;
      }
      await page.waitForTimeout(2_000);
      continue;
    }

    if (await isRegistrationSurfaceVisible(page)) {
      return;
    }

    if (await dismissPassiveOverlays(page, onProgress)) {
      continue;
    }

    if (await clickFirstVisible(page, signupEntrySelectors)) {
      onProgress("正在通过首页的免费注册入口进入注册流程...");
      await page.waitForTimeout(2_000);
      if ((await isRegistrationSurfaceVisible(page)) || hasAuthLikeUrl(page)) {
        return;
      }
      continue;
    }

    if (await clickHomepageEntryByHeuristics(page, "signup")) {
      onProgress("首页按钮文案发生变化，已通过智能匹配点击注册入口...");
      await page.waitForTimeout(2_000);
      if ((await isRegistrationSurfaceVisible(page)) || hasAuthLikeUrl(page)) {
        return;
      }
      continue;
    }

    if (
      (await clickFirstVisible(page, homepageFallbackEntrySelectors)) ||
      (await clickHomepageEntryByHeuristics(page, "login"))
    ) {
      onProgress("首页未直接显示免费注册，正在先进入登录入口再切换注册...");
      await page.waitForTimeout(1_500);
      if (
        (await clickFirstVisible(page, signupEntrySelectors)) ||
        (await clickHomepageEntryByHeuristics(page, "signup"))
      ) {
        onProgress("已切换到注册入口，正在进入邮箱注册流程...");
        await page.waitForTimeout(1_500);
      }
      if ((await isRegistrationSurfaceVisible(page)) || hasAuthLikeUrl(page)) {
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

  throw new Error("首页注册入口等待超时，请检查网络/Cloudflare 校验或页面结构是否变化。");
};

const isCreatePasswordPage = async (page: Page) => {
  const url = page.url().toLowerCase();
  if (createPasswordUrlMarkers.some((marker) => url.includes(marker))) {
    return true;
  }

  if (
    await isVisible(
      page,
      "input[type='password']:not([name='current-password']), input[name='password']",
    )
  ) {
    return true;
  }

  const text = await pageText(page);
  return text.includes("create password") || text.includes("创建密码");
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
  return text.includes("enter your password") || text.includes("输入密码");
};

const fillOtpCode = async (page: Page, code: string) => {
  if (await isVisible(page, "input[data-index='0']")) {
    for (let index = 0; index < code.length; index += 1) {
      const selector = `input[data-index='${index}']`;
      if (await isVisible(page, selector)) {
        const locator = await findFirstVisibleLocator(page, selector);
        if (locator) {
          await typeIntoLocator(locator, code[index] ?? "");
        }
      }
    }
    return true;
  }

  return fillFirstVisible(page, otpSelectors, code);
};

const fillReactAriaBirthday = async (page: Page, birthdate: string) => {
  const [year, month, day] = birthdate.split("-");
  const segments = [
    {
      selector:
        '[role="spinbutton"][data-type="year"], [data-type="year"], [role="spinbutton"][aria-label*="Year"], [role="spinbutton"][aria-label*="year"], [role="spinbutton"][aria-label*="年"]',
      value: year,
    },
    {
      selector:
        '[role="spinbutton"][data-type="month"], [data-type="month"], [role="spinbutton"][aria-label*="Month"], [role="spinbutton"][aria-label*="month"], [role="spinbutton"][aria-label*="月"]',
      value: String(Number(month)),
    },
    {
      selector:
        '[role="spinbutton"][data-type="day"], [data-type="day"], [role="spinbutton"][aria-label*="Day"], [role="spinbutton"][aria-label*="day"], [role="spinbutton"][aria-label*="日"]',
      value: String(Number(day)),
    },
  ];

  let filled = false;
  for (const segment of segments) {
    const locator = await findFirstVisibleLocator(page, segment.selector);
    if (!locator) {
      return filled;
    }
    await locator.click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A").catch(
      () => undefined,
    );
    await page.keyboard.type(segment.value, { delay: 25 });
    filled = true;
  }

  if (filled) {
    await page.evaluate((value) => {
      const doc = (globalThis as { document?: { querySelector(selector: string): unknown } }).document;
      const hidden = doc?.querySelector("input[name='birthday'], input[name='birthdate']") as
        | { value?: string }
        | undefined;
      if (hidden && typeof hidden === "object") {
        hidden.value = value;
      }
    }, birthdate);
  }

  return filled;
};

const fillBirthdayFields = async (page: Page, birthdate: string) => {
  const [year, month, day] = birthdate.split("-");
  const selects = page.locator("select");
  const selectCount = await selects.count();
  if (selectCount >= 3) {
    for (let index = 0; index < selectCount; index += 1) {
      const locator = selects.nth(index);
      const options = await locator.locator("option").allInnerTexts().catch(() => []);
      const optionText = options.join(" ").toLowerCase();
      if (optionText.includes(year)) {
        await locator.selectOption({ label: year }).catch(() => locator.selectOption(year));
        continue;
      }
      if (
        options.length >= 12 &&
        options.length <= 13 &&
        (optionText.includes("jan") || optionText.includes("月"))
      ) {
        await locator.selectOption(month).catch(() =>
          locator.selectOption(String(Number(month)).padStart(2, "0")),
        );
        continue;
      }
      if (options.length >= 31 && options.length <= 32) {
        await locator.selectOption(day).catch(() =>
          locator.selectOption(String(Number(day)).padStart(2, "0")),
        );
      }
    }
    return true;
  }

  if (await fillReactAriaBirthday(page, birthdate)) {
    return true;
  }

  const segmentedBirthday = [
    {
      selectors: [
        "input[autocomplete='bday-year']",
        "input[name*='birth'][name*='year']",
        "input[id*='birth'][id*='year']",
        "input[placeholder*='YYYY']",
        "input[aria-label*='Year']",
        "input[aria-label*='year']",
        "input[aria-label*='年']",
      ],
      value: year,
    },
    {
      selectors: [
        "input[autocomplete='bday-month']",
        "input[name*='birth'][name*='month']",
        "input[id*='birth'][id*='month']",
        "input[placeholder*='MM']",
        "input[aria-label*='Month']",
        "input[aria-label*='month']",
        "input[aria-label*='月']",
      ],
      value: String(Number(month)),
    },
    {
      selectors: [
        "input[autocomplete='bday-day']",
        "input[name*='birth'][name*='day']",
        "input[id*='birth'][id*='day']",
        "input[placeholder*='DD']",
        "input[aria-label*='Day']",
        "input[aria-label*='day']",
        "input[aria-label*='日']",
      ],
      value: String(Number(day)),
    },
  ];
  let segmentedFilled = 0;
  for (const segment of segmentedBirthday) {
    if (await fillFirstVisible(page, segment.selectors, segment.value)) {
      segmentedFilled += 1;
    }
  }
  if (segmentedFilled >= 2) {
    return true;
  }

  const birthdayInputSelectors = profileBirthdayFieldSelectors;
  if (await tryFillBirthdayByRawTyping(page, birthdayInputSelectors, birthdate)) {
    await setHiddenBirthdayValue(page, birthdate).catch(() => undefined);
    return true;
  }

  const normalizedMonth = String(Number(month));
  const normalizedDay = String(Number(day));
  const birthdayCandidates = [
    `${month}${day}${year}`,
    `${day}${month}${year}`,
    `${year}-${month}-${day}`,
    `${year}/${month}/${day}`,
    `${year}/${normalizedMonth}/${normalizedDay}`,
    `${month}/${day}/${year}`,
    `${normalizedMonth}/${normalizedDay}/${year}`,
    `${year}.${month}.${day}`,
    `${year}年${normalizedMonth}月${normalizedDay}日`,
  ];
  if (
    await tryFillInputWithCandidates(page, birthdayInputSelectors, birthdayCandidates, {
      minDigits: 6,
    })
  ) {
    await setHiddenBirthdayValue(page, birthdate).catch(() => undefined);
    return true;
  }

  return setHiddenBirthdayValue(page, birthdate);
};

const fillProfile = async (page: Page, profile: { name: string; birthdate: string }) => {
  await activateAboutYouInputs(page);

  if (await isAnyVisible(page, profileFirstNameSelectors)) {
    const [firstName = "Alex", lastName = "Bennett"] = profile.name.split(/\s+/, 2);
    await fillFirstVisible(page, profileFirstNameSelectors, firstName);
    await fillFirstVisible(page, profileLastNameSelectors, lastName);
  } else {
    await fillFirstVisible(page, profileFullNameSelectors, profile.name);
  }

  const parsedBirthYear = Number(profile.birthdate.split("-")[0]);
  const computedAge =
    Number.isFinite(parsedBirthYear) && parsedBirthYear > 1900
      ? Math.min(80, Math.max(18, new Date().getFullYear() - parsedBirthYear))
      : 31;

  if (await isAnyVisible(page, profileAgeSelectors)) {
    const ageCandidates = [
      String(computedAge),
      `${computedAge} `,
      `${computedAge}岁`,
      `${computedAge} years`,
    ];
    const filledAge = await tryFillInputWithCandidates(page, profileAgeSelectors, ageCandidates, {
      minDigits: 2,
    });
    if (!filledAge) {
      await fillFirstVisible(page, profileAgeSelectors, String(computedAge));
    }
  } else if (await isAnyVisible(page, profileAgeSelectSelectors)) {
    await selectOptionFirstVisible(page, profileAgeSelectSelectors, [
      String(computedAge),
      `${computedAge}`,
      `${computedAge} years`,
      `${computedAge}岁`,
    ]);
  } else {
    await fillBirthdayFields(page, profile.birthdate);
  }
  await setHiddenBirthdayValue(page, profile.birthdate).catch(() => undefined);

  await page.waitForTimeout(250);
  await clickFirstVisible(page, primaryActionSelectors);
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

type ChatgptRegistrationTaskState = "running" | "completed" | "failed";

type ChatgptRegistrationResult = {
  email: string;
  accountId: string;
  workspace: WorkspaceContext;
  capturedAt: string;
};

type ChatgptRegistrationProgressEntry = {
  message: string;
  at: string;
};

type ChatgptRegistrationTask = {
  id: string;
  trigger: "manual" | "threshold";
  state: ChatgptRegistrationTaskState;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  progressMessage: string;
  progressHistory: ChatgptRegistrationProgressEntry[];
  errorMessage: string | null;
  result: ChatgptRegistrationResult | null;
};

export type ChatgptRegistrationPublicTask = ChatgptRegistrationTask;

type StartRegistrationOptions = {
  trigger: "manual" | "threshold";
  timeoutMs: number;
  headless: boolean;
  browserExecutablePath?: string;
};

const toPublicTask = (task: ChatgptRegistrationTask): ChatgptRegistrationPublicTask => ({
  ...task,
  progressHistory: task.progressHistory.map((entry) => ({ ...entry })),
});

const attachRegistrationFailureMeta = (error: unknown, meta: RegistrationFailureMeta) => {
  if (error instanceof Error) {
    (error as RegistrationError).registrationMeta = meta;
    return error as RegistrationError;
  }

  const wrapped = new Error(
    typeof error === "string" && error.trim().length > 0 ? error : "自动注册失败。",
  ) as RegistrationError;
  wrapped.registrationMeta = meta;
  return wrapped;
};

const didSubmitMailboxBeforeFailure = (error: unknown) =>
  error instanceof Error &&
  (error as RegistrationError).registrationMeta?.mailboxSubmitted === true;

const manualCancelMessage = "用户已手动终止自动注册任务。";
const browserClosedMessage = "检测到浏览器已关闭，自动注册任务已终止，请重试。";
const isOtpWaitTimeoutError = (error: unknown) =>
  error instanceof Error &&
  (error.message.includes("验证码超时") || error.message.includes("verification code"));
const isBrowserSessionClosedError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("target page, context or browser has been closed") ||
    message.includes("browser has been closed") ||
    message.includes("context closed") ||
    message.includes("page closed")
  );
};
const computeNoProgressTimeoutMs = (taskTimeoutMs: number) =>
  Math.min(240_000, Math.max(90_000, Math.floor(taskTimeoutMs * 0.4)));

export class ChatgptRegistrationManager {
  private readonly tasks = new Map<string, ChatgptRegistrationTask>();
  private readonly executions = new Map<string, Promise<void>>();
  private readonly cancellationRequests = new Map<string, string>();
  private readonly activeSessionClosers = new Map<string, () => Promise<void>>();

  constructor(
    private readonly profileRootDir: string,
    private readonly db: GatewayDatabase,
    private readonly accountManager: AccountManager,
    private readonly provider: GenericHttpProvider,
  ) {
    mkdirSync(this.profileRootDir, { recursive: true });
  }

  private listReusableMailboxes() {
    const raw = this.db.getRuntimeSetting(reusableMailboxPoolSettingKey);
    if (!raw) {
      return [] as ReusableMailbox[];
    }

    const now = Date.now();
    const validAfter = now - reusableMailboxRetentionMs;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [] as ReusableMailbox[];
      }

      const dedupe = new Set<string>();
      const mailboxes: ReusableMailbox[] = [];
      for (const item of parsed) {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          continue;
        }

        const record = item as {
          address?: unknown;
          createdAt?: unknown;
          taskId?: unknown;
          password?: unknown;
          submitted?: unknown;
        };
        const address = normalizeMailboxAddress(typeof record.address === "string" ? record.address : "");
        if (!address || dedupe.has(address)) {
          continue;
        }

        const parsedCreatedAt =
          typeof record.createdAt === "string" && !Number.isNaN(Date.parse(record.createdAt))
            ? record.createdAt
            : nowIso();
        if (Date.parse(parsedCreatedAt) < validAfter) {
          continue;
        }
        const password =
          typeof record.password === "string" && record.password.trim().length > 0
            ? record.password
            : null;
        const submitted = Boolean(record.submitted);
        if (submitted && !password) {
          continue;
        }

        dedupe.add(address);
        mailboxes.push({
          address,
          createdAt: parsedCreatedAt,
          taskId: typeof record.taskId === "string" && record.taskId.trim().length > 0 ? record.taskId : null,
          password,
          submitted,
        });
        if (mailboxes.length >= reusableMailboxPoolMaxSize) {
          break;
        }
      }
      return mailboxes;
    } catch {
      return [] as ReusableMailbox[];
    }
  }

  private saveReusableMailboxes(mailboxes: ReusableMailbox[]) {
    const normalized = mailboxes.slice(0, reusableMailboxPoolMaxSize);
    this.db.setRuntimeSetting(reusableMailboxPoolSettingKey, JSON.stringify(normalized));
  }

  private takeReusableMailbox() {
    const pool = this.listReusableMailboxes();
    const mailbox = pool.shift() ?? null;
    this.saveReusableMailboxes(pool);
    return mailbox;
  }

  private rememberReusableMailbox(options: {
    address: string;
    taskId: string | null;
    password: string | null;
    submitted: boolean;
  }) {
    const normalizedAddress = normalizeMailboxAddress(options.address);
    if (!normalizedAddress) {
      return;
    }

    const pool = this.listReusableMailboxes().filter((item) => item.address !== normalizedAddress);
    pool.unshift({
      address: normalizedAddress,
      createdAt: nowIso(),
      taskId: options.taskId,
      password: options.password?.trim() ? options.password : null,
      submitted: options.submitted,
    });
    this.saveReusableMailboxes(pool);
  }

  private async allocateMailbox(
    tempMail: TempMailClient,
    updateProgress: (message: string) => void,
  ): Promise<MailboxAllocation> {
    updateProgress("正在尝试复用未注册邮箱...");
    const reusable = this.takeReusableMailbox();
    if (reusable) {
      updateProgress(
        reusable.submitted
          ? `已复用未完成注册账号：${reusable.address}`
          : `已复用未注册邮箱：${reusable.address}`,
      );
      return {
        address: reusable.address,
        source: "reused",
        password: reusable.password,
        submitted: reusable.submitted,
      };
    }

    updateProgress("正在创建临时邮箱...");
    const mailbox = await tempMail.createAddress();
    updateProgress(`临时邮箱已创建：${mailbox.address}`);
    return {
      address: mailbox.address,
      source: "new",
      password: null,
      submitted: false,
    };
  }

  hasRunningTask() {
    for (const task of this.tasks.values()) {
      if (task.state === "running") {
        return true;
      }
    }

    return false;
  }

  startRegistration(options: StartRegistrationOptions) {
    if (this.hasRunningTask()) {
      throw new Error("已有自动注册任务在运行，请稍后重试。");
    }

    const taskId = `register_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const timestamp = nowIso();
    const task: ChatgptRegistrationTask = {
      id: taskId,
      trigger: options.trigger,
      state: "running",
      startedAt: timestamp,
      updatedAt: timestamp,
      finishedAt: null,
      progressMessage: "正在初始化自动注册任务...",
      progressHistory: [
        {
          message: "正在初始化自动注册任务...",
          at: timestamp,
        },
      ],
      errorMessage: null,
      result: null,
    };
    this.tasks.set(taskId, task);

    const execution = this.runTask(taskId, options).finally(() => {
      this.executions.delete(taskId);
      this.cancellationRequests.delete(taskId);
      this.activeSessionClosers.delete(taskId);
    });
    this.executions.set(taskId, execution);
    return toPublicTask(task);
  }

  async runRegistration(options: StartRegistrationOptions) {
    const task = this.startRegistration(options);
    await this.executions.get(task.id);
    const completed = this.getTask(task.id);
    if (!completed) {
      throw new Error(`自动注册任务 ${task.id} 已丢失。`);
    }
    return completed;
  }

  getTask(taskId: string) {
    const task = this.tasks.get(taskId);
    return task ? toPublicTask(task) : null;
  }

  async cancelTask(taskId: string, reason = manualCancelMessage) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    if (task.state !== "running") {
      return toPublicTask(task);
    }

    const normalizedReason = reason.trim() || manualCancelMessage;
    this.cancellationRequests.set(taskId, normalizedReason);

    const timestamp = nowIso();
    task.progressMessage = "正在终止自动注册任务...";
    task.updatedAt = timestamp;
    const latest = task.progressHistory[task.progressHistory.length - 1];
    if (!latest || latest.message !== "正在终止自动注册任务...") {
      task.progressHistory.push({
        message: "正在终止自动注册任务...",
        at: timestamp,
      });
    } else {
      latest.at = timestamp;
    }

    this.db.logRuntime({
      level: "info",
      scope: "auto-register",
      event: "register.cancel_requested",
      message: normalizedReason,
      detailsJson: JSON.stringify({
        taskId,
      }),
      createdAt: timestamp,
    });

    const closeSession = this.activeSessionClosers.get(taskId);
    if (closeSession) {
      await closeSession().catch(() => undefined);
    }

    return toPublicTask(task);
  }

  private getCancellationReason(taskId: string) {
    return this.cancellationRequests.get(taskId) ?? null;
  }

  private throwIfCancellationRequested(taskId: string) {
    const reason = this.getCancellationReason(taskId);
    if (reason) {
      throw new Error(reason);
    }
  }

  private async runTask(taskId: string, options: StartRegistrationOptions) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    const updateProgress = (message: string) => {
      const current = this.tasks.get(taskId);
      if (!current) {
        return;
      }
      const timestamp = nowIso();
      current.progressMessage = message;
      current.updatedAt = timestamp;
      const latest = current.progressHistory[current.progressHistory.length - 1];
      if (!latest || latest.message !== message) {
        current.progressHistory.push({
          message,
          at: timestamp,
        });
      } else {
        latest.at = timestamp;
      }
    };

    const updateFailure = (message: string, cancelled = false) => {
      const current = this.tasks.get(taskId);
      if (!current) {
        return;
      }
      current.state = "failed";
      current.errorMessage = message;
      current.finishedAt = nowIso();
      current.updatedAt = current.finishedAt;
      current.progressMessage = cancelled ? "自动注册已终止。" : "自动注册失败。";
      current.progressHistory.push({
        message: `${cancelled ? "自动注册已终止" : "自动注册失败"}：${message}`,
        at: current.finishedAt,
      });
    };

    let allocatedMailbox: MailboxAllocation | null = null;
    let registrationPassword = "";
    let registrationCaptured = false;

    try {
      this.throwIfCancellationRequested(taskId);
      updateProgress("正在读取自动化配置...");
      const settings = getAccountAutomationSettings(this.db);

      const tempMail = new TempMailClient({
        baseUrl: settings.tempMailBaseUrl,
        adminPassword: settings.tempMailAdminPassword,
        sitePassword: settings.tempMailSitePassword,
        defaultDomain: settings.tempMailDefaultDomain,
      });
      tempMail.assertConfigured();

      this.throwIfCancellationRequested(taskId);
      allocatedMailbox = await this.allocateMailbox(tempMail, updateProgress);
      registrationPassword = allocatedMailbox.password?.trim() || generatePassword();
      const profile = createRegistrationProfile();
      this.throwIfCancellationRequested(taskId);
      const capture = await this.registerWithBrowser(
        {
          taskId,
          mailboxAddress: allocatedMailbox.address,
          password: registrationPassword,
          profile,
          timeoutMs: options.timeoutMs,
          headless: options.headless,
          reuseSubmittedAccount: allocatedMailbox.submitted,
        },
        tempMail,
        updateProgress,
      );
      registrationCaptured = true;
      this.throwIfCancellationRequested(taskId);

      const accountId = makeAccountIdFromEmail(capture.parsed.email);
      const existing = this.accountManager.getAccount(accountId);
      const timestamp = capture.capturedAt;
      this.accountManager.upsertAccount({
        id: accountId,
        name: capture.parsed.email,
        provider: config.defaultAccountProvider,
        upstreamBaseUrl: config.defaultUpstreamBaseUrl,
        quotaPath: config.defaultQuotaPath,
        proxyPathPrefix: config.defaultProxyPathPrefix,
        loginEmail: capture.parsed.email,
        loginPassword: registrationPassword,
        managedByGateway: true,
        provisionSource: "auto-register",
        provisionState: "ready",
        lastProvisionAttemptAt: timestamp,
        lastProvisionedAt: timestamp,
        lastProvisionError: null,
        auth: {
          mode: "bearer",
          token: capture.parsed.accessToken,
        },
        workspace: capture.parsed.workspace,
        subscription:
          existing?.subscription ?? {
            planType: null,
            status: "unknown",
          },
        status: "healthy",
        successCount: existing?.successCount ?? 0,
        failureCount: existing?.failureCount ?? 0,
        consecutiveFailures: 0,
        consecutive429: 0,
        cooldownUntil: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      });

      this.db.setRuntimeSetting(sessionInfoSettingKey(accountId), JSON.stringify(capture.sessionPayload));

      try {
        const account = this.accountManager.getAccount(accountId);
        if (account) {
          const snapshot = await this.provider.fetchQuota(account);
          this.accountManager.mergeWorkspaceHint(accountId, snapshot.workspaceHint);
          this.accountManager.mergeSubscriptionHint(accountId, snapshot.subscriptionHint);
          this.accountManager.applyQuotaSnapshot({
            ...snapshot,
            source: "manual",
          });
        }
      } catch (error) {
        this.db.logRuntime({
          level: "warn",
          scope: "auto-register",
          event: "register.quota_refresh_failed",
          message:
            error instanceof Error
              ? error.message
              : "自动注册完成后刷新额度失败。",
          accountId,
          createdAt: nowIso(),
        });
      }

      this.db.logRuntime({
        level: "info",
        scope: "auto-register",
        event: "register.completed",
        message: "自动注册完成并已写入账号池",
        accountId,
        detailsJson: JSON.stringify({
          trigger: options.trigger,
          email: capture.parsed.email,
        }),
        createdAt: nowIso(),
      });

      const current = this.tasks.get(taskId);
      if (!current) {
        return;
      }
      current.state = "completed";
      current.result = {
        email: capture.parsed.email,
        accountId,
        workspace: capture.parsed.workspace,
        capturedAt: capture.capturedAt,
      };
      current.finishedAt = nowIso();
      current.updatedAt = current.finishedAt;
      current.progressMessage = "自动注册完成，账号已写入账号池。";
      current.progressHistory.push({
        message: "自动注册完成，账号已写入账号池。",
        at: current.finishedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "自动注册失败。";
      const cancelled = this.getCancellationReason(taskId) === message;
      this.db.logRuntime({
        level: cancelled ? "info" : "warn",
        scope: "auto-register",
        event: cancelled ? "register.cancelled" : "register.failed",
        message,
        detailsJson: JSON.stringify({
          trigger: options.trigger,
        }),
        createdAt: nowIso(),
      });

      if (allocatedMailbox && !registrationCaptured) {
        const submittedBeforeFailure = didSubmitMailboxBeforeFailure(error);
        const cacheAsSubmitted = submittedBeforeFailure || allocatedMailbox.submitted;
        this.rememberReusableMailbox({
          address: allocatedMailbox.address,
          taskId,
          password: registrationPassword,
          submitted: cacheAsSubmitted,
        });
        this.db.logRuntime({
          level: "info",
          scope: "auto-register",
          event: "register.mailbox_cached",
          message: cacheAsSubmitted
            ? "自动注册失败后已缓存未完成账号，下次会尝试继续注册流程"
            : "自动注册失败前未提交邮箱，已缓存临时邮箱供下次复用",
          detailsJson: JSON.stringify({
            trigger: options.trigger,
            mailbox: allocatedMailbox.address,
            source: allocatedMailbox.source,
            submitted: cacheAsSubmitted,
          }),
          createdAt: nowIso(),
        });
      }
      updateFailure(message, cancelled);
    }
  }

  private async registerWithBrowser(
    options: {
      taskId: string;
      mailboxAddress: string;
      password: string;
      profile: { name: string; birthdate: string };
      timeoutMs: number;
      headless: boolean;
      reuseSubmittedAccount: boolean;
    },
    tempMail: TempMailClient,
    onProgress: (message: string) => void,
  ) {
    let lastProgressAt = Date.now();
    const noProgressTimeoutMs = computeNoProgressTimeoutMs(options.timeoutMs);
    const reportProgress = (message: string) => {
      lastProgressAt = Date.now();
      onProgress(message);
    };
    const assertNotCancelled = () => {
      this.throwIfCancellationRequested(options.taskId);
    };

    reportProgress("正在以新方式启动自动化浏览器...");
    const launchTimeoutMs = computeBrowserLaunchTimeoutMs(options.timeoutMs);
    const session = await launchManagedBrowserSession({
      headless: options.headless,
      startupUrl: chatgptHomeUrl,
      timeoutMs: launchTimeoutMs,
    });
    const { context, page } = session;
    let mailboxSubmitted = options.reuseSubmittedAccount;
    const deadline = Date.now() + options.timeoutMs;
    let lastOtpCode: string | null = null;
    const assertSessionAlive = () => {
      if (page.isClosed() || !session.browser.isConnected()) {
        throw new Error(browserClosedMessage);
      }
    };
    const assertNotStalled = () => {
      const stalledMs = Date.now() - lastProgressAt;
      if (stalledMs >= noProgressTimeoutMs) {
        throw new Error(
          `自动注册在 ${Math.floor(stalledMs / 1000)} 秒内没有新的进度，已自动终止，请重试。`,
        );
      }
    };
    const waitForOtpCodeWithChecks = async () => {
      const otpDeadline = Date.now() + Math.min(120_000, Math.max(20_000, deadline - Date.now()));
      while (Date.now() < otpDeadline) {
        assertNotCancelled();
        assertSessionAlive();
        assertNotStalled();
        const sliceTimeoutMs = Math.min(15_000, Math.max(1_000, otpDeadline - Date.now()));

        try {
          return await tempMail.waitForVerificationCode(options.mailboxAddress, {
            timeoutMs: sliceTimeoutMs,
            excludeCodes: lastOtpCode ? [lastOtpCode] : [],
          });
        } catch (error) {
          if (isOtpWaitTimeoutError(error)) {
            continue;
          }
          throw error;
        }
      }

      throw new Error(`等待 ${options.mailboxAddress} 的验证码超时。`);
    };

    try {
      this.activeSessionClosers.set(options.taskId, async () => {
        await closeManagedBrowserSession(session);
      });
      assertNotCancelled();
      reportProgress(`已创建邮箱 ${options.mailboxAddress}，正在使用全新浏览器会话进入注册流程...`);
      await openRegistrationFromHomepage(page, reportProgress);
      await page.bringToFront().catch(() => undefined);
      await closeBlankPagesExcept(context, page);

      while (Date.now() < deadline) {
        assertNotCancelled();
        assertSessionAlive();
        assertNotStalled();

        if (await trySwitchToEmailAuth(page, reportProgress)) {
          continue;
        }

        if (await isPhoneBlocked(page)) {
          if (
            (await isAnyVisible(page, phoneEntrySelectors)) &&
            (await trySwitchToEmailAuth(page, reportProgress))
          ) {
            continue;
          }
          throw new Error(phoneFailureMessage);
        }

        const captured = await tryCaptureSessionPayload(page);
        if (captured) {
          if (await clickThroughInterstitials(page, reportProgress)) {
            continue;
          }
          return {
            parsed: captured.parsed,
            sessionPayload: captured.sessionPayload,
            capturedAt: nowIso(),
          };
        }

        if (await dismissPassiveOverlays(page, reportProgress)) {
          continue;
        }

        if (await isAnyVisible(page, emailSelectors)) {
          reportProgress("正在提交注册邮箱...");
          mailboxSubmitted = true;
          await fillFirstVisible(page, emailSelectors, options.mailboxAddress);
          await clickFirstVisible(page, primaryActionSelectors);
          await page.waitForTimeout(1_500);
          continue;
        }

        if (await isLoginPasswordPage(page)) {
          if (!options.reuseSubmittedAccount) {
            throw new Error("注册邮箱意外进入密码登录页，疑似邮箱重复，请重试。");
          }

          reportProgress("检测到未完成账号登录页，正在输入已保存密码继续流程...");
          const filled = await fillFirstVisible(
            page,
            ["input[type='password']", "input[name='password']", "input[name='current-password']"],
            options.password,
          );
          if (!filled) {
            throw new Error("检测到密码登录页但未找到可填写的密码输入框，请重试。");
          }
          await clickFirstVisible(page, primaryActionSelectors);
          await page.waitForTimeout(1_500);
          continue;
        }

        if (await isCreatePasswordPage(page)) {
          reportProgress("正在设置注册密码...");
          await fillFirstVisible(
            page,
            [
              "input[type='password']:not([name='current-password'])",
              "input[name='password']",
            ],
            options.password,
          );
          await clickFirstVisible(page, primaryActionSelectors);
          await page.waitForTimeout(1_500);
          continue;
        }

        if (await isAnyVisible(page, profileSelectors)) {
          reportProgress("正在填写个人资料...");
          await fillProfile(page, options.profile);
          await page.waitForTimeout(1_500);
          continue;
        }

        if (await isAnyVisible(page, otpSelectors)) {
          reportProgress("正在等待邮箱验证码...");
          const code = await waitForOtpCodeWithChecks();
          lastOtpCode = code;
          reportProgress("已收到验证码，正在自动填写...");
          await fillOtpCode(page, code);
          await clickFirstVisible(page, primaryActionSelectors);
          await page.waitForTimeout(1_500);
          continue;
        }

        if (await clickThroughInterstitials(page, reportProgress)) {
          continue;
        }

        await page.waitForLoadState("domcontentloaded").catch(() => undefined);
        await sleep(1_500);
      }

      throw new Error("自动注册超时，未能在限定时间内完成会话采集。");
    } catch (error) {
      let normalizedError = error;
      if (this.getCancellationReason(options.taskId)) {
        normalizedError = new Error(this.getCancellationReason(options.taskId) ?? manualCancelMessage);
      } else if (page.isClosed() || !session.browser.isConnected() || isBrowserSessionClosedError(error)) {
        normalizedError = new Error(browserClosedMessage);
      }

      throw attachRegistrationFailureMeta(normalizedError, {
        mailboxSubmitted,
      });
    } finally {
      this.activeSessionClosers.delete(options.taskId);
      await closeManagedBrowserSession(session);
    }
  }
}

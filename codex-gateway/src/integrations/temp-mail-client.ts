type TempMailCreateAddressResult = {
  address: string;
  jwt: string;
};

type TempMailMailRecord = {
  id?: string;
  address?: string;
  source?: string;
  from?: string;
  sender?: string;
  to?: string | string[];
  recipient?: string | string[];
  subject?: string;
  title?: string;
  text?: string;
  body?: string;
  content?: string;
  html?: string;
  raw?: string;
  createdAt?: string | number;
  created_at?: string | number;
};

type TempMailListResponse = {
  results?: TempMailMailRecord[];
  total?: number;
};

type TempMailClientOptions = {
  baseUrl: string;
  adminPassword: string;
  sitePassword?: string;
  defaultDomain?: string;
  requestTimeoutMs?: number;
};

const otpPattern = /\b(\d{6})\b/;
const openaiMailMarkers = [
  "openai",
  "chatgpt",
  "verification code",
  "verify your email",
  "验证码",
  "chatgpt code",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/u, "");

const normalizeAddress = (value: string) => value.trim().toLowerCase();

const randomLocalPart = () => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const pick = (source: string, count: number) =>
    Array.from({ length: count }, () => source[Math.floor(Math.random() * source.length)]).join("");

  return `${pick(alphabet, 5)}${pick(digits, 2)}${pick(alphabet, 2)}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonResponse = async (response: Response) => {
  const rawText = await response.text();
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return rawText;
  }
};

const buildMailSearchText = (mail: TempMailMailRecord) => {
  const parts = [
    mail.source,
    mail.from,
    mail.sender,
    Array.isArray(mail.to) ? mail.to.join(" ") : mail.to,
    Array.isArray(mail.recipient) ? mail.recipient.join(" ") : mail.recipient,
    mail.subject,
    mail.title,
    mail.text,
    mail.body,
    mail.content,
    mail.html,
    mail.raw,
  ];
  return parts.filter((item) => typeof item === "string" && item.trim().length > 0).join("\n");
};

const extractVerificationCode = (mail: TempMailMailRecord) => {
  const searchText = buildMailSearchText(mail);
  const normalized = searchText.toLowerCase();
  if (!openaiMailMarkers.some((marker) => normalized.includes(marker))) {
    return null;
  }

  const match = searchText.match(otpPattern);
  return match?.[1] ?? null;
};

export class TempMailClient {
  private readonly baseUrl: string;

  constructor(private readonly options: TempMailClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.options.adminPassword.trim() && this.options.defaultDomain?.trim());
  }

  assertConfigured() {
    if (!this.baseUrl) {
      throw new Error("未配置 Temp Mail 地址。");
    }
    if (!this.options.adminPassword.trim()) {
      throw new Error("未配置 Temp Mail 管理密码。");
    }
    if (!this.options.defaultDomain?.trim()) {
      throw new Error("未配置 Temp Mail 默认域名。");
    }
  }

  async createAddress(localPart?: string): Promise<TempMailCreateAddressResult> {
    this.assertConfigured();
    const payload = await this.request("POST", "/admin/new_address", {
      json: {
        enablePrefix: true,
        name: (localPart?.trim().toLowerCase() || randomLocalPart()).replace(/[^a-z0-9_-]/gu, ""),
        domain: this.options.defaultDomain?.trim().toLowerCase(),
      },
    });

    if (!isRecord(payload)) {
      throw new Error("Temp Mail 创建地址返回格式无效。");
    }

    const address =
      typeof payload.address === "string" && payload.address.trim().length > 0
        ? normalizeAddress(payload.address)
        : "";
    const jwt =
      typeof payload.jwt === "string" && payload.jwt.trim().length > 0 ? payload.jwt.trim() : "";
    if (!address || !jwt) {
      throw new Error("Temp Mail 创建地址返回缺少 address/jwt。");
    }

    return {
      address,
      jwt,
    };
  }

  async listAdminMails(address: string, limit = 20): Promise<TempMailMailRecord[]> {
    const payload = await this.request("GET", "/admin/mails", {
      searchParams: {
        address: normalizeAddress(address),
        limit: String(limit),
        offset: "0",
      },
    });

    if (!isRecord(payload)) {
      return [];
    }

    const results = (payload as TempMailListResponse).results;
    return Array.isArray(results) ? results : [];
  }

  async waitForVerificationCode(
    address: string,
    options?: {
      timeoutMs?: number;
      pollIntervalMs?: number;
      excludeCodes?: string[];
    },
  ) {
    const deadline = Date.now() + Math.max(1_000, options?.timeoutMs ?? 120_000);
    const pollIntervalMs = Math.max(1_000, options?.pollIntervalMs ?? 3_000);
    const excludedCodes = new Set(
      (options?.excludeCodes ?? []).map((item) => item.trim()).filter((item) => item.length > 0),
    );

    while (Date.now() < deadline) {
      const mails = await this.listAdminMails(address, 20);
      for (const mail of mails) {
        const code = extractVerificationCode(mail);
        if (code && !excludedCodes.has(code)) {
          return code;
        }
      }

      await sleep(pollIntervalMs);
    }

    throw new Error(`等待 ${address} 的验证码超时。`);
  }

  private async request(
    method: "GET" | "POST",
    pathname: string,
    options?: {
      json?: unknown;
      searchParams?: Record<string, string>;
    },
  ) {
    const url = new URL(pathname, `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(options?.searchParams ?? {})) {
      url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.requestTimeoutMs ?? 20_000);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-admin-auth": this.options.adminPassword.trim(),
          ...(this.options.sitePassword?.trim()
            ? { "x-custom-auth": this.options.sitePassword.trim() }
            : {}),
        },
        body: options?.json ? JSON.stringify(options.json) : undefined,
        signal: controller.signal,
      });

      const payload = await parseJsonResponse(response);
      if (!response.ok) {
        const message =
          typeof payload === "string"
            ? payload
            : isRecord(payload) && typeof payload.error === "string"
              ? payload.error
              : `HTTP ${response.status}`;
        throw new Error(`Temp Mail 请求失败：${message}`);
      }

      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }
}

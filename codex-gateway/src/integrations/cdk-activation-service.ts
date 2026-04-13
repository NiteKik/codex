import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Account } from "../types.js";

export const defaultCdkProductType = "chatgpt_plus_1m";

type CdkActivationApiResponse = {
  success?: boolean;
  flag?: boolean;
  msg?: unknown;
  data?: unknown;
};

type CdkPoolEntry = {
  productType: string;
  cdkey: string;
  lineIndex: number;
};

type ParsedPool = {
  lines: string[];
  entries: CdkPoolEntry[];
};

export type CdkActivationResult = {
  productType: string;
  cdkeyPreview: string;
  checkMessage: string;
  message: string;
  checkData: unknown;
  activateData: unknown;
};

export type CdkProductInventory = {
  productType: string;
  count: number;
};

export type CdkSelectableItem = {
  productType: string;
  cdkey: string;
  cdkeyPreview: string;
};

type CdkActivationServiceOptions = {
  cdkFilePath: string;
  activationBaseUrl: string;
  requestTimeoutMs: number;
  defaultProductType?: string;
};

const isLikelyCdkey = (value: string) => /^[A-Za-z0-9][A-Za-z0-9-]{5,}$/.test(value.trim());

const normalizeProductType = (value: string, fallback: string) => {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : fallback;
};

const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");

const normalizeBoolean = (value: unknown, fallback = false) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
      return true;
    }
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
      return false;
    }
  }

  return fallback;
};

const compactMessage = (value: string) => value.replaceAll(/\s+/g, "");

const maskCdkey = (cdkey: string) => {
  if (cdkey.length <= 8) {
    return "***";
  }

  return `${cdkey.slice(0, 4)}****${cdkey.slice(-4)}`;
};

export class CdkActivationService {
  private queue: Promise<void> = Promise.resolve();
  private readonly defaultProductType: string;
  private readonly baseUrl: string;

  constructor(private readonly options: CdkActivationServiceOptions) {
    this.defaultProductType = normalizeProductType(
      options.defaultProductType ?? defaultCdkProductType,
      defaultCdkProductType,
    );
    this.baseUrl = normalizeBaseUrl(options.activationBaseUrl);
  }

  async countAvailableCdks(productType?: string) {
    const normalizedProductType = normalizeProductType(
      productType ?? this.defaultProductType,
      this.defaultProductType,
    );

    return this.withLock(async () => {
      const pool = await this.readPool();
      return pool.entries.filter((entry) => entry.productType === normalizedProductType).length;
    });
  }

  async listAvailableProductInventories(): Promise<CdkProductInventory[]> {
    return this.withLock(async () => {
      const pool = await this.readPool();
      const byProductType = new Map<string, number>();

      for (const entry of pool.entries) {
        const current = byProductType.get(entry.productType) ?? 0;
        byProductType.set(entry.productType, current + 1);
      }

      return [...byProductType.entries()]
        .map(([productType, count]) => ({
          productType,
          count,
        }))
        .sort((left, right) => left.productType.localeCompare(right.productType));
    });
  }

  async listAvailableCdks(productType?: string): Promise<CdkSelectableItem[]> {
    const normalizedProductType = productType
      ? normalizeProductType(productType, this.defaultProductType)
      : null;

    return this.withLock(async () => {
      const pool = await this.readPool();
      return pool.entries
        .filter((entry) =>
          normalizedProductType ? entry.productType === normalizedProductType : true,
        )
        .map((entry) => ({
          productType: entry.productType,
          cdkey: entry.cdkey,
          cdkeyPreview: maskCdkey(entry.cdkey),
        }))
        .sort((left, right) => {
          const byProductType = left.productType.localeCompare(right.productType);
          if (byProductType !== 0) {
            return byProductType;
          }
          return left.cdkey.localeCompare(right.cdkey);
        });
    });
  }

  async activateWithAvailableCdk(params: {
    account: Account;
    productType?: string;
    sessionInfo?: string | null;
    force?: boolean;
  }): Promise<CdkActivationResult> {
    const normalizedProductType = normalizeProductType(
      params.productType ?? this.defaultProductType,
      this.defaultProductType,
    );
    const sessionInfoPayload = this.resolveSessionInfoPayload(
      params.account,
      params.sessionInfo ?? null,
    );
    const force = normalizeBoolean(params.force, false);

    return this.withLock(async () => {
      let attempts = 0;

      while (attempts < 200) {
        attempts += 1;

        const pool = await this.readPool();
        const candidate = pool.entries.find(
          (entry) => entry.productType === normalizedProductType,
        );

        if (!candidate) {
          throw new Error(`当前暂无可用 ${normalizedProductType} CDK。`);
        }

        const checkPayload = await this.postJson("/check", {
          cdkey: candidate.cdkey,
        });
        const checkMessage = this.extractMessage(checkPayload);
        const checkSuccess = this.isSuccess(checkPayload);

        if (!checkSuccess) {
          if (this.shouldDiscardCdkey(checkMessage)) {
            await this.removeLineAt(pool.lines, candidate.lineIndex);
            continue;
          }

          throw new Error(checkMessage || "CDK 校验失败。");
        }

        const activatePayload = await this.postJson("/activate", {
          cdkey: candidate.cdkey,
          session_info: sessionInfoPayload,
          ...(force ? { force: 1 } : {}),
        });
        const activateMessage = this.extractMessage(activatePayload);
        const activateSuccess = this.isSuccess(activatePayload);

        if (activateSuccess) {
          await this.removeLineAt(pool.lines, candidate.lineIndex);
          return {
            productType: normalizedProductType,
            cdkeyPreview: maskCdkey(candidate.cdkey),
            checkMessage,
            message: activateMessage || "充值成功",
            checkData: checkPayload.data ?? null,
            activateData: activatePayload.data ?? null,
          };
        }

        if (this.isSessionError(activateMessage)) {
          throw new Error(activateMessage || "Session 信息无效，请重新抓取后再试。");
        }

        if (this.isStockError(activateMessage)) {
          throw new Error(activateMessage || "当前库存不足，请稍后重试。");
        }

        if (this.shouldDiscardCdkey(activateMessage)) {
          await this.removeLineAt(pool.lines, candidate.lineIndex);
          continue;
        }

        throw new Error(activateMessage || "CDK 激活失败。");
      }

      throw new Error("CDK 处理次数超过上限，请检查 CDK 文件内容。");
    });
  }

  async activateWithSpecifiedCdk(params: {
    account: Account;
    cdkey: string;
    productType?: string;
    sessionInfo?: string | null;
    force?: boolean;
  }): Promise<CdkActivationResult> {
    const specifiedCdkey = params.cdkey.trim();
    if (!isLikelyCdkey(specifiedCdkey)) {
      throw new Error("请选择有效的 CDK。");
    }

    const normalizedProductType = params.productType
      ? normalizeProductType(params.productType, this.defaultProductType)
      : null;
    const sessionInfoPayload = this.resolveSessionInfoPayload(
      params.account,
      params.sessionInfo ?? null,
    );
    const force = normalizeBoolean(params.force, false);

    return this.withLock(async () => {
      const pool = await this.readPool();
      const candidate = pool.entries.find(
        (entry) =>
          entry.cdkey === specifiedCdkey &&
          (normalizedProductType ? entry.productType === normalizedProductType : true),
      );

      if (!candidate) {
        throw new Error("选定的 CDK 不存在或已被使用。");
      }

      const checkPayload = await this.postJson("/check", {
        cdkey: candidate.cdkey,
      });
      const checkMessage = this.extractMessage(checkPayload);
      const checkSuccess = this.isSuccess(checkPayload);

      if (!checkSuccess) {
        if (this.shouldDiscardCdkey(checkMessage)) {
          await this.removeLineAt(pool.lines, candidate.lineIndex);
        }
        throw new Error(checkMessage || "选定 CDK 校验失败。");
      }

      const activatePayload = await this.postJson("/activate", {
        cdkey: candidate.cdkey,
        session_info: sessionInfoPayload,
        ...(force ? { force: 1 } : {}),
      });
      const activateMessage = this.extractMessage(activatePayload);
      const activateSuccess = this.isSuccess(activatePayload);

      if (activateSuccess) {
        await this.removeLineAt(pool.lines, candidate.lineIndex);
        return {
          productType: candidate.productType,
          cdkeyPreview: maskCdkey(candidate.cdkey),
          checkMessage,
          message: activateMessage || "充值成功",
          checkData: checkPayload.data ?? null,
          activateData: activatePayload.data ?? null,
        };
      }

      if (this.isSessionError(activateMessage)) {
        throw new Error(activateMessage || "Session 信息无效，请重新抓取后再试。");
      }

      if (this.isStockError(activateMessage)) {
        throw new Error(activateMessage || "当前库存不足，请稍后重试。");
      }

      if (this.shouldDiscardCdkey(activateMessage)) {
        await this.removeLineAt(pool.lines, candidate.lineIndex);
      }

      throw new Error(activateMessage || "选定 CDK 激活失败。");
    });
  }

  private resolveSessionInfoPayload(account: Account, sessionInfo: string | null) {
    const trimmedSessionInfo = sessionInfo?.trim() ?? "";
    if (trimmedSessionInfo.length > 0) {
      return trimmedSessionInfo;
    }

    if (account.auth.mode !== "bearer") {
      throw new Error("账号缺少可用 Session 信息，请先重新抓取登录会话。");
    }

    const token = account.auth.token?.trim();
    if (!token) {
      throw new Error("账号缺少可用 accessToken，请先重新抓取登录会话。");
    }

    const payload: Record<string, unknown> = {
      accessToken: token,
      plan_type: account.subscription.planType ?? "free",
    };

    const email = account.name.includes("@") ? account.name.trim() : "";
    if (email) {
      payload.user = {
        email,
      };
    }

    if (account.workspace.kind !== "unknown" || account.workspace.id || account.workspace.name) {
      payload.workspace = {
        kind: account.workspace.kind,
        id: account.workspace.id,
        name: account.workspace.name,
      };
    }

    return JSON.stringify(payload);
  }

  private async readPool(): Promise<ParsedPool> {
    await mkdir(dirname(this.options.cdkFilePath), { recursive: true });

    let raw = "";
    try {
      raw = await readFile(this.options.cdkFilePath, "utf8");
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") {
        throw error;
      }
      await writeFile(this.options.cdkFilePath, "", { encoding: "utf8" });
      raw = "";
    }

    const lines = raw.split(/\r?\n/);
    const entries: CdkPoolEntry[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const parsed = this.parseLine(lines[index]);
      if (!parsed) {
        continue;
      }

      entries.push({
        productType: parsed.productType,
        cdkey: parsed.cdkey,
        lineIndex: index,
      });
    }

    return {
      lines,
      entries,
    };
  }

  private parseLine(line: string): { productType: string; cdkey: string } | null {
    const withoutInlineComments = this.stripInlineComments(line).trim();
    if (withoutInlineComments.length === 0) {
      return null;
    }

    const typedMatch = withoutInlineComments.match(/^([a-z0-9._-]+)\s*[|,]\s*([A-Za-z0-9-]+)$/i);
    if (typedMatch) {
      const productType = normalizeProductType(typedMatch[1], this.defaultProductType);
      const cdkey = typedMatch[2].trim();
      if (!isLikelyCdkey(cdkey)) {
        return null;
      }

      return {
        productType,
        cdkey,
      };
    }

    if (!isLikelyCdkey(withoutInlineComments)) {
      return null;
    }

    return {
      productType: this.defaultProductType,
      cdkey: withoutInlineComments,
    };
  }

  private stripInlineComments(line: string) {
    const hashIndex = line.indexOf("#");
    const slashIndex = line.indexOf("//");

    let cutIndex = line.length;
    if (hashIndex >= 0) {
      cutIndex = Math.min(cutIndex, hashIndex);
    }
    if (slashIndex >= 0) {
      cutIndex = Math.min(cutIndex, slashIndex);
    }

    return line.slice(0, cutIndex);
  }

  private async removeLineAt(lines: string[], lineIndex: number) {
    if (lineIndex < 0 || lineIndex >= lines.length) {
      return;
    }

    const nextLines = lines.filter((_, index) => index !== lineIndex);
    await writeFile(this.options.cdkFilePath, nextLines.join("\n"), { encoding: "utf8" });
  }

  private async postJson(path: string, payload: Record<string, unknown>) {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, Math.max(1000, this.options.requestTimeoutMs));

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const raw = await response.text();

      let parsed: unknown = null;
      if (raw.trim().length > 0) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = {
            success: false,
            msg: raw,
            data: null,
          };
        }
      }

      if (!response.ok) {
        const fallbackMessage = `激活服务请求失败（HTTP ${response.status}）`;
        const message = this.extractMessage(parsed) || fallbackMessage;
        throw new Error(message);
      }

      if (!parsed || typeof parsed !== "object") {
        return {
          success: false,
          msg: "激活服务返回了无效响应。",
          data: null,
        } satisfies CdkActivationApiResponse;
      }

      return parsed as CdkActivationApiResponse;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("激活请求超时，请稍后重试。");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private isSuccess(payload: CdkActivationApiResponse) {
    return normalizeBoolean(payload.success, false) || normalizeBoolean(payload.flag, false);
  }

  private extractMessage(payload: unknown) {
    if (!payload || typeof payload !== "object") {
      return "";
    }

    if (!("msg" in payload)) {
      return "";
    }

    const rawMessage = (payload as { msg: unknown }).msg;
    return typeof rawMessage === "string" ? rawMessage.trim() : "";
  }

  private shouldDiscardCdkey(message: string) {
    const compact = compactMessage(message).toLowerCase();
    if (!compact) {
      return false;
    }

    return [
      "cdkey不存在",
      "cdkey已作废",
      "cdkey状态异常",
      "未知cdk状态",
      "cdk已作废",
      "cdk异常",
      "未找到对应cdk",
      "cdkey已充值成功",
      "cdkey正在充值中",
      "alreadyrecharged",
      "isvoid",
    ].some((pattern) => compact.includes(pattern));
  }

  private isSessionError(message: string) {
    const compact = compactMessage(message).toLowerCase();
    if (!compact) {
      return false;
    }

    return [
      "session信息或账号异常",
      "session过期失效",
      "session",
      "该账号当前状态为工作空间workspace",
      "账号可能停用",
      "账号异常",
    ].some((pattern) => compact.includes(pattern));
  }

  private isStockError(message: string) {
    const compact = compactMessage(message).toLowerCase();
    if (!compact) {
      return false;
    }

    return [
      "库存不足",
      "礼物库存不足",
      "该卡密暂时无法提交",
      "请稍后再试",
      "正在领取中",
      "outofstock",
    ].some((pattern) => compact.includes(pattern));
  }

  private withLock<T>(task: () => Promise<T>) {
    const running = this.queue.then(task, task);
    this.queue = running.then(
      () => undefined,
      () => undefined,
    );
    return running;
  }
}

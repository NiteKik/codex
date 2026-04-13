import type { Account, ProxyExecutionResult, QuotaSnapshot } from "../types.js";

export class ProviderHttpError extends Error {
  constructor(
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

export interface ForwardRequest {
  method: string;
  path: string;
  queryString: string;
  headers: Record<string, unknown>;
  body?: Buffer;
}

export interface ProviderClient {
  fetchQuota(account: Account): Promise<QuotaSnapshot>;
  forward(account: Account, request: ForwardRequest): Promise<ProxyExecutionResult>;
}

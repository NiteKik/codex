import type { Account } from "../types.js";

export const isAvailablePoolAccount = (account: Account) => account.status !== "invalid";

export const countAvailablePoolAccounts = (accounts: Account[]) =>
  accounts.filter(isAvailablePoolAccount).length;

export const getMissingPoolAccountCount = (accounts: Account[], threshold: number) =>
  Math.max(0, threshold - countAvailablePoolAccounts(accounts));

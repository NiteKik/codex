import type { AccountRow, WorkspaceKind } from "../../services/gateway-api.ts";

export type DashboardAccountIdentity = {
  name: string;
  id: string;
  workspaceKindLabel: string;
  workspaceName: string | null;
};

const workspaceKindLabelMap: Record<WorkspaceKind, string> = {
  personal: "个人",
  team: "团队",
  unknown: "未识别",
};

export const buildDashboardAccountsById = (accounts: AccountRow[]) => {
  const map = new Map<string, AccountRow>();
  for (const account of accounts) {
    map.set(account.id, account);
  }

  return map;
};

export const resolveDashboardAccountIdentity = (
  accountsById: Map<string, AccountRow>,
  accountId: string,
): DashboardAccountIdentity => {
  const account = accountsById.get(accountId);
  if (!account) {
    return {
      name: accountId,
      id: accountId,
      workspaceKindLabel: "未知空间",
      workspaceName: null,
    };
  }

  return {
    name: account.name || account.id,
    id: account.id,
    workspaceKindLabel: workspaceKindLabelMap[account.workspace.kind] ?? "未识别",
    workspaceName: account.workspace.name,
  };
};

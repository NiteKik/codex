export type DashboardStatusTone = "healthy" | "warning" | "critical" | "idle";

export interface DashboardHealth {
  ok: boolean;
  service?: string;
  pollIntervalMs?: number;
}

export interface DashboardVirtualQuotaPool {
  accountCount: number;
  weeklyTotal: number;
  weeklyUsed: number;
  weeklyRemaining: number;
  window5hTotal: number;
  window5hUsed: number;
  window5hRemaining: number;
}

export interface DashboardRequestLog {
  request_id: string;
  session_id: string;
  account_id: string;
  path: string;
  method: string;
  attempt: number;
  estimated_units: number;
  upstream_status: number | null;
  error_code: string | null;
  error_message: string | null;
  duration_ms: number | null;
  started_at: string;
  finished_at: string | null;
}

export interface DashboardDecisionLog {
  id: number;
  request_id: string;
  session_id: string;
  selected_account_id: string;
  reason: string;
  score_json: string;
  created_at: string;
}

export interface DashboardLogsPayload {
  requests: DashboardRequestLog[];
  decisions: DashboardDecisionLog[];
}

export interface DashboardMetricCard {
  label: string;
  value: string;
  meta: string;
  accent?: boolean;
}

export interface ScoreBreakdown {
  accountId: string;
  total: number;
  weeklyRemainingRatio: number;
  windowRemainingRatio: number;
  healthScore: number;
  recentErrorPenalty: number;
  switchingCost: number;
  stickyBonus: number;
  preemptiveEligible?: boolean;
  weeklyReserveUnits?: number;
  windowReserveUnits?: number;
  weeklyRemainingAfterRequest?: number;
  windowRemainingAfterRequest?: number;
  weeklyResetInMs?: number | null;
  windowResetInMs?: number | null;
}

export const dashboardRefreshIntervalMs = 30_000;
export const defaultCollectIntervalMs = 30_000;

const reasonLabelMap: Record<string, string> = {
  "sticky-session": "会话粘滞",
  "best-score": "最高得分",
  "best-score-preemptive": "最高得分（保留提前量）",
  "best-score-reserve-relaxed": "最高得分（提前量放宽）",
  "reset-priority-preemptive": "重置优先（周→5小时，保留提前量）",
  "reset-priority-reserve-relaxed": "重置优先（周→5小时，提前量放宽）",
};

const toComparableResetMs = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : Number.POSITIVE_INFINITY;

export const formatDashboardNumber = (value: number) =>
  new Intl.NumberFormat("zh-CN").format(value);

export const formatDashboardPercent = (value: number) =>
  `${Math.round(Math.max(0, value) * 100)}%`;

export const formatDashboardDateTime = (value: string | null) => {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

export const formatDashboardInterval = (value: number) => {
  if (value % (60 * 60_000) === 0) {
    return `${value / (60 * 60_000)} 小时`;
  }

  if (value % 60_000 === 0) {
    return `${value / 60_000} 分钟`;
  }

  return `${Math.round(value / 1000)} 秒`;
};

export const formatDashboardCountdown = (value: number) => {
  const totalSeconds = Math.max(0, Math.ceil(value / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export const getDashboardReasonLabel = (reason: string) =>
  reasonLabelMap[reason] ?? reason;

export const parseDashboardScoreBreakdown = (raw: string): ScoreBreakdown[] => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((item): item is ScoreBreakdown => {
        if (!item || typeof item !== "object") {
          return false;
        }

        const candidate = item as Record<string, unknown>;
        return (
          typeof candidate.accountId === "string" &&
          typeof candidate.total === "number" &&
          typeof candidate.weeklyRemainingRatio === "number" &&
          typeof candidate.windowRemainingRatio === "number" &&
          typeof candidate.healthScore === "number" &&
          typeof candidate.recentErrorPenalty === "number" &&
          typeof candidate.switchingCost === "number" &&
          typeof candidate.stickyBonus === "number"
        );
      })
      .sort((left, right) => {
        const weeklyDiff =
          toComparableResetMs(left.weeklyResetInMs) - toComparableResetMs(right.weeklyResetInMs);
        if (weeklyDiff !== 0) {
          return weeklyDiff;
        }

        const windowDiff =
          toComparableResetMs(left.windowResetInMs) - toComparableResetMs(right.windowResetInMs);
        if (windowDiff !== 0) {
          return windowDiff;
        }

        return right.total - left.total;
      });
  } catch {
    return [];
  }
};

export const getLatestDashboardSampleTime = (
  accounts: Array<{ quota?: { sampleTime?: string | null } }>,
) => {
  const latestTimestamp = accounts.reduce<number | null>((latest, account) => {
    const sampleTime = account.quota?.sampleTime;
    if (!sampleTime) {
      return latest;
    }

    const parsed = new Date(sampleTime).getTime();
    if (!Number.isFinite(parsed)) {
      return latest;
    }

    return latest === null || parsed > latest ? parsed : latest;
  }, null);

  return latestTimestamp === null ? null : new Date(latestTimestamp).toISOString();
};

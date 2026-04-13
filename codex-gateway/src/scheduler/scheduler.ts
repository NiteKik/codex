import { AccountManager } from "../accounts/account-manager.js";
import { schedulerWeights } from "../config.js";
import { GatewayDatabase } from "../db/database.js";
import { QuotaVirtualizer } from "../quota/quota-virtualizer.js";
import { SessionManager } from "../session/session-manager.js";
import type {
  QuotaState,
  ScheduleDecision,
  ScheduleInput,
  SchedulePreview,
  ScoreBreakdown,
  SessionBinding,
} from "../types.js";
import { nowIso } from "../utils/time.js";

type CandidateState = {
  account: ReturnType<AccountManager["listAccounts"]>[number];
  quotaState: QuotaState;
};

type SelectionResult = {
  selected: CandidateState;
  scores: ScoreBreakdown[];
  reason: string;
  stickyBinding: SessionBinding | null;
  candidateCount: number;
};

export class Scheduler {
  constructor(
    private readonly db: GatewayDatabase,
    private readonly accountManager: AccountManager,
    private readonly sessionManager: SessionManager,
    private readonly quotaVirtualizer: QuotaVirtualizer,
    private readonly maxConcurrentPerAccount: number,
    private readonly stickyMinWindowRatio: number,
    private readonly stickyMinWeeklyRatio: number,
    private readonly preemptiveWeeklyReserveRatio: number,
    private readonly preemptiveWindowReserveRatio: number,
    private readonly preemptiveWeeklyReserveUnits: number,
    private readonly preemptiveWindowReserveUnits: number,
  ) {}

  schedule(input: ScheduleInput): ScheduleDecision {
    const selection = this.selectCandidate(input);
    const reservation = this.quotaVirtualizer.reserve(
      selection.selected.account.id,
      input.sessionId,
      input.requestId,
      input.estimatedUnits,
    );
    const nextBinding = this.sessionManager.bind(
      input.sessionId,
      selection.selected.account.id,
      Boolean(
        selection.stickyBinding &&
          selection.stickyBinding.accountId !== selection.selected.account.id,
      ),
    );

    this.db.logDecision({
      requestId: input.requestId,
      sessionId: input.sessionId,
      selectedAccountId: selection.selected.account.id,
      reason: selection.reason,
      scoreJson: JSON.stringify(selection.scores),
      createdAt: nowIso(),
    });

    return {
      account: selection.selected.account,
      quotaState: selection.selected.quotaState,
      reservation,
      binding: nextBinding,
      reason: selection.reason,
      scores: selection.scores,
    };
  }

  preview(
    input: Omit<ScheduleInput, "requestId"> & {
      requestId?: string;
    },
  ): SchedulePreview {
    const requestId = input.requestId ?? `preview-${Date.now()}`;
    const selection = this.selectCandidate({
      ...input,
      requestId,
    });

    return {
      requestId,
      sessionId: input.sessionId,
      path: input.path,
      method: input.method,
      estimatedUnits: input.estimatedUnits,
      selectedAccountId: selection.selected.account.id,
      selectedStatus: selection.selected.account.status,
      reason: selection.reason,
      stickyAccountId: selection.stickyBinding?.accountId ?? null,
      candidateCount: selection.candidateCount,
      scores: selection.scores,
    };
  }

  private selectCandidate(input: ScheduleInput): SelectionResult {
    const excluded = new Set(input.excludedAccountIds ?? []);
    const binding = this.sessionManager.getBinding(input.sessionId);
    const stickyBinding =
      binding && new Date(binding.stickyUntil).getTime() > Date.now() ? binding : null;
    const availableAccounts = this.accountManager
      .listAccounts()
      .filter((account) => !excluded.has(account.id));
    const statusEligibleAccounts = availableAccounts.filter(
      (account) => account.status !== "invalid" && account.status !== "cooling",
    );
    const candidateStates = statusEligibleAccounts
      .map((account) => ({
        account,
        quotaState: this.quotaVirtualizer.getAccountQuotaState(account.id),
      }))
      .filter(({ account, quotaState }) =>
        this.isViable(account.status, quotaState, input.estimatedUnits),
      );

    if (candidateStates.length === 0) {
      if (availableAccounts.length === 0) {
        throw new Error(
          "No schedulable account is available. Account pool is empty; add accounts via /admin/chatgpt-capture/start.",
        );
      }

      const missingSnapshotCount = statusEligibleAccounts.filter(
        (account) => this.quotaVirtualizer.getAccountQuotaState(account.id).sampleTime === null,
      ).length;

      throw new Error(
        `No schedulable account is available. eligible=${statusEligibleAccounts.length}, missing_snapshot=${missingSnapshotCount}, estimated_units=${input.estimatedUnits}.`,
      );
    }

    const scores = candidateStates.map(({ account, quotaState }) =>
      this.scoreAccount(
        account.id,
        quotaState,
        stickyBinding?.accountId ?? null,
        input.estimatedUnits,
      ),
    );
    const scoreByAccountId = new Map(scores.map((score) => [score.accountId, score]));
    const preferredCandidates = candidateStates.filter(({ quotaState }) =>
      this.hasPreemptiveHeadroom(quotaState, input.estimatedUnits),
    );
    const rankingCandidates = preferredCandidates.length > 0 ? preferredCandidates : candidateStates;

    const stickyCandidate = stickyBinding
      ? rankingCandidates.find(({ account, quotaState }) => {
          return (
            account.id === stickyBinding.accountId &&
            quotaState.window5hRemainingRatio >= this.stickyMinWindowRatio &&
            quotaState.weeklyRemainingRatio >= this.stickyMinWeeklyRatio
          );
        })
      : undefined;

    const selected =
      stickyCandidate ??
      [...rankingCandidates].sort((left, right) =>
        this.compareByResetPriority(left, right, scoreByAccountId),
      )[0];

    const reason =
      stickyCandidate && stickyBinding?.accountId === stickyCandidate.account.id
        ? "sticky-session"
        : preferredCandidates.length > 0
          ? "reset-priority-preemptive"
          : "reset-priority-reserve-relaxed";

    return {
      selected,
      scores,
      reason,
      stickyBinding,
      candidateCount: candidateStates.length,
    };
  }

  private getReserveThresholds(quotaState: QuotaState) {
    return {
      weekly: Math.max(
        this.preemptiveWeeklyReserveUnits,
        quotaState.weeklyTotal * this.preemptiveWeeklyReserveRatio,
      ),
      window: Math.max(
        this.preemptiveWindowReserveUnits,
        quotaState.window5hTotal * this.preemptiveWindowReserveRatio,
      ),
    };
  }

  private hasPreemptiveHeadroom(quotaState: QuotaState, estimatedUnits: number) {
    const thresholds = this.getReserveThresholds(quotaState);
    const weeklyRemainingAfterRequest = quotaState.weeklyRemaining - estimatedUnits;
    const windowRemainingAfterRequest = quotaState.window5hRemaining - estimatedUnits;

    return (
      weeklyRemainingAfterRequest >= thresholds.weekly &&
      windowRemainingAfterRequest >= thresholds.window
    );
  }

  private toResetRemainingMs(resetAt: string | null) {
    if (!resetAt) {
      return null;
    }

    const timestamp = new Date(resetAt).getTime();
    if (!Number.isFinite(timestamp)) {
      return null;
    }

    return Math.max(0, timestamp - Date.now());
  }

  private comparableResetMs(value: number | null) {
    return value === null ? Number.POSITIVE_INFINITY : value;
  }

  private compareByResetPriority(
    left: CandidateState,
    right: CandidateState,
    scoreByAccountId: Map<string, ScoreBreakdown>,
  ) {
    const leftScore = scoreByAccountId.get(left.account.id);
    const rightScore = scoreByAccountId.get(right.account.id);
    const leftWeekly = this.comparableResetMs(leftScore?.weeklyResetInMs ?? null);
    const rightWeekly = this.comparableResetMs(rightScore?.weeklyResetInMs ?? null);
    if (leftWeekly !== rightWeekly) {
      return leftWeekly - rightWeekly;
    }

    const leftWindow = this.comparableResetMs(leftScore?.windowResetInMs ?? null);
    const rightWindow = this.comparableResetMs(rightScore?.windowResetInMs ?? null);
    if (leftWindow !== rightWindow) {
      return leftWindow - rightWindow;
    }

    // Tie-break by existing score to preserve health/error preference.
    return (rightScore?.total ?? 0) - (leftScore?.total ?? 0);
  }

  private isViable(status: string, quotaState: QuotaState, estimatedUnits: number) {
    if (status === "invalid" || status === "cooling" || status === "exhausted") {
      return false;
    }

    if (quotaState.reservedUnits >= this.maxConcurrentPerAccount) {
      return false;
    }

    return (
      quotaState.weeklyRemaining >= estimatedUnits &&
      quotaState.window5hRemaining >= estimatedUnits &&
      quotaState.sampleTime !== null
    );
  }

  private scoreAccount(
    accountId: string,
    quotaState: QuotaState,
    boundAccountId: string | null,
    estimatedUnits: number,
  ): ScoreBreakdown {
    const healthScore = this.accountManager.getHealthScore(accountId);
    const account = this.accountManager.getAccount(accountId);
    const totalAttempts = (account?.successCount ?? 0) + (account?.failureCount ?? 0);
    const recentErrorPenalty =
      totalAttempts === 0
        ? 0
        : Math.min(1, (account?.failureCount ?? 0) / Math.max(totalAttempts, 1));
    const switchingCost = boundAccountId && boundAccountId !== accountId ? 1 : 0;
    const stickyBonus = boundAccountId === accountId ? schedulerWeights.stickyBonus : 0;
    const thresholds = this.getReserveThresholds(quotaState);
    const weeklyRemainingAfterRequest = Math.max(0, quotaState.weeklyRemaining - estimatedUnits);
    const windowRemainingAfterRequest = Math.max(0, quotaState.window5hRemaining - estimatedUnits);
    const preemptiveEligible =
      weeklyRemainingAfterRequest >= thresholds.weekly &&
      windowRemainingAfterRequest >= thresholds.window;
    const weeklyResetInMs = this.toResetRemainingMs(quotaState.weeklyResetAt);
    const windowResetInMs = this.toResetRemainingMs(quotaState.window5hResetAt);

    const total =
      schedulerWeights.weekly * quotaState.weeklyRemainingRatio +
      schedulerWeights.window * quotaState.window5hRemainingRatio +
      schedulerWeights.health * healthScore -
      schedulerWeights.error * recentErrorPenalty -
      schedulerWeights.switching * switchingCost +
      stickyBonus;

    return {
      accountId,
      total,
      weeklyRemainingRatio: quotaState.weeklyRemainingRatio,
      windowRemainingRatio: quotaState.window5hRemainingRatio,
      healthScore,
      recentErrorPenalty,
      switchingCost,
      stickyBonus,
      preemptiveEligible,
      weeklyReserveUnits: thresholds.weekly,
      windowReserveUnits: thresholds.window,
      weeklyRemainingAfterRequest,
      windowRemainingAfterRequest,
      weeklyResetInMs,
      windowResetInMs,
    };
  }
}

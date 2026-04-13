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
    const candidateStates = this.accountManager
      .listAccounts()
      .filter((account) => !excluded.has(account.id))
      .filter((account) => account.status !== "invalid" && account.status !== "cooling")
      .map((account) => ({
        account,
        quotaState: this.quotaVirtualizer.getAccountQuotaState(account.id),
      }))
      .filter(({ account, quotaState }) =>
        this.isViable(account.status, quotaState, input.estimatedUnits),
      );

    if (candidateStates.length === 0) {
      throw new Error("No schedulable account is available.");
    }

    const scores = candidateStates.map(({ account, quotaState }) =>
      this.scoreAccount(account.id, quotaState, stickyBinding?.accountId ?? null),
    );

    const stickyCandidate = stickyBinding
      ? candidateStates.find(({ account, quotaState }) => {
          return (
            account.id === stickyBinding.accountId &&
            quotaState.window5hRemainingRatio >= this.stickyMinWindowRatio &&
            quotaState.weeklyRemainingRatio >= this.stickyMinWeeklyRatio
          );
        })
      : undefined;

    const selected =
      stickyCandidate ??
      [...candidateStates].sort((left, right) => {
        const rightScore = scores.find((item) => item.accountId === right.account.id)?.total ?? 0;
        const leftScore = scores.find((item) => item.accountId === left.account.id)?.total ?? 0;
        return rightScore - leftScore;
      })[0];

    const reason =
      stickyCandidate && stickyBinding?.accountId === stickyCandidate.account.id
        ? "sticky-session"
        : "best-score";

    return {
      selected,
      scores,
      reason,
      stickyBinding,
      candidateCount: candidateStates.length,
    };
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
    };
  }
}

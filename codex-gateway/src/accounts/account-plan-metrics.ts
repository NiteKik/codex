import type {
  Account,
  PlanQuotaPool,
  QuotaState,
  SubscriptionPlanBucket,
} from "../types.js";

const planOrder: SubscriptionPlanBucket[] = ["team", "plus", "pro", "free", "unknown"];

export const normalizePlanBucket = (
  planType: string | null | undefined,
): SubscriptionPlanBucket => {
  const normalized = planType?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return "unknown";
  }

  if (
    normalized.includes("team") ||
    normalized.includes("business") ||
    normalized.includes("enterprise") ||
    normalized.includes("org")
  ) {
    return "team";
  }

  if (normalized.includes("plus")) {
    return "plus";
  }

  if (normalized.includes("pro")) {
    return "pro";
  }

  if (
    normalized.includes("free") ||
    normalized.includes("trial")
  ) {
    return "free";
  }

  return "unknown";
};

export const getPlanBucketLabel = (planBucket: SubscriptionPlanBucket) => {
  if (planBucket === "team") {
    return "Team / Business";
  }

  if (planBucket === "plus") {
    return "Plus";
  }

  if (planBucket === "pro") {
    return "Pro";
  }

  if (planBucket === "free") {
    return "Free";
  }

  return "Unknown";
};

const createEmptyPlanPool = (planBucket: SubscriptionPlanBucket): PlanQuotaPool => ({
  planBucket,
  planLabel: getPlanBucketLabel(planBucket),
  accountCount: 0,
  routableAccountCount: 0,
  healthyAccountCount: 0,
  coolingAccountCount: 0,
  exhaustedAccountCount: 0,
  invalidAccountCount: 0,
  weeklyTotal: 0,
  weeklyUsed: 0,
  weeklyRemaining: 0,
  weeklyRemainingRatio: 0,
  window5hTotal: 0,
  window5hUsed: 0,
  window5hRemaining: 0,
  window5hRemainingRatio: 0,
  latestSampleTime: null,
});

const pickLatestSampleTime = (current: string | null, next: string | null) => {
  if (!next) {
    return current;
  }

  if (!current) {
    return next;
  }

  return new Date(next).getTime() > new Date(current).getTime() ? next : current;
};

export const buildPlanQuotaPools = (
  accounts: Account[],
  resolveQuotaState: (accountId: string) => QuotaState,
) => {
  const pools = new Map<SubscriptionPlanBucket, PlanQuotaPool>();

  for (const account of accounts) {
    const planBucket = normalizePlanBucket(account.subscription.planType);
    const pool = pools.get(planBucket) ?? createEmptyPlanPool(planBucket);
    pools.set(planBucket, pool);

    pool.accountCount += 1;

    if (account.status === "invalid") {
      pool.invalidAccountCount += 1;
      continue;
    }

    pool.routableAccountCount += 1;

    if (account.status === "healthy") {
      pool.healthyAccountCount += 1;
    } else if (account.status === "cooling") {
      pool.coolingAccountCount += 1;
    } else if (account.status === "exhausted") {
      pool.exhaustedAccountCount += 1;
    }

    const quota = resolveQuotaState(account.id);
    pool.weeklyTotal += quota.weeklyTotal;
    pool.weeklyUsed += quota.weeklyUsed;
    pool.weeklyRemaining += quota.weeklyRemaining;
    pool.window5hTotal += quota.window5hTotal;
    pool.window5hUsed += quota.window5hUsed;
    pool.window5hRemaining += quota.window5hRemaining;
    pool.latestSampleTime = pickLatestSampleTime(pool.latestSampleTime, quota.sampleTime);
  }

  return [...pools.values()]
    .map((pool) => ({
      ...pool,
      weeklyRemainingRatio:
        pool.weeklyTotal > 0 ? pool.weeklyRemaining / pool.weeklyTotal : 0,
      window5hRemainingRatio:
        pool.window5hTotal > 0 ? pool.window5hRemaining / pool.window5hTotal : 0,
    }))
    .sort((left, right) => planOrder.indexOf(left.planBucket) - planOrder.indexOf(right.planBucket));
};

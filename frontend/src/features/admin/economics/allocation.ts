export type EconomicsUsageFamilyInput = {
  runs?: number;
  tokens_total?: number;
  provider_call_cost_usd?: number;
  provider_call_count?: number;
};

export type EconomicsUsageInput = {
  families?: Record<string, EconomicsUsageFamilyInput>;
};

export type EconomicsBillInput = {
  provider_name: string;
  amount_cny: number;
  families: string[];
};

export type EconomicsWeightBasis = 'tokens' | 'runs' | 'none';

export type EconomicsUnitRatePer = 'per_1k_tokens' | 'per_run' | 'none';

export type EconomicsFamilyAllocation = {
  family: string;
  runs: number;
  tokensTotal: number;
  providerCallCount: number;
  providerCallCostUsd: number;
  weightBasis: EconomicsWeightBasis;
  weight: number;
  billCostCny: number;
  unitRateCny: number;
  unitRatePer: EconomicsUnitRatePer;
  zeroCostWithCalls: boolean;
};

export type EconomicsAllocationResult = {
  rows: EconomicsFamilyAllocation[];
  totalBillCostCny: number;
  unattributedBillCostCny: number;
  totalRuns: number;
  totalTokens: number;
};

export type EconomicsRevenueInput = {
  net_revenue_cny?: number;
  active_paid_accounts?: number;
  trialing_accounts?: number;
  breakdown?: {
    plus?: { accounts?: number; amount?: number };
    pro?: { accounts?: number; amount?: number };
    agency?: { accounts?: number; amount?: number };
  };
};

export type EconomicsMarginSnapshot = {
  revenueCny: number;
  costCny: number;
  grossMarginRatio: number | null;
  activePaidAccounts: number;
  trialingAccounts: number;
  perPaidUserCostCny: number | null;
  perPaidUserRevenueCny: number | null;
  perTrialingAccountCostCny: number | null;
};

function readNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function usageFamily(
  usage: EconomicsUsageInput | null,
  family: string,
): Required<EconomicsUsageFamilyInput> {
  const entry = usage?.families?.[family];
  return {
    runs: readNumber(entry?.runs),
    tokens_total: readNumber(entry?.tokens_total),
    provider_call_cost_usd: readNumber(entry?.provider_call_cost_usd),
    provider_call_count: readNumber(entry?.provider_call_count),
  };
}

export function economicsFamilyWeight(
  family: string,
  usage: EconomicsUsageInput | null,
): { weight: number; basis: EconomicsWeightBasis } {
  const entry = usageFamily(usage, family);
  if (entry.tokens_total > 0) {
    return { weight: entry.tokens_total, basis: 'tokens' };
  }
  return { weight: entry.runs, basis: 'runs' };
}

export function allocateEconomicsBillCosts(
  bills: EconomicsBillInput[],
  usage: EconomicsUsageInput | null,
): EconomicsAllocationResult {
  const familyCosts = new Map<string, number>();
  let totalBillCostCny = 0;
  let unattributedBillCostCny = 0;

  for (const bill of bills) {
    const amount = readNumber(bill.amount_cny);
    if (amount <= 0) continue;
    totalBillCostCny += amount;

    const families = Array.from(new Set((bill.families || []).filter(Boolean)));
    if (!families.length) {
      unattributedBillCostCny += amount;
      continue;
    }

    const useTokens = families.every((family) => usageFamily(usage, family).tokens_total > 0);
    const weights = families.map((family) => ({
      family,
      weight: useTokens ? usageFamily(usage, family).tokens_total : Math.max(0, usageFamily(usage, family).runs),
    }));
    const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);

    if (totalWeight <= 0) {
      unattributedBillCostCny += amount;
      continue;
    }
    for (const item of weights) {
      const share = item.weight / totalWeight;
      familyCosts.set(item.family, (familyCosts.get(item.family) ?? 0) + amount * share);
    }
  }

  const familyNames = Array.from(
    new Set([...Object.keys(usage?.families ?? {}), ...familyCosts.keys()]),
  ).sort();

  const rows = familyNames.map((family) => {
    const entry = usageFamily(usage, family);
    const { weight, basis } = economicsFamilyWeight(family, usage);
    const billCostCny = familyCosts.get(family) ?? 0;
    let unitRateCny = 0;
    let unitRatePer: EconomicsUnitRatePer = 'none';

    if (billCostCny > 0) {
      if (basis === 'tokens' && entry.tokens_total > 0) {
        unitRateCny = billCostCny / (entry.tokens_total / 1000);
        unitRatePer = 'per_1k_tokens';
      } else if (entry.runs > 0) {
        unitRateCny = billCostCny / entry.runs;
        unitRatePer = 'per_run';
      }
    }

    return {
      family,
      runs: entry.runs,
      tokensTotal: entry.tokens_total,
      providerCallCount: entry.provider_call_count,
      providerCallCostUsd: entry.provider_call_cost_usd,
      weightBasis: basis,
      weight,
      billCostCny,
      unitRateCny,
      unitRatePer,
      zeroCostWithCalls: entry.provider_call_count > 0 && entry.provider_call_cost_usd === 0,
    };
  });

  return {
    rows,
    totalBillCostCny,
    unattributedBillCostCny,
    totalRuns: rows.reduce((sum, row) => sum + row.runs, 0),
    totalTokens: rows.reduce((sum, row) => sum + row.tokensTotal, 0),
  };
}

export function buildEconomicsMargin(
  revenue: EconomicsRevenueInput | null,
  allocation: EconomicsAllocationResult,
): EconomicsMarginSnapshot {
  const revenueCny = readNumber(revenue?.net_revenue_cny);
  const costCny = allocation.totalBillCostCny;
  const activePaidAccounts = readNumber(revenue?.active_paid_accounts);
  const trialingAccounts = readNumber(revenue?.trialing_accounts);

  return {
    revenueCny,
    costCny,
    grossMarginRatio: revenueCny > 0 ? (revenueCny - costCny) / revenueCny : null,
    activePaidAccounts,
    trialingAccounts,
    perPaidUserCostCny:
      activePaidAccounts > 0 ? costCny / activePaidAccounts : null,
    perPaidUserRevenueCny:
      activePaidAccounts > 0 ? revenueCny / activePaidAccounts : null,
    perTrialingAccountCostCny:
      trialingAccounts > 0 ? costCny / trialingAccounts : null,
  };
}

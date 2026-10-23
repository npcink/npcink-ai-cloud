import { describe, expect, it } from 'vitest';
import { allocateEconomicsBillCosts, buildEconomicsMargin } from '../../src/features/admin/economics/allocation';
const bill = (amount_cny: number, families: string[]) => ({ provider_name: 'private', amount_cny, families });
describe('browser-only bill allocation', () => {
  it('uses token shares when every selected family has tokens, deduplicating mappings', () => {
    const result = allocateEconomicsBillCosts([bill(80, ['text', 'vision', 'text'])], { families: { text: { tokens_total: 3000, runs: 1 }, vision: { tokens_total: 1000, runs: 99 } } });
    expect(result.rows.find(row => row.family === 'text')?.billCostCny).toBe(60);
    expect(result.rows.find(row => row.family === 'vision')?.billCostCny).toBe(20);
  });
  it('uses one run denominator for mixed token and non-token families without invented multipliers', () => {
    const result = allocateEconomicsBillCosts([bill(100, ['text', 'knowledge'])], { families: { text: { tokens_total: 1000000, runs: 1 }, knowledge: { runs: 3 } } });
    expect(result.rows.find(row => row.family === 'text')?.billCostCny).toBe(25);
    expect(result.rows.find(row => row.family === 'knowledge')?.billCostCny).toBe(75);
  });
  it('retains unallocated amounts for missing mappings or zero/unknown weights', () => {
    const result = allocateEconomicsBillCosts([bill(9, []), bill(21, ['unknown'])], null);
    expect(result.totalBillCostCny).toBe(30);
    expect(result.unattributedBillCostCny).toBe(30);
    expect(result.rows.reduce((sum, row) => sum + row.billCostCny, 0)).toBe(0);
  });
  it('conserves costs across multiple bills and excludes nonfinite or negative amounts', () => {
    const result = allocateEconomicsBillCosts([bill(10, ['text']), bill(20, ['text', 'image']), bill(5, []), bill(-9, ['text']), bill(NaN, [])], { families: { text: { runs: 2 }, image: { runs: 1 } } });
    expect(result.totalBillCostCny).toBe(35);
    expect(result.rows.reduce((sum, row) => sum + row.billCostCny, result.unattributedBillCostCny)).toBeCloseTo(35);
  });
  it('does not turn zero revenue into an invented margin or unknown account counts into division', () => {
    const allocation = allocateEconomicsBillCosts([bill(30, [])], null);
    expect(buildEconomicsMargin(null, allocation).grossMarginRatio).toBeNull();
    expect(buildEconomicsMargin({ net_revenue_cny: 60, active_paid_accounts: 0 }, allocation)).toMatchObject({ grossMarginRatio: 0.5, perPaidUserCostCny: null });
  });
});

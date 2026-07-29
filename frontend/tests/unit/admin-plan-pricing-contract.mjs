import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromFrontendRoot } from './_paths.mjs';

const planPage = readFileSync(fromFrontendRoot('src/components/admin/PlanManagementWorkbench.tsx'), 'utf8');
const i18n = readFileSync(fromFrontendRoot('src/lib/i18n.ts'), 'utf8');

assert.match(
  planPage,
  /sales_price_cny[\s\S]*max_cost_cny_per_period/,
  'Admin package editor must keep sales price and model cost budget as separate values'
);
assert.match(
  planPage,
  /sales_price_cny_detail[\s\S]*period_cost_budget_detail/,
  'Admin package editor must explain customer price and internal cost-budget purposes'
);
assert.match(
  planPage,
  /sales_price_cny: Number\(form\.sales_price_cny/,
  'Admin package publish request must send the customer-facing sales price'
);
assert.match(
  i18n,
  /销售价格（人民币\/30天）[\s\S]*模型成本预算（人民币\/周期）/,
  'Chinese admin copy must use CNY for both customer price and internal accounting budget'
);

console.log('admin_plan_pricing_contract: ok');

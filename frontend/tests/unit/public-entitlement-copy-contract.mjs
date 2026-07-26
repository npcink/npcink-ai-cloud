import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
const pricing = read('src/components/public/PublicPricingSection.tsx');
const help = read('src/app/help/page.tsx');
const terms = read('src/app/terms/page.tsx');
const publicPolicyCopy = `${pricing}\n${help}\n${terms}`;

assert.match(
  pricing,
  /data-plan-entitlement-notice[\s\S]*Free 服务和额度归 Cloud 账户，不随站点转移[\s\S]*Cloud 显示的冷却期/,
  'public pricing must retain the zh-CN account-owned Free entitlement notice'
);
assert.match(
  pricing,
  /data-plan-entitlement-notice[\s\S]*Free service and credits belong to the Cloud account[\s\S]*cooldown shown by Cloud/,
  'public pricing must retain the English account-owned Free entitlement notice'
);

assert.match(
  help,
  /同一账户可以随时重新连接[\s\S]*无需单独提交人工审核[\s\S]*以 Cloud 页面显示为准/,
  'help must explain automatic post-cooldown validation without a manual review request'
);
assert.match(
  help,
  /same account may reconnect at any time[\s\S]*no separate manual review request is required[\s\S]*availability time shown by Cloud/i,
  'help must retain the English automatic post-cooldown validation guidance'
);

assert.match(
  terms,
  /Free 套餐和额度属于 Cloud 账户，不属于 WordPress 站点[\s\S]*注册只创建账号[\s\S]*首次可信 Addon 连接完成后/,
  'terms must retain account ownership and verified-Addon activation rules'
);
assert.match(
  terms,
  /同一账户可以重新连接已移除的站点[\s\S]*冷却期结束[\s\S]*以操作时 Cloud 显示的状态为准/,
  'terms must retain same-account reconnect and Cloud-authoritative cooldown rules'
);
assert.match(
  terms,
  /Free service and credits belong to the Cloud account, not the WordPress site[\s\S]*Registration creates the account only[\s\S]*first verified Addon connection/,
  'terms must retain the English account ownership and verified-Addon activation rules'
);
assert.match(
  terms,
  /same account may reconnect a removed site[\s\S]*cooldown shown by Cloud[\s\S]*Cloud status shown at the time of the action controls/i,
  'terms must retain the English same-account reconnect and Cloud-authoritative cooldown rules'
);

assert.doesNotMatch(
  publicPolicyCopy,
  /(?:联系|请求|要求).{0,12}(?:管理员|客服).{0,12}(?:提前解除|跳过冷却)|(?:operator|support).{0,24}(?:bypass|manual unlock)/i,
  'public policy copy must not advertise an operator bypass as a normal customer path'
);

console.log('public_entitlement_copy_contract: ok');

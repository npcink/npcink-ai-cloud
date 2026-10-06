import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
const pricing = read('src/components/public/PublicPricingSection.tsx');
const help = read('src/app/help/page.tsx');
const terms = read('src/app/terms/page.tsx');
const registration = read('src/app/portal/register/page.tsx');
const translations = read('src/lib/i18n.ts');
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
  /原账户可随时重新连接[\s\S]*以 Cloud 页面显示为准[\s\S]*无需人工审核[\s\S]*套餐和额度不会转移/,
  'help must retain concise same-account, cooldown, review, and entitlement guidance'
);
assert.match(
  help,
  /account may reconnect at any time[\s\S]*cooldown shown by Cloud[\s\S]*no manual review is required[\s\S]*Plans and credits do not transfer/i,
  'help must retain the concise English reconnect and entitlement guidance'
);

assert.match(
  terms,
  /Free 套餐和额度属于 Cloud 账户，不属于 WordPress 站点[\s\S]*注册验证成功后[\s\S]*站点及连接凭据仍须通过可信 Addon 连接建立/,
  'terms must separate registration-time entitlement from verified site connection'
);
assert.match(
  terms,
  /同一账户可以重新连接已移除的站点[\s\S]*冷却期结束[\s\S]*以操作时 Cloud 显示的状态为准/,
  'terms must retain same-account reconnect and Cloud-authoritative cooldown rules'
);
assert.match(
  terms,
  /Free service and credits belong to the Cloud account, not the WordPress site[\s\S]*Verified registration activates[\s\S]*sites and connection credentials still require a verified Addon connection/,
  'terms must separate registration-time entitlement from verified site connection in English'
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

assert.match(
  translations,
  /'portal\.register\.request_desc': '填写邮箱获取验证码；验证成功后获得 Free，注册不创建站点。'/,
  'registration must separate the email-code request from verified Free activation in zh-CN'
);
for (const copy of [translations, registration]) {
  assert.ok(
    copy.includes('Enter your email to get a verification code. Verified registration activates Free without creating a site.'),
    'English registration and its fallback must distinguish requesting a code from verified activation'
  );
  assert.doesNotMatch(
    copy,
    /create an account\. No site or service credit is created at this step/,
    'registration must not describe the unverified code-request step as completed account creation'
  );
}

console.log('public_entitlement_copy_contract: ok');

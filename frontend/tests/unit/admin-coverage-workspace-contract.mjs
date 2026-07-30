import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const coverageSource = readFileSync(resolve(process.cwd(), 'src/app/admin/coverage/page.tsx'), 'utf8');
const layoutSource = readFileSync(resolve(process.cwd(), 'src/app/admin/layout.tsx'), 'utf8');
const i18nSource = readFileSync(resolve(process.cwd(), 'src/lib/i18n.ts'), 'utf8');

assert.match(
  coverageSource,
  /title=\{t\('admin\.coverage_surface_title'[\s\S]*Service status/,
  'Coverage surface must use the direct service-status title'
);

assert.match(
  coverageSource,
  /useSearchParams\(\)[\s\S]*updateQueueUrl[\s\S]*status[\s\S]*reason[\s\S]*sort[\s\S]*focus/,
  'Coverage filters, sort, and inspector focus must survive refresh and detail navigation through the URL'
);

assert.match(
  coverageSource,
  /type QueueSort = 'priority' \| 'expiry' \| 'customer'[\s\S]*searchQuery[\s\S]*reasonFilter[\s\S]*visibleItems = useMemo/,
  'Coverage queue must support search, reason filtering, and explicit prioritization'
);

assert.match(
  coverageSource,
  /visibleItems\.find\(\(item\) => queueItemKey\(item\) === selectedKey\)[\s\S]*aria-controls="coverage-inspector"/,
  'Coverage inspector must follow an explicit customer selection instead of always taking the first row'
);

assert.match(
  coverageSource,
  /customerDisplayName[\s\S]*admin\.coverage\.unnamed_customer[\s\S]*admin\.coverage\.account_id_label/,
  'Coverage workspace must separate a readable customer label from the explicitly labelled internal account ID'
);

assert.match(
  coverageSource,
  /actionOpensAccount[\s\S]*showSelectedCustomerAction[\s\S]*admin\.coverage_open_customer_action/,
  'Coverage inspector must hide its duplicate customer action when the primary action already opens that account'
);

assert.doesNotMatch(
  coverageSource,
  /tab_packages|activeTab|setActiveTab|\/api\/admin\/plans/,
  'Coverage workspace must not reintroduce the duplicate package overview tab or fetch the package catalog directly'
);

assert.doesNotMatch(
  coverageSource,
  /actions=\{\([\s\S]*admin\.coverage_open_subscription_queue_action/,
  'Coverage header must not duplicate the subscription action already owned by each queue item'
);

assert.match(
  coverageSource,
  /coverageRequestActiveRef = useRef[\s\S]*coverageRequestSequenceRef = useRef[\s\S]*loadCoverage\(true\)/,
  'Coverage queue must deduplicate initial loading and expose a bounded refresh action'
);

assert.match(
  coverageSource,
  /overflow-x-auto[\s\S]*<table[\s\S]*admin\.coverage\.table_issue[\s\S]*admin\.coverage\.table_impact/,
  'The service queue must use a compact semantic table with explicit issue and impact columns'
);

assert.match(
  coverageSource,
  /<tbody>[\s\S]*data-ui="coverage-queue-item"[\s\S]*tabIndex=\{0\}[\s\S]*aria-selected=\{isSelected\}[\s\S]*aria-controls="coverage-inspector"[\s\S]*event\.key === 'Enter' \|\| event\.key === ' '/,
  'Coverage table rows must select the connected customer inspector with pointer and keyboard input'
);

assert.doesNotMatch(
  layoutSource,
  /href: '\/admin\/subscriptions'[\s\S]*labelKey: 'admin\.nav_subscriptions'/,
  'Subscription risk must not return as a top-level admin sidebar entry'
);

assert.match(
  i18nSource,
  /'admin\.coverage_surface_title': '服务状态'/,
  'Coverage queue must provide direct Simplified Chinese title copy'
);

assert.match(
  i18nSource,
  /'admin\.coverage\.refresh_action': '刷新'[\s\S]*'admin\.coverage\.search_placeholder': '客户、账户、订阅或套餐'[\s\S]*'admin\.coverage\.sort_priority': '影响最高'[\s\S]*'admin\.coverage\.unnamed_customer': '未命名客户'[\s\S]*'admin\.coverage\.account_id_label': '账户 ID'[\s\S]*'admin\.coverage\.table_customer': '客户'[\s\S]*'admin\.coverage\.table_issue': '问题'[\s\S]*'admin\.coverage\.table_impact': '影响'/,
  'Coverage toolbar and table must provide Simplified Chinese utility copy'
);

assert.doesNotMatch(
  coverageSource,
  /invoice_create|createCheckout|paymentIntent|wordpress_write|auto_apply|publish_to_wordpress/i,
  'Coverage workspace must not introduce commercial front-office or WordPress write actions'
);

console.log('admin_coverage_workspace_contract: ok');

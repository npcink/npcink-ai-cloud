import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const coverageSource = readFileSync(resolve(process.cwd(), 'src/app/admin/coverage/page.tsx'), 'utf8');
const layoutSource = readFileSync(resolve(process.cwd(), 'src/app/admin/layout.tsx'), 'utf8');
const i18nSource = readFileSync(resolve(process.cwd(), 'src/lib/i18n.ts'), 'utf8');
const serviceSource = readFileSync(
  resolve(process.cwd(), '../app/domain/commercial/mixins/_admin_mixin.py'),
  'utf8'
);

assert.match(
  coverageSource,
  /title=\{t\('admin\.coverage_surface_title'[\s\S]*Service status/,
  'Coverage surface must use the direct service-status title'
);

assert.match(
  coverageSource,
  /useSearchParams\(\)[\s\S]*updateQueueUrl[\s\S]*status[\s\S]*reason[\s\S]*sort/,
  'Coverage filters and sort must survive refresh and detail navigation through the URL'
);

assert.match(
  coverageSource,
  /type QueueSort = 'priority' \| 'expiry' \| 'customer'[\s\S]*searchQuery[\s\S]*reasonFilter[\s\S]*visibleItems = useMemo/,
  'Coverage queue must support search, reason filtering, and explicit prioritization'
);

assert.doesNotMatch(
  coverageSource,
  /selectedQueueItem|selectedKey|coverage-inspector|AdminSettingsDisclosure|BackofficeIdentifier|active_api_keys_label|snapshot_status_metric/,
  'Coverage workspace must not keep a selection inspector, technical identifiers, key counts, or billing snapshot diagnostics'
);

assert.doesNotMatch(
  coverageSource,
  /common\.actions|<td className="px-4 py-3 text-right">/,
  'Coverage rows must not duplicate selection with a generic action column'
);

assert.match(
  coverageSource,
  /item\.severity === 'error' \|\| item\.severity === 'warning'[\s\S]*href=\{item\.action_href\}[\s\S]*translateActionLabel/,
  'Coverage table must expose one contextual action only for warning or error rows'
);

assert.match(
  coverageSource,
  /customerLabelsByKey[\s\S]*admin\.coverage\.customer_position[\s\S]*data-ui="coverage-queue-item"[\s\S]*href=\{`\/admin\/accounts\/\$\{encodeURIComponent\(item\.account\.account_id\)\}`\}/,
  'Coverage rows must show direct account-detail links without a competing row-selection interaction'
);

assert.match(
  coverageSource,
  /normalizeQueueView[\s\S]*: 'needs_action'[\s\S]*key === 'status' && value === 'needs_action'[\s\S]*coverage-filter-toolbar[\s\S]*admin\.coverage\.status_filter_label[\s\S]*disabled=\{!searchQuery && !reasonFilter && view === 'needs_action'[\s\S]*setView\('needs_action'\)/,
  'Coverage defaults to customers needing action and the clear action restores that URL-owned default'
);

assert.match(
  coverageSource + serviceSource,
  /primary_identity\?[\s\S]*customer_identity_missing[\s\S]*customer_identity_conflict[\s\S]*customer_access_disabled[\s\S]*#customer-access/,
  'Coverage must search customer login identity and route identity problems to customer access'
);

assert.doesNotMatch(
  coverageSource,
  /id="coverage-inspector"|aria-controls="coverage-inspector"|tabIndex=\{0\}|aria-selected=/,
  'Coverage table must not retain inspector selection or row-level keyboard navigation'
);

assert.match(
  coverageSource,
  /const hadLegacyFocus = params\.has\('focus'\);[\s\S]*params\.delete\('focus'\)/,
  'Coverage must normalize retired inspector focus parameters out of legacy URLs'
);

assert.match(
  coverageSource,
  /href=\{`\/admin\/accounts\/\$\{encodeURIComponent\(item\.account\.account_id\)\}`\}/,
  'Coverage customer identities must open account detail directly'
);

assert.match(
  coverageSource,
  /item\.severity === 'error' \|\| item\.severity === 'warning'[\s\S]*translateReasonCode[\s\S]*\) : null/,
  'Coverage rows must reserve issue copy for warning and error items'
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
  /overflow-x-auto[\s\S]*<table[\s\S]*common\.package[\s\S]*common\.subscription[\s\S]*common\.sites[\s\S]*admin\.coverage\.table_issue[\s\S]*admin\.coverage\.table_impact/,
  'The service queue must use one full-width semantic table with package, subscription, sites, issue, and impact'
);

assert.doesNotMatch(
  coverageSource,
  /admin\.account_detail\.active_api_keys_label|admin\.subscriptions\.snapshot_status_metric|coverage-technical-info|admin\.coverage\.account_id_label/,
  'Coverage table must leave key, billing, and internal identifier diagnostics to customer detail'
);

assert.match(
  layoutSource,
  /href: '\/admin\/coverage'[\s\S]*activePrefixes: \['\/admin\/coverage'\][\s\S]*href: '\/admin\/subscriptions'[\s\S]*labelKey: 'admin\.nav_subscriptions'[\s\S]*activePrefixes: \['\/admin\/subscriptions'\]/,
  'Service risks and subscriptions must be independent top-level sidebar destinations'
);

assert.match(
  i18nSource,
  /'admin\.coverage_surface_title': '服务状态'/,
  'Coverage queue must provide direct Simplified Chinese title copy'
);

assert.match(
  i18nSource,
  /'admin\.coverage\.refresh_action': '刷新'[\s\S]*'admin\.coverage\.search_placeholder': '客户、账户、订阅或套餐'[\s\S]*'admin\.coverage\.sort_priority': '影响最高'[\s\S]*'admin\.coverage\.unnamed_customer': '未命名客户'[\s\S]*'admin\.coverage\.customer_position': '\{\{name\}\} · \{\{index\}\}\/\{\{total\}\}'[\s\S]*'admin\.coverage\.table_customer': '客户'[\s\S]*'admin\.coverage\.table_issue': '问题'[\s\S]*'admin\.coverage\.table_impact': '影响'/,
  'Coverage toolbar and table must provide Simplified Chinese utility copy'
);

assert.doesNotMatch(
  coverageSource,
  /invoice_create|createCheckout|paymentIntent|wordpress_write|auto_apply|publish_to_wordpress/i,
  'Coverage workspace must not introduce commercial front-office or WordPress write actions'
);

console.log('admin_coverage_workspace_contract: ok');

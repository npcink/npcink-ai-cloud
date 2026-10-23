import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { frontendRoot } from './_paths.mjs';

const coverageSource = readFileSync(resolve(frontendRoot, 'src/app/admin/coverage/page.tsx'), 'utf8');
const layoutSource = readFileSync(resolve(frontendRoot, 'src/app/admin/layout.tsx'), 'utf8');
const navigationSource = readFileSync(resolve(frontendRoot, 'src/features/admin/navigation.ts'), 'utf8');
const i18nSource = readFileSync(resolve(frontendRoot, 'src/lib/i18n.ts'), 'utf8');
const serviceSource = readFileSync(
  resolve(frontendRoot, '../app/domain/commercial/mixins/_admin_mixin.py'),
  'utf8'
);

assert.match(
  coverageSource,
  /title=\{t\('admin\.coverage_surface_title'[\s\S]*Service status/,
  'Coverage surface must use the direct service-status title'
);

assert.match(
  coverageSource,
  /useSearchParams\(\)[\s\S]*updateQueueUrl[\s\S]*status[\s\S]*reason[\s\S]*sort[\s\S]*offset[\s\S]*limit/,
  'Coverage filters, sort, and pagination must survive refresh and detail navigation through the URL'
);

assert.match(
  coverageSource,
  /type QueueSort = 'priority' \| 'expiry' \| 'customer'[\s\S]*coverageRequestKey = useMemo[\s\S]*status: view[\s\S]*sort[\s\S]*offset[\s\S]*limit[\s\S]*params\.set\('q'[\s\S]*params\.set\('reason'/,
  'Coverage queue must send search, reason, ordering, and pagination scope to the service'
);

assert.doesNotMatch(
  coverageSource,
  /visibleQueueItems[\s\S]*\.filter\([\s\S]*\.sort\(/,
  'Coverage must not filter and reorder one fetched page in the browser'
);

assert.match(
  coverageSource + serviceSource,
  /changePage[\s\S]*setOffset\([\s\S]*updateQueueUrl\(\{ offset:[\s\S]*data-ui="coverage-pagination"[\s\S]*filtered_items\.sort[\s\S]*pagination[\s\S]*has_more/,
  'Coverage pagination must be URL-backed while filtering and ordering happen before service pagination'
);

assert.match(
  coverageSource,
  /AdminInspectorDrawer[\s\S]*focusedCoverageKey[\s\S]*selectedCoverageItem/,
  'Coverage workspace must use an on-demand shared evidence drawer'
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
  /normalizeQueueView[\s\S]*: 'needs_action'[\s\S]*key === 'status' && value === 'needs_action'[\s\S]*admin\.coverage\.status_filter_label[\s\S]*coverage-filter-toolbar[\s\S]*disabled=\{!searchQuery && !reasonFilter && view === 'needs_action'[\s\S]*setView\('needs_action'\)/,
  'Coverage defaults to customers needing action and the clear action restores that URL-owned default'
);

assert.match(
  coverageSource + serviceSource,
  /primary_identity\?[\s\S]*customer_identity_missing[\s\S]*customer_identity_conflict[\s\S]*customer_access_disabled[\s\S]*#customer-access/,
  'Coverage must search customer login identity and route identity problems to customer access'
);

assert.match(
  serviceSource,
  /missing_package_coverage[\s\S]*#coverage-actions[\s\S]*subscription_lifecycle_risk[\s\S]*\/admin\/subscriptions\/[\s\S]*billing_snapshot_follow_up[\s\S]*\/admin\/subscriptions\/[\s\S]*site_status_follow_up[\s\S]*#site-footprint/,
  'Coverage actions must route package, subscription, billing, and site problems to their owning work surfaces'
);

assert.doesNotMatch(
  coverageSource,
  /tabIndex=\{0\}|aria-selected=/,
  'Coverage table must not turn rows into a second keyboard-selection model'
);

assert.match(
  coverageSource,
  /focus: itemKey[\s\S]*onClose=\{\(\) => updateQueueUrl\(\{ focus: null \}\)\}/,
  'Coverage evidence focus must be addressable and closing it must preserve queue filters'
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
  navigationSource,
  /commercialWorkspaceTabs[\s\S]*href: '\/admin\/coverage'[\s\S]*href: '\/admin\/subscriptions'/,
  'Service status and subscriptions must stay sibling tabs in the commercial workspace'
);

assert.match(
  layoutSource,
  /href: '\/admin\/subscriptions'[\s\S]*labelKey: 'admin\.nav_commercial_records'/,
  'The commercial workspace must own one primary sidebar entry'
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


assert.match(coverageSource, /const DEFAULT_PAGE_SIZE = 10;[\s\S]*parsed >= 1 && parsed <= 500/, 'default ten rows must preserve existing URL limit1..500');
assert.match(coverageSource, /role="group" aria-label=\{t\('admin\.coverage\.status_filter_label'\)\}[\s\S]*aria-pressed=\{view === filter.value\}/, 'service states are mutually exclusive named pills');
assert.match(coverageSource, /queueParamsRef.current.toString\(\)\) return;[\s\S]*setDebouncedSearchQuery/, 'local URL synchronization must not bypass the existing search debounce');
assert.match(coverageSource, /window.setTimeout[\s\S]*setDebouncedSearchQuery\(searchQuery\)[\s\S]*250/, 'search stays automatically debounced at250ms');
assert.match(coverageSource, /loadedQuery.delete\('offset'\)[\s\S]*requestedQuery.delete\('offset'\)[\s\S]*isDebouncingSearch/, 'retained query identity includes the debounce window and all dimensions except offset');
assert.match(coverageSource, /if \(isRefreshing \|\| isRetainingDifferentQuery\) return;/, 'handlers cannot paginate retained results into another query');
assert.match(coverageSource, /nextOffset === offset\) void loadCoverage\(true\)/, 'same target offset retries a real GET');
assert.match(coverageSource, /queueRequestKey === coverageRequestKey &&[\s\S]*!isDebouncingSearch &&[\s\S]*!isRefreshing &&[\s\S]*pagination.total <= offset/, 'automatic recovery consumes only current successful evidence');
assert.match(coverageSource, /rangeStart = visibleItems.length[\s\S]*rangeEnd = visibleItems.length[\s\S]*data-ui="coverage-pagination"/, 'zero and single-page ranges stay visible and use actual returned rows');
for (const key of ['summary_total', 'filter_needs_action', 'common.updated_at', 'visibleSummary.error', 'visibleSummary.warning', 'activeQueue.generated_at']) assert.ok(coverageSource.includes(key), `preserve summary/freshness ${key}`);
assert.match(coverageSource, /disabled=\{isRefreshing \|\| isRetainingDifferentQuery \|\| pagination.offset <= 0\}/, 'previous obeys the query boundary');
assert.match(coverageSource, /disabled=\{isRefreshing \|\| isRetainingDifferentQuery \|\| !pagination.hasMore\}/, 'next keeps backend has_more and the query boundary');

console.log('admin_coverage_workspace_contract: ok');

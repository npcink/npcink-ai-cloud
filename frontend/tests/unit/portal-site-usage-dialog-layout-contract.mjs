import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dialog = readFileSync(resolve(root, 'src/components/portal/PortalSiteUsageDialog.tsx'), 'utf8');
const trend = readFileSync(resolve(root, 'src/components/portal/PortalCreditTrendPanel.tsx'), 'utf8');
const client = readFileSync(resolve(root, 'src/lib/portal-client.ts'), 'utf8');
const summary = readFileSync(resolve(root, 'src/lib/portal-summary-text.ts'), 'utf8');
const i18n = readFileSync(resolve(root, 'src/lib/i18n.ts'), 'utf8');
const spec = readFileSync(resolve(root, '../docs/portal-ui-spec.md'), 'utf8');

// 1. One shared time range above the tabs (covers trend + records; 1h maps to an explicit range).
assert.match(dialog, /data-portal-usage="site-dialog-range"[\s\S]*data-portal-usage="site-dialog-tabs"/, 'shared range must sit above the tabs');
assert.doesNotMatch(dialog, /creditEventWindow|creditTrendWindow|credit_events_window_period/, 'no per-tab time range state');
assert.doesNotMatch(dialog, /onWindowChange=/, 'embedded trend must not render its own range tabs');
assert.match(dialog, /range !== '1h'[\s\S]*startAt[\s\S]*endAt/, '1h records use an explicit start/end range');

// 2. Fixed height, inner scroll, sticky header.
assert.match(dialog, /className="h-\[min\(90vh,48rem\)\]/, 'dialog height must be fixed, not max-h');
assert.match(dialog, /sticky -top-4 z-20[^"]*bg-white[^"]*"\s*data-portal-usage="site-dialog-header"/, 'summary/range/tabs header must stick');

// 3. Units + punctuation.
assert.match(i18n, /'portal\.usage\.credit_events_summary': '当前筛选共 \{\{count\}\} 次服务，合计使用 \{\{credits\}\} AI 积分'/, 'zh records summary uses AI 积分 and no trailing 。');
assert.doesNotMatch(dialog + trend, /` · \$\{t\(/, 'inline " · " joins must go through joinSummaryParts');
assert.match(summary, /replace\(\/\[。．\.！!？\?；;，,\]\+\$\/u, ''\)/, 'joinSummaryParts strips trailing punctuation');
assert.match(dialog, /joinSummaryParts\(\[\s*t\('portal\.usage\.trend_total'/);
assert.match(dialog, /joinSummaryParts\(\[\s*t\(\s*'portal\.usage\.credit_events_summary'/);

// 4. Summary row carries the range; embedded chart has no card border/summary line.
assert.match(dialog, /data-portal-usage="site-dialog-summary"[\s\S]*site-dialog-summary-text[\s\S]*site-dialog-range/);
assert.match(trend, /className=\{embedded \? '' : 'rounded-xl border/, 'embedded trend drops the card border');
assert.match(trend, /\{embedded \? null : \(\s*<p className="text-sm/, 'embedded trend drops its own summary line');

// 5. Values on the chart: max line + tooltip with units.
assert.match(trend, /data-portal-usage="trend-max-line"[\s\S]*portal\.usage\.trend_max_label/);
assert.match(trend, /data-portal-usage="trend-tooltip"[\s\S]*\{pointLabel\} · \{valueLabel\}/);
assert.match(i18n, /'portal\.usage\.trend_max_label': '峰值 \{\{count\}\} AI 积分'/);

// 6. Zero buckets keep a faint baseline.
assert.match(trend, /credits > 0 \? \([\s\S]*\) : \([\s\S]*data-portal-usage="trend-zero-bucket"/);

// 7. Whole row opens detail with ›; no actions column / 查看详情 button text.
assert.match(dialog, /<tr[\s\S]*?onClick=\{\(\) => setSelectedCreditEvent\(entry\)\}[\s\S]*?data-portal-usage="records-row"/);
assert.match(dialog, /<span aria-hidden="true">›<\/span>/);
assert.doesNotMatch(dialog, /common\.actions/, 'no 操作 column');
assert.doesNotMatch(dialog, /\{t\('common\.view_details'\)\}\s*<\/button>/, 'no visible 查看详情 button');

// 8. Unit in the header only.
assert.match(dialog, /text-right font-medium">\{t\('portal\.usage\.credit_events_points_column'\)\}/);
assert.match(dialog, /tabular-nums">\s*\{formatCreditAmount\(entry\.consumed_ai_credits\)\}/, 'table cells show bare numbers');

// 9. Tight columns, fixed layout, long service names wrap.
assert.match(dialog, /table-fixed/);
assert.doesNotMatch(dialog, /min-w-\[560px\]|px-3 py-4/);
assert.match(dialog, /break-words px-2 py-3/);

// 10. Pagination is always visible (sticky footer, even for one page).
assert.match(dialog, /sticky -bottom-4[^"]*"\s*aria-label=\{t\('common\.pagination'[\s\S]*data-portal-usage="records-pagination"/);
assert.match(dialog, /creditEventCount > 0\)\) \? \(\s*<nav/);
assert.doesNotMatch(dialog, /ListPagination/, 'ListPagination hides single pages; the dialog renders its own footer');

// A. Light range control: segmented text buttons, no grey block, short labels, centred with the summary.
assert.match(dialog, /className="flex items-center justify-between gap-4" data-portal-usage="site-dialog-summary"/);
assert.match(dialog, /className="flex shrink-0 items-center gap-1"\s*data-portal-usage="site-dialog-range"/);
assert.doesNotMatch(dialog, /bg-slate-100 p-1|bg-white text-blue-700 shadow-sm/, 'range control has no grey block / pill');
assert.match(dialog, /key: 'portal\.usage\.range_short_1h'[\s\S]*range_short_30d/);
assert.match(i18n, /'portal\.usage\.range_short_1h': '1 小时'[\s\S]*'portal\.usage\.range_short_30d': '30 天'/);

// B. 7d / 30d records grouped by local day: ONE aggregation request per page (credit-event-days, browser tz).
assert.match(dialog, /const isDayMode = !bucketFilter && \(usageRange === '7d' \|\| usageRange === '30d'\)/);
assert.match(dialog, /getAccountCreditEventDays\(\{[\s\S]*?timezone: browserTimeZone\(\),[\s\S]*?feature: creditEventFeature,[\s\S]*?limit: DAY_PAGE_SIZE,\s*offset: nextOffset,/);
assert.doesNotMatch(dialog, /buildLocalDays|limit: 1,/, 'no per-day fan-out requests');
assert.match(client, /`\/account\/credit-event-days\?\$\{params\.toString\(\)\}`/);
assert.match(client, /new URLSearchParams\(\{ window: options\.window, tz: options\.timezone \}\)/);
assert.match(dialog, /data-portal-usage="records-day-row"[\s\S]*openDay\(day\)/, 'clicking a day drills down');
assert.doesNotMatch(dialog, /records-day-detail|expandedDayKey|formatDayBreakdown/, 'no inline expand / breakdown text');
assert.match(dialog, /dayFeatureTotals\.slice\(0, 3\)/, 'max 3 window-level service columns');
assert.match(dialog, /dayHasOtherColumn/, '其他 column');
assert.match(dialog, /records-day-service-cell[\s\S]*· \{Math\.round\(share \* 100\)\}%[\s\S]*–/, 'cell N · P% with dash for zero');
assert.match(dialog, /day_calls_column[\s\S]*day_total_column/, 'calls + total columns');
assert.match(dialog, /records-day-breadcrumb[\s\S]*onClick=\{closeDay\}/, 'breadcrumb back');
assert.match(dialog, /records-day-drill[\s\S]*PortalCreditTrendPanel[\s\S]*window="24h"[\s\S]*onBucketSelect[\s\S]*records-bucket-chip/, 'drill reuses 24h bars + hour chip');
assert.match(dialog, /savedDayScrollRef/, 'back restores scroll');
assert.match(dialog, /useLayoutEffect\(\(\) => \{\s*const top = pendingDayScrollRestoreRef\.current;\s*if \(drillDay \|\| top === null \|\| !dayRows\) return;/, 'restore after cached day rows render, not from the click handler');
assert.match(dialog, /new ResizeObserver\(apply\)/, 're-apply scroll restore until the container is tall enough (no max-scroll clamp)');
assert.doesNotMatch(dialog, /requestAnimationFrame\(\(\) => scrollContainer\(\)\?\.scrollTo\(\{ top \}\)\)/, 'no racing rAF restore in closeDay');
assert.match(dialog, /limit: 50,\s*offset: collected\.length/, 'expanded day loads every call of the day');
assert.match(dialog, /day_pagination_summary[\s\S]*loadDayPage\(dayOffset \+ DAY_PAGE_SIZE\)/, 'pagination is by day');
assert.match(dialog, /records-feature-filter/, 'service filter stays');
assert.match(i18n, /'portal\.usage\.day_calls_column': '调用次数'[\s\S]*'portal\.usage\.day_total_column': '合计 AI 积分'/);

// C. Chart bars open records for that bucket with a removable chip.
assert.match(trend, /onClick=\{onBucketSelect \? \(\) => onBucketSelect\(point\) : undefined\}/);
assert.match(dialog, /onBucketSelect=\{selectTrendBucket\}/);
assert.match(dialog, /setBucketFilter\(\{ startAt: point\.start_at, endAt: point\.end_at[\s\S]*?setActiveView\('records'\)/);
assert.match(dialog, /data-portal-usage="records-bucket-chip"[\s\S]*?onClick=\{\(\) => setBucketFilter\(null\)\}/);
assert.match(dialog, /bucketFilter\s*\? \{ window: usageRange === '1h' \? '24h' as const : usageRange, startAt: bucketFilter\.startAt, endAt: bucketFilter\.endAt \}/);

// ⓘ glued to the last word of the summary.
assert.match(dialog, /<span className="whitespace-nowrap" data-portal-usage="site-dialog-summary-tail">\s*\{summaryTail\}\s*<PortalInfoHint/);
// Tab underline is derived from the active view only (no stale state).
assert.match(dialog, /aria-selected=\{activeView === view\.value\}[\s\S]*?activeView === view\.value\s*\? 'border-slate-950/);

// Axis: no regular label within one interval of the last label.
assert.match(trend, /index === lastIndex \|\| \(index % labelEvery === 0 && lastIndex - index >= labelEvery\)/);

assert.match(spec, /站点用量弹窗布局/, 'spec documents the site usage dialog layout');
console.log('portal_site_usage_dialog_layout_contract: ok');

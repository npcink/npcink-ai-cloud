import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dialog = readFileSync(resolve(root, 'src/components/portal/PortalSiteUsageDialog.tsx'), 'utf8');
const trend = readFileSync(resolve(root, 'src/components/portal/PortalCreditTrendPanel.tsx'), 'utf8');
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
assert.match(dialog, /creditEventCount > 0 \? \(\s*<nav/);
assert.doesNotMatch(dialog, /ListPagination/, 'ListPagination hides single pages; the dialog renders its own footer');

// Narrow screens: the range control is a 4-column grid so 30 天 never clips.
assert.match(dialog, /className="grid w-full grid-cols-4[^"]*sm:inline-flex/);

// ⓘ glued to the last word of the summary.
assert.match(dialog, /<span className="whitespace-nowrap" data-portal-usage="site-dialog-summary-tail">\s*\{summaryTail\}\s*<PortalInfoHint/);
// Tab underline is derived from the active view only (no stale state).
assert.match(dialog, /aria-selected=\{activeView === view\.value\}[\s\S]*?activeView === view\.value\s*\? 'border-slate-950/);

assert.match(spec, /站点用量弹窗布局/, 'spec documents the site usage dialog layout');
console.log('portal_site_usage_dialog_layout_contract: ok');

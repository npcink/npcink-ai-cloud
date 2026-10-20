import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const display = readFileSync(resolve(root, 'src/lib/portal-monitoring-display.ts'), 'utf8');
const page = readFileSync(resolve(root, 'src/app/portal/sites/[siteId]/page.tsx'), 'utf8');
const breadcrumb = readFileSync(resolve(root, 'src/components/portal/PortalBreadcrumb.tsx'), 'utf8');
const workspaceHeader = readFileSync(resolve(root, 'src/components/portal/PortalWorkspaceHeader.tsx'), 'utf8');
const portalUiSpec = readFileSync(resolve(root, '../docs/portal-ui-spec.md'), 'utf8');
const service = readFileSync(resolve(root, 'src/components/portal/PortalSiteServiceStatus.tsx'), 'utf8');
const knowledge = readFileSync(resolve(root, 'src/components/portal/PortalSiteKnowledgePanel.tsx'), 'utf8');
const i18n = readFileSync(resolve(root, 'src/lib/i18n.ts'), 'utf8');

assert.match(display, /export function isPortalPluginMissingAction/);
assert.match(display, /export function extractMissingPluginSlugs/);
assert.match(display, /export function getPortalCustomerIssueDetail/);
assert.match(display, /export function isPortalRecheckHelpfulForAction/);
assert.match(display, /Recheck will not install them/);

assert.match(page, /pluginMissingPrimary/);
assert.match(page, /getPortalCustomerIssueDetail\(primaryMonitoringAction/);
assert.match(page, /secondaryAction:\s*attentionSecondaryAction/);

assert.match(service, /attention-detail/);
assert.match(page, /testId: 'attention-secondary'/);
assert.match(service, /serviceWarningCoveredByAttention/);
assert.match(service, /PortalStatusInline/);

assert.match(knowledge, /hardUpdateFailure/);
assert.match(knowledge, /softUpdateIssue/);
assert.match(knowledge, /status_usable|soft_update_note/);
assert.match(knowledge, /knowledge-soft-note-help/, 'Soft update note lives in 最近更新 ⓘ');
assert.match(knowledge, /knowledge-last-updated-help/, '最近更新 metric exposes PortalInfoHint hook');
assert.match(
  knowledge,
  /last_indexed[\s\S]*softUpdateNote[\s\S]*knowledge-soft-note-help|softUpdateNote[\s\S]*lastUpdatedDetailLabel[\s\S]*knowledge-last-updated-help/,
  'Soft note is composed into 最近更新 metric hint, not title help'
);
assert.doesNotMatch(
  knowledge,
  /data-portal-site="knowledge-soft-note"/,
  'Soft update note must not render as a body paragraph'
);
assert.match(knowledge, /data-portal-site="knowledge-help"/, 'Knowledge intro lives in title ⓘ');
assert.doesNotMatch(
  knowledge,
  /data-portal-site="knowledge-help"[\s\S]*?softUpdateNote[\s\S]*?\{softUpdateIssue/,
  'Title ⓘ must not include soft sync-failure note'
);
assert.match(
  knowledge,
  /data-portal-site="knowledge-help"[\s\S]*?knowledgeDesc[\s\S]*?knowledgeScopeNote[\s\S]*?\{softUpdateIssue/,
  'Title ⓘ is what/scope only'
);
assert.match(knowledge, /PortalInfoHint/, 'Knowledge ⓘ must use contained PortalInfoHint (FloatingPortal), not in-flow absolute CSS');
assert.doesNotMatch(
  knowledge,
  /group-hover:block|group-focus-within:block/,
  'Knowledge help must not use absolute CSS hover tooltips that leak under metric strips'
);
const portalScaffold = readFileSync(resolve(root, 'src/components/portal/PortalScaffold.tsx'), 'utf8');
assert.match(portalScaffold, /export function PortalInfoHint/);
assert.match(portalScaffold, /FloatingPortal/, 'PortalInfoHint mounts help only while open via FloatingPortal');
assert.match(
  portalScaffold,
  /detailDisplay === 'hint'[\s\S]*PortalInfoHint/,
  'Metric hint ⓘ must use PortalInfoHint (FloatingPortal), not native title spans'
);
assert.match(display, /PORTAL_BASELINE_PLUGIN_SLUGS/);
assert.match(display, /isPortalCustomerPluginMissingAction/);
assert.match(service, /errorCount > 0 \? \(/, 'Explicit errors row only when count > 0');

assert.match(
  i18n,
  /'portal\.monitoring\.attention_missing_detail_with_plugins': 'Cloud is not receiving reports from: \{\{plugins\}\}[\s\S]*'portal\.monitoring\.attention_missing_detail_with_plugins': '云端未收到这些插件的上报：\{\{plugins\}\}/
);
assert.match(
  i18n,
  /'portal\.vector_obs\.status_usable': 'Knowledge is usable'[\s\S]*'portal\.vector_obs\.status_usable': '知识库可用'/
);
assert.match(
  i18n,
  /'portal\.vector_obs\.soft_update_note': 'In the last \{\{days\}\} days[\s\S]*'portal\.vector_obs\.soft_update_note': '近 \{\{days\}\} 天有 \{\{count\}\} 次更新未成功/
);
assert.match(
  i18n,
  /'portal\.monitoring\.attention_missing_title': 'Cloud Addon is not reporting'[\s\S]*'portal\.monitoring\.attention_missing_title': 'Cloud Addon 未上报'/
);
assert.match(
  i18n,
  /'portal\.monitoring\.service_explained_above': 'See note above'[\s\S]*'portal\.monitoring\.service_explained_above': '见上方说明'/
);


assert.match(page, /hasPortalQuotaPressure/);
assert.match(page, /Quiet default: banner only for concrete customer actions/);
assert.doesNotMatch(page, /hasPortalServiceAttention/, 'Site detail attention must not use soft component-driven hasPortalServiceAttention');


assert.match(service, /hasContent/, 'Empty service status card must gate on hasContent');
assert.match(service, /return null/, 'Quiet default: empty 服务状态 returns null');
assert.match(knowledge, /data-portal-site="knowledge-help"/, 'Knowledge intro (what/scope only) lives in title ⓘ, not body paragraph');
assert.doesNotMatch(
  knowledge,
  /<p className="text-sm leading-5 text-slate-600[\s\S]*knowledgeDesc/,
  'Knowledge must not always-render customer_desc as a body paragraph'
);


assert.match(breadcrumb, /data-portal-breadcrumb/, 'PortalBreadcrumb exposes a stable trail marker');
assert.match(breadcrumb, /aria-current=\{isCurrent \? 'page' : undefined\}/, 'Current crumb is marked aria-current=page');
assert.match(workspaceHeader, /breadcrumb\?:/, 'Workspace header accepts an optional breadcrumb slot');
assert.match(workspaceHeader, /data-portal-header-breadcrumb/, 'Breadcrumb renders above the title inside the header');
assert.match(page, /PortalBreadcrumb/, 'Site detail uses PortalBreadcrumb');
assert.match(
  page,
  /href:\s*'\/portal'[\s\S]*href:\s*'\/portal#sites'[\s\S]*\{\s*label:\s*displayName\s*\}/,
  'Site detail breadcrumb is Service → /portal, My sites → /portal#sites, current name plain'
);
assert.match(
  i18n,
  /'portal\.site_breadcrumb': 'Site location'[\s\S]*'portal\.site_breadcrumb': '站点位置'/,
  'Site breadcrumb aria-label is paired en + zh-CN'
);
assert.match(
  portalUiSpec,
  /服务 \/ 我的站点 \/ 当前站点/,
  'portal-ui-spec documents the site-detail breadcrumb trail'
);

console.log('portal_site_status_attention_contract: ok');

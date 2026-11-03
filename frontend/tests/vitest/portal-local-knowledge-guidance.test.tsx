import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalSiteKnowledgePanel } from '@/components/portal/PortalSiteKnowledgePanel';
import { LocaleProvider } from '@/contexts/LocaleContext';
import type { PortalVectorObservabilitySummary } from '@/lib/portal-client';

function render(environment: string, backend = 'postgres_json', failures = 0) {
  vi.stubEnv('NEXT_PUBLIC_ENV', environment);
  const summary = {
    site_id: 'site_test',
    window: { hours: 168 },
    health: { status: 'warning' },
    totals: {
      index_jobs_total: 99, index_succeeded_total: 99, index_failed_total: 0,
      current_document_count: 86, search_queries_total: 106,
      search_failed_total: failures, no_hit_rate: 0.12, p95_search_latency_ms: 5391,
      last_search_finished_at: '2026-11-01T00:50:22+08:00',
    },
    index_snapshots: [{ document_count: 86, vector_backend: backend, embedding_provider: 'ollama-m4-embedding' }],
  } as PortalVectorObservabilitySummary;
  return renderToStaticMarkup(<LocaleProvider><PortalSiteKnowledgePanel summary={summary} /></LocaleProvider>);
}

afterEach(() => vi.unstubAllEnvs());

describe('local knowledge latency guidance', () => {
  it('retains latency evidence and explains the development scope', () => {
    const html = render('development');
    expect(html).toContain('开发检索较慢');
    expect(html).toContain('5.4 秒');
    expect(html).toContain('最近一次检索');
    expect(html).toContain('慢响应由开发侧处理');
  });

  it.each(['production', 'staging', '', 'test'])('keeps ordinary guidance in %s', environment => {
    const html = render(environment);
    expect(html).not.toContain('开发检索较慢');
    expect(html).not.toContain('慢响应由开发侧处理');
    expect(html).toContain('请联系支持');
  });

  it('does not label hosted vector storage as the local search setup', () => {
    expect(render('development', 'zilliz_cloud')).not.toContain('开发检索较慢');
  });

  it('does not replace actual search failures with local latency guidance', () => {
    const html = render('development', 'postgres_json', 1);
    expect(html).not.toContain('开发检索较慢');
    expect(html).not.toContain('慢响应由开发侧处理');
    expect(html).toContain('1 次检索失败');
  });
});

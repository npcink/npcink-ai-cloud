type Copy = readonly [string, string];
type Guidance = { kind: string; title: Copy; meaning: Copy; next: Copy };
type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value !== null && typeof value === 'object' ? value as RecordValue : {};
const count = (value: unknown): number | null => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const nonnegative = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const timestamp = (value: unknown): string | null => typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value)) ? value : null;

export function getVectorGuidance(raw: unknown, environment: string | undefined, siteId: string): (Guidance & { lastSearchAt: string | null }) | null {
  const source = record(raw);
  const totals = record(source.totals);
  const searchFailed = count(totals.search_failed_total);
  const indexFailed = count(totals.index_failed_total);
  const searches = count(totals.search_queries_total);
  const latency = nonnegative(totals.p95_search_latency_ms);
  const noHitRate = nonnegative(totals.no_hit_rate);
  const groups = source.failure_groups ?? source.errors;
  const hasFailures = (searchFailed ?? 0) > 0 || (indexFailed ?? 0) > 0 ||
    (Array.isArray(groups) && groups.some(item => (count(record(item).count) ?? 0) > 0));
  let guidance: Guidance;
  if (hasFailures) {
    guidance = {
      kind: 'failures', title: ['所选时段存在失败，先核对失败记录', 'Failures in this period: inspect the records first'],
      meaning: ['部分索引或检索未完成，可能影响知识更新或推荐结果；具体原因见下方所选错误。', 'Some indexing or searches did not finish, which may affect knowledge updates or recommendations. Inspect the selected error below.'],
      next: ['先按最后发生时间检查运行诊断；处理后用新的正常业务结果核实，刷新只重读记录。', 'Check runtime diagnostics at the last occurrence. Verify with fresh normal business results after handling it; refresh only reloads records.'],
    };
  } else if (searchFailed === null || indexFailed === null) {
    guidance = {
      kind: 'unknown', title: ['失败证据不完整，暂不能判断是否正常', 'Incomplete failure evidence: status is unverified'],
      meaning: ['返回数据缺少有效的失败计数，不能按零失败处理。', 'Valid failure counts are missing; this does not mean zero failures.'],
      next: ['先刷新；仍缺失时，按当前站点与时间范围查看运行诊断。', 'Refresh first. If evidence is still missing, inspect runtime diagnostics for this site and period.'],
    };
  } else if (searches !== null && searches > 0 && latency !== null && latency >= 1200) {
    const snapshots = Array.isArray(source.index_snapshots) ? source.index_snapshots.map(record).filter(item => item.site_id === siteId) : [];
    snapshots.sort((a, b) => Date.parse(String(b.captured_at)) - Date.parse(String(a.captured_at)));
    const latest = snapshots.every(item => timestamp(item.captured_at)) ? snapshots[0] : undefined;
    const local = environment === 'development' && Boolean(siteId) && latest?.vector_backend === 'postgres_json' && latest?.embedding_provider === 'ollama-m4-embedding';
    guidance = {
      kind: local ? 'slow_local' : 'slow',
      title: local ? ['开发检索较慢，可继续验证结果', 'Slow development searches: continue checking results'] : ['所选时段检索较慢，原因尚未定位', 'Slow searches in this period: cause not yet identified'],
      meaning: local
        ? ['最近索引快照为本地开发方案；本期未记录索引或检索失败，但等待会更长。快照不代表当前运行配置。', 'The latest index snapshot uses the local development setup. No index or search failures were recorded in this period, but waits are longer. The snapshot does not establish the current runtime configuration.']
        : ['响应较慢会增加推荐等待时间；耗时汇总不能证明模型或向量数据库故障。', 'Slower responses increase recommendation wait time. Aggregate latency does not establish a model or vector database failure.'],
      next: local
        ? ['先继续验证检索结果；若持续影响联调，按最近检索时间检查运行诊断。上线前用正式向量服务建立性能基线。', 'Continue validating search results. If delays keep disrupting development, inspect diagnostics at the last search time. Establish a hosted-service baseline before launch.']
        : ['按最近检索时间检查运行诊断，区分模型请求与向量查询耗时；修正后查看新的业务样本。', 'Inspect diagnostics at the last search time to separate model request and vector query latency; check fresh business samples after changes.'],
    };
  } else if (searches !== null && searches > 0 && noHitRate !== null && noHitRate >= 0.25 && noHitRate <= 1) {
    guidance = {
      kind: 'no_hit', title: ['未命中较多，先检查知识覆盖', 'Frequent no-hits: check knowledge coverage first'],
      meaning: ['未命中表示搜索没有找到相关内容，可能影响推荐完整性；不能据此判断服务连接失败。', 'A no-hit means no related content was found and may reduce recommendation coverage. It does not establish a connection failure.'],
      next: ['在下方站点与意图分布核对内容覆盖和查询意图；需要更新知识时回到 WordPress 发起同步。', 'Compare coverage and query intent in the breakdown below. Start knowledge updates from WordPress when needed.'],
    };
  } else if (['warning', 'error'].includes(String(record(source.health).status))) {
    guidance = {
      kind: 'unknown', title: ['存在历史异常信号，原因尚未定位', 'Historical warning: cause not yet identified'],
      meaning: ['现有证据不足以解释健康评分，不能直接归因为向量服务故障。', 'Available evidence does not explain the health score or establish a vector service failure.'],
      next: ['先刷新并核对当前范围；仍有疑问时查看运行诊断和高级索引快照。', 'Refresh and verify the scope first. If unclear, inspect runtime diagnostics and advanced index snapshots.'],
    };
  } else {
    return null;
  }
  return { ...guidance, lastSearchAt: timestamp(totals.last_search_finished_at) };
}

export function getVectorFailureGuidance(code: string): { meaning: Copy; next: Copy; settings?: boolean } {
  if (['site_knowledge.embedding_provider_missing', 'site_knowledge.zilliz_config_missing', 'site_knowledge.vector_backend_unsupported', 'site_knowledge.zilliz_sdk_missing'].includes(code)) {
    return { meaning: ['错误码指向向量服务配置或运行依赖缺失；当前是否仍缺失需要核实。', 'The code indicates missing vector configuration or runtime dependencies; the current state needs verification.'], next: ['先核对向量配置与部署依赖，再按发生时间查看运行诊断；不要直接重复同步。', 'Check vector configuration and deployment dependencies, then diagnostics at the occurrence time before repeating a sync.'], settings: true };
  }
  if (['site_knowledge.embedding_dimension_mismatch', 'site_knowledge.zilliz_schema_incompatible'].includes(code)) {
    return { meaning: ['错误码指向向量维度或集合结构不兼容，可能阻止写入或检索。', 'The code indicates incompatible vector dimensions or collection schema, which may block writes or searches.'], next: ['核对模型维度、向量空间及对应索引快照；由开发侧确认兼容方案后再操作，勿直接重建索引。', 'Compare model dimensions, vector space and index snapshots. Confirm a compatible plan with development before acting; avoid an immediate index rebuild.'], settings: true };
  }
  if (code === 'vector_search_timeout' || code === 'search.timeout' || code.endsWith('.embedding_timeout')) {
    return { meaning: ['这次请求超时；仅凭错误码无法区分模型启动、网络等待或向量查询慢。', 'The request timed out. The code alone cannot distinguish model startup, network waits or slow vector queries.'], next: ['按最后发生时间核对运行诊断中的请求耗时和错误；确认瓶颈后再调整，勿仅提高超时。', 'Compare request latency and errors in diagnostics at the last occurrence. Identify the bottleneck before making changes instead of only raising timeouts.'] };
  }
  return { meaning: ['这是一次历史失败；错误码尚不足以确认根因，也不能说明当前仍不可用。', 'This is a historical failure. Its code alone does not establish the root cause or current availability.'], next: ['按站点和最后发生时间查看运行诊断；有 run_id 时优先关联请求，结合服务日志定位后再处理。', 'Inspect diagnostics for the site and last occurrence. Correlate by run_id when available and use service logs to locate the cause before acting.'] };
}

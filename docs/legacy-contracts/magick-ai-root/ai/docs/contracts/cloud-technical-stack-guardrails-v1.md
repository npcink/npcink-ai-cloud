# Cloud Technical Stack Guardrails v1

> 状态：active
> 更新时间：2026-03-27
> 适用范围：`cloud/**`、`magick-ai-cloud-addon/**`、所有涉及 Cloud 技术选型、扩栈、重构、基础设施引入的实现与评审
> 上位边界：先读 [cloud-responsibility-boundary-v1.md](cloud-responsibility-boundary-v1.md)、[hosted-model-runtime-v1.md](hosted-model-runtime-v1.md)、[cloud-service-layering-matrix-v1.md](cloud-service-layering-matrix-v1.md)；若冲突，以上位边界为准。

## 1. 目标

- 冻结当前阶段 Cloud 技术栈，避免其他 AI 在“本地变轻、云端增强”的主线上继续扩成过重平台。
- 固定“当前什么栈是对的、什么栈要延后、什么绝对不能加”的判断标准。
- 让后续 AI 在实现本地收口与云端补位时，优先复用已有 Cloud runtime，而不是顺手再造第二套系统。

一句话固定为：

`保留当前 runtime 栈，限制 Cloud 前台扩张，禁止提前引入重型基础设施。`

## 2. 当前阶段前提

- 项目仍处于内部开发阶段。
- 当前没有外部用户。
- 本地插件仍然是唯一控制面。
- Cloud 仍然是 runtime/service enhancement layer，不是第二产品后台。
- 当前主要目标是：
  - 把本地产品面收口到基础能力
  - 让云端接住高级执行、detail surface、观测与托管元数据

因此，Cloud 技术栈的首要原则不是“面向未来最大化扩展”，而是：

`先把当前 runtime plane 做稳、做薄、做可运营。`

## 3. 当前冻结的 Cloud 技术栈

当前阶段固定技术栈为：

- API：FastAPI
- 配置：`pydantic-settings`
- 数据库：PostgreSQL
- 缓存 / 唤醒 / 短队列：Redis
- ORM / migration：SQLAlchemy + Alembic
- 追踪：OpenTelemetry
- 部署：Docker Compose
- 反向代理：Nginx 或 Caddy
- 运行形态：
  - `api`
  - `worker`
  - `postgres`
  - `redis`
  - 可选 bounded `frontend`
  - 外层 `proxy`

冻结理由：

- 这套组合已经覆盖当前项目真实需求：
  - hosted runtime
  - queue-backed run execution
  - usage / billing / entitlement ledger
  - health / diagnostics / summary projection
  - cloud-capable skills 的 `step_offload / whole_run_offload`
- 仓库中已有真实实现，不是纸面规划：
  - `cloud/pyproject.toml`
  - `cloud/docker-compose.dev.yml`
  - `cloud/app/**`
  - `cloud/app/workers/**`

## 4. 明确判定：当前技术栈是合适的

### 4.1 适合继续保留的原因

- `FastAPI + Pydantic` 适合当前 contract-first、runtime API、签名请求、typed payload 的执行层。
- `PostgreSQL` 适合承担：
  - `run_records`
  - `usage_meter_events`
  - `billing_snapshots`
  - `site_entitlement_snapshots`
  - 其他需要 durable truth 和可重算能力的数据。
- `Redis` 当前只用作：
  - worker 唤醒
  - 短 TTL replay / receipt / queue assist
  - bounded runtime pressure support
  这与当前边界一致，不会替代 canonical truth。
- `Alembic` 适合当前内部阶段的快速 schema 演进。
- `Docker Compose` 适合当前单团队、单仓、内测阶段的本地开发与远端验证闭环。

### 4.2 当前不需要更重方案的原因

- 当前 Cloud 还不是 GA 商业前台，也不是面向大规模多团队的平台产品。
- 当前主问题不是“吞吐不够”或“多 region 编排不够”，而是：
  - 边界收口
  - detail surface 补位
  - runtime 稳定性
  - 运营闭环
- 因此现在继续加基础设施，收益很低，认知负担和实施成本很高。

## 5. 后续 AI 默认允许做的事

后续 AI 在 Cloud 技术面默认允许：

- 继续在 `FastAPI` 内扩 runtime / stats / detail API
- 继续扩 `worker`，承接：
  - queue-backed runs
  - projection generation
  - diagnostics summary
  - latency / alert / health snapshot
- 继续扩 PostgreSQL schema、read model、ledger、billing snapshot
- 继续扩 Redis 辅助能力，但必须保持：
  - 非 canonical truth
  - 可重放
  - 可回退到 DB truth
- 继续扩 Cloud addon 对 detail surface 的消费
- 继续扩 bounded `/admin/*` 或 `/portal/*`，但前提是：
  - 不复制插件控制面
  - 不抢本地真值
  - 不抢主配置所有权

## 6. 后续 AI 默认应延后的事

以下方向默认延后，除非用户明确要求且先改上位边界文档：

- 更广义 queued/running lease recovery
- durable orchestration
- 更复杂 stage engine
- 更强 anomaly / risk / support bundle explainability
- customer-facing commercial front-office
- GA portal/session auth 体系
- seat lifecycle / invite lifecycle 的完整产品化
- payment / invoice / reconciliation / dunning
- 更完整的 Cloud frontend 产品层

这些都不是当前“本地收口、云端承接增强层”的阻塞项。

## 7. 绝对禁止提前引入的技术与形态

### 7.1 禁止新增的重型基础设施

当前阶段禁止 AI 自行引入：

- `Temporal`
- `Cadence`
- `Airflow`
- `Dagster`
- `Celery`
- `RabbitMQ`
- `Kafka`
- `NATS`
- `Pulsar`
- `Kubernetes-first` 部署要求
- service mesh
- event-sourcing platform
- 第二套 workflow engine
- 第二套 scheduler truth

固定原因：

- 当前项目规模与阶段不需要。
- 当前 repo 已有 `worker + Redis wake-up + DB truth` 的最小可运营闭环。
- 这些基础设施会显著抬高部署、调试、认知、测试和跨 AI 协作成本。

### 7.2 禁止新增的错误产品形态

当前阶段禁止 AI 把 Cloud 扩成：

- 第二套 `skill registry`
- 第二套 `MCP` 平台
- 第二套 `Agent Gateway` 平台
- 第二套 router 控制台
- 第二套 prompt/preset 控制台
- 第二套 ability/workflow/projection 真源
- 第二套 WordPress write owner

## 8. Cloud Frontend 的冻结规则

当前 Cloud frontend 只允许是 bounded surface，不允许变成主产品后台。

允许：

- service status
- usage / billing / entitlement detail
- runtime runs / diagnostics detail
- bounded member portal
- bounded internal admin / operator surface

禁止：

- abilities/workflows/skills 控制台
- MCP / Agent Gateway 治理后台
- router / prompt / preset 主编辑后台
- 与本地插件重复的产品设置面

一句话固定为：

`Cloud frontend 可以做 detail surface，不能做第二控制面。`

## 9. 对本轮本地轻量化的直接约束

本轮本地轻量化完成后，云端补位的优先顺序固定为：

1. detail read surface
2. hosted metadata
3. routing / health / diagnostics recommendation
4. advisor / recommendation
5. 更多 cloud-capable skill runtime

优先补的对象：

- usage detail
- billing detail
- entitlement detail
- hosted pricing metadata
- hosted capability metadata
- hosted health snapshot
- routing recommendation
- prompt advisor
- preset advisor
- eval / canary / upgrade recommendation

不是优先项：

- 新 portal 产品线
- 新商业前台
- 新身份系统大重构
- 新编排引擎

## 10. 技术判断规则

后续 AI 遇到 Cloud 技术选型时，统一按下面 4 条判断：

1. 现有 `FastAPI + Postgres + Redis + worker` 是否已经能完成目标。
2. 若能完成，优先在现有栈内扩，不新增新基础设施。
3. 若不能完成，先在文档里证明是 runtime-plane 必需，而不是“看起来更先进”。
4. 若要突破本规范，必须先更新：
   - `cloud-responsibility-boundary-v1.md`
   - `hosted-model-runtime-v1.md`
   - 本文

## 11. 对其他 AI 的硬性执行要求

- 不得把“本地删掉的功能”自动理解成“云端要 1:1 全量重做”。
- 不得把 detail surface 与 control plane 混在一起实现。
- 不得为了补 detail API，就顺手加第二套 registry / publish / governance。
- 不得因为看到 `/portal/*` 或 `/admin/*` 已存在，就把 Cloud 误判为完整 SaaS 后台。
- 不得把 Redis、worker、callback 或 projection buffer 描述成 canonical truth。

## 12. Enforced By

- [cloud-responsibility-boundary-v1.md](cloud-responsibility-boundary-v1.md)
- [hosted-model-runtime-v1.md](hosted-model-runtime-v1.md)
- [cloud-service-layering-matrix-v1.md](cloud-service-layering-matrix-v1.md)
- [cloud-skill-execution-v1.md](cloud-skill-execution-v1.md)
- [local-plugin-cloud-simplification-v2-plan.md](../workflow/local-plugin-cloud-simplification-v2-plan.md)

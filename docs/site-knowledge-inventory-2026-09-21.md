# Site Knowledge 现状盘点（2026-09-21）

Status: static inventory record. 本文基于 2026-09-21 对 Cloud `master`（`f799bfc6`，
PR #982 之后）与 Addon `master`（`078bf419`，PR #154 之后）的静态代码阅读整理；
不包含运行验证、M4 证据或生产行为。文中行号会漂移，以文件名与符号名为准。

配套的战略方向记录见 [strategy-positioning-v1-2026-09-21.md](strategy-positioning-v1-2026-09-21.md)。

## 0. 摘要（面向战略决策的三句话）

1. Site Knowledge 已经是一个完整的站点检索子系统：5 张 PostgreSQL 表、两种向量后端
   （`postgres_json` 本地/回退、Zilliz Cloud 生产）、固定中文 embedding profile
   （`site-knowledge.zh.v1` = SiliconFlow `BAAI/bge-m3`，1024 维 COSINE）、
   11 种检索 intent、完整的作业与搜索指标。
2. 摄取与检索契约的 WordPress 耦合很深（第 5 节 17 条清单）；支持其他平台需要的是
   一层**内容源抽象**，不是重写检索内核。
3. 主要休眠面：评论摄取契约齐全但默认关闭且插件侧不上传评论体；推荐质量证据的
   阶段 3/4（真实 impression 与人工金标）待办；覆盖率为占位值；观测三表没有保留
   清理任务。

## 1. 存储与数据模型

| 表 | 说明 |
| --- | --- |
| `site_knowledge_documents` | 文档级元数据；唯一键 `(site_id, source_type, source_id)`（`app/core/models.py`，迁移 `20260603_0037`/`0038`） |
| `site_knowledge_chunks` | 分块与向量；唯一键 `(site_id, source_type, source_id, chunk_index)` |
| `site_knowledge_index_job_metrics` | 每次 sync run 的作业指标（迁移 `20260603_0039`） |
| `site_knowledge_search_metrics` | 每次搜索的指标（intent、top1_score、query_hash、latency） |
| `site_knowledge_index_snapshots` | 索引规模快照 |

- 核心字段：`site_id`、`post_id`、`source_type`（post/page/comment/media）、`source_id`、
  `parent_post_id`、`post_type`、`post_status`、`title`、`url`、`modified_gmt`、
  `content_hash`（有索引）、`last_sync_run_id`、`metadata_json`；chunks 另有
  `chunk_index`、`chunk_text`、`embedding_json`、`embedding_model`。
- **没有原生向量列**：`embedding_json` 是 JSON 列；本地/回退后端在 Python 内逐行计算
  cosine，回退全量上限 `MAX_FALLBACK_SEARCH_CHUNKS = 5000`
  （`app/domain/site_knowledge/service.py`、`backends.py`）。
- 向量后端仅两种：`postgres_json`（默认/本地）与 `zilliz_cloud`（生产，pymilvus），
  其余值报 `vector_backend_unsupported`（`app/domain/site_knowledge/backends.py`、
  `app/core/config.py`）。生产 collection `site_knowledge_zh_v1`，dim 1024，COSINE，
  AUTOINDEX，主键为 `{site_id}:{source_type}:{source_id}:{chunk_index}` 字符串；
  Zilliz 端点仅接受三族受信域名
  （`docs/site-knowledge-runtime-contract-v1.md`）。
- 规模约束：单文档 50000 字符 / 64 chunks；chunk 900 字符、重叠 120；每 run
  500 文档 / 5000 chunks；每站点 10000 文档 / 200000 chunks；预警比 0.85
  （`app/core/config.py`、`service.py`）。账号级 `vector_documents`、`media_images`
  限额来自商业配额，写入时对 Account 行 `FOR UPDATE` 防并发超卖。

## 2. 摄取路径

触发与投递（Addon `includes/class-cloud-site-knowledge-change-bridge.php`）：

- 即时事件挂 WP hooks（`transition_post_status`、`save_post`、`trashed_post`、
  `before_delete_post` 及评论 hooks），事件只把 post_id 写入有界 buffer（上限 500，
  溢出丢弃并记 `dropped_count`）。
- 去抖 180 秒后由 WP-Cron 单事件 flush（失败重试 300 秒、最多 3 次）。
  即"事件即时入队 + Cron 批量投递"。
- 每小时对账 hook：按 `(post_modified_gmt, ID)` 水位直查 `wp_posts`，每页 50 条。
- 全量/管理操作（start/rebuild）：选取全部公开 post/page（上限 10000），每批 200，
  批间轮询 Cloud run；rebuild 首批清索引。delete 需输入确认词
  （`includes/class-cloud-site-knowledge-admin-actions.php`）。
- 云端主动维护：Cloud 在 status 投影下发 `maintenance`（full_sync + request_id），
  Addon 自动分批重发；云端校验 request_id、批序与 `is_final`
  （`app/domain/site_knowledge/maintenance.py`）。

上传内容：仅公开 `post`/`page`（publish、无密码、排除 attachment；post_types 可经
`npcink_cloud_addon_site_knowledge_post_types` filter 扩展）。字段含
`content_excerpt`（1800 字符，先剔除 URL/邮箱/电话）、`excerpt`（300 字符）、
`taxonomies.{category,post_tag}`。评论事件只触发父文章刷新，不上传评论体
（Addon `docs/site-knowledge-vector-operations.md`）。媒体不经 Addon：云端视觉识别
后台产出 `media_items` 后由 Cloud 自身触发 sync。

去重与指纹：Addon 投递前对文档 JSON 取 sha256 作 `delivery_fingerprint`，成功后仅移除
指纹未变条目；变更批次幂等键 = 载荷 JSON sha256 前 32 位。云端按
`(site_id, source_type, source_id)` upsert（删旧 chunk 重插）；`content_hash` 缺省由
title/excerpt/content/taxonomies 派生；媒体有 `media_fingerprint` 与 `content_hash`
双层修订。

端点与契约：统一走 `POST /v1/runtime/execute`，ability `npcink-cloud/site-knowledge-sync`，
契约 `site_knowledge_sync.v1`，`data_classification=public_site_content`、
`storage_mode=result_only`（`app/domain/site_knowledge/contracts.py`）。sync 走 runtime
worker 队列，status 内联返回。

## 3. 检索能力

- Embedding：固定 profile `site-knowledge.zh.v1` = SiliconFlow `BAAI/bge-m3`，1024 维，
  COSINE（`app/domain/site_knowledge/vector_profile_contract.py`）。Admin 只能提交
  SiliconFlow API key + Zilliz endpoint/token，保存即活体探针（维度不符直接失败关闭）。
  `deterministic-sha256-mvp`（32 维）仅本地测试；另有 Ollama `qwen3-embedding:0.6b`
  本地预览 profile。检索前校验索引与查询处于同一 embedding 空间，不匹配返回
  `not_ready`。
- Reranker：仅一种外部位——Jina `jina-reranker-v3`（top_k 30、并发 8、超时 8 秒），
  默认 `disabled`（`app/domain/site_knowledge/rerankers.py`）。其余为云端确定性排序器
  （internal link / related content / media search quality 模块）加有界词面 bonus。
- 检索 API：同一 runtime execute 端点，ability `npcink-cloud/site-knowledge-search`，
  契约 `site_knowledge_search.v1`；11 种 intent：`site_search`、`related_content`、
  `writing_context`、`internal_links`、`refresh_suggestions`、`image_context`、
  `media_library_search`、`faq_candidates`、`content_gap_analysis`、`duplicate_check`、
  `writing_support_plan`；`result_granularity` 支持 chunk/document；`evidence_policy`
  （min_score/required_sources/no_hit_policy）；`internal_links` 独占 `source_passages`
  （≤24 条、单条 1200 字符、共 12000）。
- 调用方：① Addon/Toolbox 经 runtime bridge 与公开函数
  `npcink_cloud_addon_dispatch_site_knowledge_runtime`；② 云端 WordPress AI connector 在
  `title_generation`/`content_summary` 任务把场景文本作为隐藏 `writing_context` 注入
  （`app/domain/wordpress_ai_connector/runtime.py`）；③ 云端 `image_context` 视觉证据
  检索；④ Advisor 只读 observability。

## 4. 运维面

- Retention/cleanup：**没有**定时清理或保留策略代码。删除只有三条显式路径：
  `sync_mode=delete`、rebuild 前清空、账号/站点配额跳过。观测三表同样无 prune 任务。
- Maintenance：生命周期 `reindex_required / awaiting_site_sync / rebuilding / failed /
  ready / empty`，状态存 ProviderConnection `config_json` 与 Site `metadata_json`；
  `rebuild_index` 从 PostgreSQL 拷贝兼容 chunk 到 Zilliz 并做同向量往返验证
  （`app/domain/site_knowledge/vector_profile.py`）。
- Metrics：作业指标（accepted/indexed、failed、deleted、embedding provider/model/dims、
  duration）、搜索指标（intent、result_count、no_hit、top1/avg score、query_hash、
  latency）、索引快照；汇总窗口 1–720 小时；门户端点
  `GET /portal/account/site-knowledge-usage`。
- 计费与同意：sync 属 `metering_class=site_knowledge_index_maintenance`，不消耗
  ai_credits，但记 `vector_documents`/`vector_chunks` usage meter 事件。同意面在
  Addon 本地：`site_knowledge_delivery_enabled`（默认关闭）与
  `site_knowledge_generation_reference_enabled`。观测不落 query 原文（仅 sha256
  query_hash）、不落 embeddings 与 chunk 文本。

## 5. WordPress 耦合清单与跨平台抽象需求

摄取侧：

1. 内容主键是 WP 数字 ID（`post_id`/`source_id`/`parent_post_id` 均 Integer）。
2. 类型体系硬编码 `post/page/attachment` 与 source_type `post/page/comment/media`。
3. 状态机是 WP `post_status`，仅 `publish` 视为公开（含无密码要求）。
4. 评论状态直接对应 WP `comment_approved`。
5. Taxonomy 只认内置 `category`/`post_tag`，云端归一化与排序 bonus 均按这两个键。
6. 变更捕获依赖 WP hooks。
7. 调度依赖 WP-Cron（含 `DISABLE_WP_CRON` 检测）。
8. 对账直查 `$wpdb->posts` 的 `post_modified_gmt`。
9. URL 来自 `get_permalink`；修改时间取 `post_modified_gmt`。
10. 媒体模型是 WP attachment（`attachment_id`、`mime_type`、alt/caption/description）。
11. 管理动作要求 `manage_options` + nonce。
12. 文本清洗用 WP 函数（`strip_shortcodes`/`wp_strip_all_tags`）。

检索/契约侧：

13. 所有权契约字面量：`local_wordpress_host`、`cloud_addon`、`wordpress_write_owner`。
14. 多个 intent 元数据声明 `wordpress_local_only`；agent handoff 固定
    `handoff_owner=wordpress_local`。
15. 禁写字段名单全是 WP 语义（`wordpress_password`、`update_post` 等）。
16. `current_post_id` 排除与 `internal_links` 的 source_passages/锚点流程假设 WP
    块编辑器。
17. generation reference 模式绑定 WP 任务名（`title_generation` 等）。

要支持 Typecho/Ghost/Hexo/Astro/纯静态站，需要抽象的点：内容标识（数字 ID → 通用
slug/hash 主键，含唯一约束与 Zilliz 主键格式）、类型/状态枚举映射、taxonomy 泛化
（category/post_tag → 通用 tags/topics）、评论模型与审批态映射、媒体附件元数据模型、
变更捕获（hooks → webhook/构建钩子/文件 diff/全量扫描；静态站只能 rebuild 或
爬取式）、调度器抽象（WP-Cron → 平台定时器或云端拉取）、permalink 生成规则、
管理权限模型。

既有规划：`docs/refactor-master-plan-v1.md` 规定 P5 之后先做**薄 Typecho 适配器 PoC**
（标题/摘要/选中改写），复用云主路径，不建 Typecho runtime 或 ability registry；
Typecho/Z-BlogPHP/Ghost 适配器整体延后。`docs/multi-platform-connector-boundary-v1.md`
是连接器层的现行边界。

## 6. 现状缺口（代码/文档自认）

- 明示延后：DashVector 后端迁移、重型 ontology/知识图谱、新编排中间件
  （`docs/site-knowledge-anti-hallucination-roadmap-v1.md`）；Meilisearch 词面引擎
  受严格准入门约束（`docs/site-knowledge-search-architecture-standard-v1.md`）；
  检索质量阶段 5（RRF/cross-encoder/LTR/换模型）"暂不启动"
  （`history/engineering/2026/site-knowledge-recommendation-history-synthesis-2026-08-26.md`）。
- 评论摄取是休眠能力：云端 `comments[]` 契约齐全，但
  `site_knowledge_comments_enabled` 默认 False（`app/core/config.py`），且 Addon
  从不上传评论体。
- 质量证据未闭环：阶段 3（≥20 次真实 impression + 5–10 条人工行为复核）与阶段 4
  （30 条人工金标、P@5/R@5）均标"待办"。
- 覆盖率为占位：`post_type_coverage`/`source_type_coverage` 恒为 1.0，
  `has_stale_content` 硬编码 False；文档承认这是"MVP Cloud-seen coverage"。
- 观测三表无保留策略。
- 有界丢失面：本地 buffer 超 500 丢弃（记 `dropped_count`）；手动全量上限 10000 篇；
  单 run / 单站点超限即 `stage=limited` 跳过。
- 两仓 site-knowledge 代码内无 TODO/FIXME；缺口全部以文档"停止线/待办"形式管理。

## 7. 与战略定位的关系

战略定位 v1 把数据互联层定为长期壁垒，Site Knowledge 是该层的核心资产。本盘点
指向的直接阻塞项：

1. **内容源抽象**（第 5 节清单）是多平台愿景的硬前提，宜与公共内容 API 同期设计；
2. **采纳反馈接入**：检索质量证据（阶段 3/4）与 agent_feedback 尚未连通，采纳率
   数据是数据互联层的第一批真实数据；
3. **静态站摄取路径**为零（无 hooks/Cron 可依赖），需要 rebuild/爬取式契约；
4. 休眠能力（评论摄取）与占位覆盖率在扩展平台前应显式决策开启或删除。

## 参考来源

- Cloud：`app/domain/site_knowledge/`（全部文件）、`app/core/models.py`、
  `app/core/config.py`、`app/domain/wordpress_ai_connector/runtime.py`、
  `docs/site-knowledge-runtime-contract-v1.md`、
  `docs/site-knowledge-search-architecture-standard-v1.md`、
  `docs/site-knowledge-anti-hallucination-roadmap-v1.md`、
  `history/engineering/2026/site-knowledge-recommendation-history-synthesis-2026-08-26.md`、
  `docs/refactor-master-plan-v1.md`、`docs/multi-platform-connector-boundary-v1.md`
- Addon：`includes/class-cloud-site-knowledge-*.php`、
  `docs/site-knowledge-vector-operations.md`、
  `docs/site-knowledge-full-index-delivery.md`

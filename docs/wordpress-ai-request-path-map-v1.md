# WordPress AI 请求链路地图（含代码位置）

Status: active reference map.

本文只做一件事：把「用户在编辑器点一下 AI 按钮，到结果回来、采用行为再回流」这条跨仓库链路
画成一张可对照代码位置的地图。

权威边界与所有权定义不在本文，而在
[WordPress AI 入口到反馈闭环](current-wordpress-ai-entry-to-feedback-flow-v1.md)；
运行时证据一律以实际运行记录为准，本文不构成验收结论，也不替代该文档的历史核对记录。

## 一句话总览

编辑器里的 AI 按钮由**官方 AI 插件**提供；Npcink Cloud Addon 不改它的界面，而是把自己
注册成该插件的**一个 AI Provider**，请求因此落到 Npcink AI Cloud 执行，结果原路返回编辑器展示，
用户的采用行为再作为元数据回流 Cloud。

```text
WordPress 编辑器（官方 AI 插件 ai/ai.php 在标题旁画按钮）
        ↓  官方插件经 wpai_* 过滤器选中 Cloud provider
Npcink Cloud Addon（连接 / 授权 / 任务投影 / 实现官方 SDK 的 Provider 接口）
        ↓  POST /v1/runtime/execute
Npcink AI Cloud（画像 → 路由 → Provider 执行 → Run 记录）
        ↓  返回建议
WordPress（官方插件展示建议对话框 → 人工修改 → 保存 / 发布）
        ↓  采用与质量事件
Npcink AI Cloud（/v1/agent-feedback/* 接收证据）
```

## 分步时序

### ① 用户点「重新生成」

- 按钮由**官方 AI 插件** `ai/ai.php` 画在标题附近，不是 Addon 画的。
- 该插件的设置页是 `options-general.php?page=ai-wp-admin`；
  `ai-wp-admin` 是**页面 slug**，不是插件名。
- AI 入口按使用场景出现，没有固定的全局 AI 面板。

### ② 官方插件询问「用哪个 AI Provider」

Addon 通过 WordPress 过滤器回答，代码在
`npcink-cloud-addon/includes/class-cloud-wordpress-ai-connector.php`：

| 过滤器 | 作用 |
| --- | --- |
| `wpai_has_ai_credentials` | 声明 Cloud 侧有可用凭据 |
| `wpai_preferred_text_models` | 文本任务用哪些模型 |
| `wpai_preferred_vision_models` | 视觉任务 |
| `wpai_preferred_image_models` | 图片任务 |
| `wpai_generated_image_filename` | 生成图片的文件名 |
| `wpai_feature_ai` / `wpai_features_enabled` | 功能开关 |

效果：**Cloud 成为官方插件可选的 Provider 之一**，官方插件的请求落点因此改变。

### ③ Addon 实现官方 SDK 的 Provider 接口

同一文件里：

- `generateTextResult( array $prompt )` — 文本结果
- `generateImageResult( array $prompt )` — 图片结果

这两个方法是官方 AI Client SDK 的 Provider 契约，Addon 在里面转调 Cloud。

### ④ Addon 调 Cloud

`npcink-cloud-addon/includes/class-cloud-runtime-client.php` 的
`execute_runtime( $payload, $trace_id, $idempotency_key )` → **`POST /v1/runtime/execute`**。

payload 里带 `profile_id`（决定走哪个画像）、`trace_id` 和幂等键。

### ⑤ Cloud 认证与契约校验

`app/api/routes/runtime.py` 的 `POST /execute`（第 717 行）：

- `authorize_public_request(require_idempotency=True, required_scope="runtime:execute")`
- 校验 `payload.site_id` 与认证站点一致，不一致返回 `auth.site_mismatch`

### ⑥ 按请求类型分派

`app/domain/runtime/service.py` 的 `RuntimeService.execute()`（第 428 行）先做类型分派。
WordPress AI 请求走这一支：

```python
if self._is_wordpress_ai_connector_request(request):
    connector_envelope = self.contract_validator.validate_connector_runtime_contract(request)
    request.input_payload = connector_envelope
```

### ⑦ 路由解析（画像在这里生效）

```python
resolution = self.routing_service.resolve(
    profile_id=request.profile_id,
    execution_kind=request.execution_kind,
)
```

画像 ID 定义在 `app/domain/wordpress_ai_connector/routing_profiles.py`：

| 画像 ID | 用途 |
| --- | --- |
| `wp-ai.short-text` | **标题改写走这个** |
| `wp-ai.editorial` | 正文编辑 |
| `wp-ai.classification` | 分类与判定 |
| `wp-ai.image-generation` | 图片生成 |
| `wp-ai.audio-generation` | 音频生成 |

候选结构是 `RoutingCandidate`（`app/domain/routing/models.py`），字段含
`provider_id`、`model_id`、`instance_id`、`region`、`weight`、`health_status`、`context_window` 与各项价格。

### ⑧ 创建 Run

同一方法里：`build_request_fingerprint()` 生成幂等指纹，`run_id` 形如 `run_<uuid>`，
再由 `run_lifecycle_service` 落库，初始状态 `queued`。
实现见 `app/domain/runtime/run_lifecycle.py` 与 `run_records` 表。

### ⑨ Provider 执行

`app/domain/runtime/provider_execution.py` 的 `execute_candidate_chain()` 按候选链依次尝试，
每次尝试写一条 `ProviderCallRecord`；`enforce_context_budget()` 管住上下文长度。
外部服务接入在 `app/adapters/providers/`（openai / anthropic / openrouter / siliconflow / vllm / tei / minimax / litellm）。

### ⑩ 站点背景注入（适用时）

`app/domain/wordpress_ai_connector/runtime.py` 的 `apply_site_knowledge_reference()`
会写 `generation_context_status=applied`、`references_applied` 与参考数量到 provider input metadata；
失败分支也写明确原因。

### ⑪ Run 收尾

`succeed_run()` / `fail_run()` / `cancel_run_durably()` 把状态落为
`succeeded` / `failed` / `canceled`。完整状态流转：`queued → running → succeeded / failed / canceled`。

### ⑫ 结果返回并展示

Cloud 返回 → Addon → 官方插件弹出建议对话框（可编辑文本框 + 重新生成 + 插入）。
用户在编辑器里人工修改或直接插入。

### ⑬ 采用与质量事件回流

- Addon `includes/class-cloud-editor-assist-quality.php` 在生成时记录**文章 ID + 结果哈希**；
- 保存时由 `wp_after_insert_post` 按同一文章 ID 匹配：精确匹配记为 `saved_exact_output`，
  未匹配只记为 `saved_after_generation_unmatched`——**后者不等于「修改后采用」**；
- 事件上传到 `/v1/agent-feedback/events` 与 `/v1/customer-journey/events`。

## Addon 调用的 Cloud 端点

| 端点 | 用途 |
| --- | --- |
| `POST /v1/runtime/execute` | 核心执行入口 |
| `GET /v1/runs/{id}` | 查询运行 |
| `GET /v1/entitlements/current` | 当前权益 |
| `/v1/runtime/media/uploads`、`/v1/runtime/media/artifacts/*`、`/v1/runtime/media/jobs` | 媒体上传与任务 |
| `/v1/observability/plugin-summary`、`/v1/observability/plugin-events` | 插件观测 |
| `/v1/customer-journey/summary`、`/v1/customer-journey/events` | 用户旅程 |
| `/v1/agent-feedback/summary`、`/v1/agent-feedback/events` | 采用与质量反馈 |
| `/v1/runs/nightly-inspection/recent` | 夜间巡检 |

## 边界：谁说了算

- **WordPress 保留**：建议预览、人工修改、审批与预检、最终写入、发布。
- **Cloud 负责**：Provider 执行、运行状态、用量与权益证据、诊断证据、只读元数据投影。
- **Cloud 不是**：第二控制面、能力注册表、工作流注册表、提示词真值、审批系统、WordPress 写入方。

## 已知未完成项

- 站点背景注入的**公开结果投影**曾缺少 generation-context 字段，因此出现过
  「向量调用确实发生」但「公开结果无法证明注入」的并存事实；补只读证据投影是既定最小改动方向。
- 标题任务的端到端证据链已有记录，但**不扩大**为所有 AI 任务、所有页面或生产版本均已通过。

以上两点的完整核对过程、日期与证据状态保留在
[WordPress AI 入口到反馈闭环](current-wordpress-ai-entry-to-feedback-flow-v1.md)。

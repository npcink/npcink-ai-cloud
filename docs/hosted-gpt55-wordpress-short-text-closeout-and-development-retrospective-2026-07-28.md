# Hosted GPT-5.5 WordPress Short Text 闭环收口与开发复盘 — 2026-07-28

Status: historical milestone evidence; not current Provider, M4, or production authority.

状态：目标闭环已完成；PR `#325` 已合并；对应 `master` revision
`318c2c4bdfa28a6f8d329795e6d9003efeb96b4f` 已完成 M4 accepted promotion。

范围：真实 Local WordPress 编辑器中的 Short text / title generation，从
WordPress Ability 经 Npcink Cloud Addon 和 Npcink AI Cloud 调用 Hosted
GPT-5.5，再回到用户审阅、插入和显式保存的完整路径。

本文是里程碑事实记录和开发方法复盘，不替代：

- [Cloud Content Generation Boundary v1](cloud-content-generation-boundary-v1.md)；
- [Development and Validation Operating Model v1](development-validation-operating-model-v1.md)；
- [M4 Preview AI Development Standard v1](m4-preview-ai-development-standard-v1.md)；
- WordPress Ability 自有 schema、prompt、workflow 和写入规则。

本文不批准 production 发布，也不把 M4 accepted 描述为 production、
GA 或外部真实客户验收。

## 1. 主目标与验收定义

本阶段只选择一个最小高频场景：WordPress 编辑器中的 Short text 标题生成。

目标链路是：

```text
真实 WordPress 编辑入口
  -> WordPress Ability
  -> npcink-cloud-addon
  -> npcink-ai-cloud
  -> Hosted GPT-5.5
  -> Ability-owned schema 语义验证
  -> 用户审阅
  -> 插入
  -> WordPress 显式保存
  -> provider / usage / error 证据
```

验收不能只依赖以下任一条件：

- HTTP `200`；
- 可解析 JSON；
- Cloud liveness；
- 模型目录中存在 `gpt-5.5`；
- Provider 连接显示“就绪”；
- 单元测试或 CI 绿色；
- 未合并 worktree 在 M4 上运行成功。

完整验收至少需要同时证明：

1. 实际挂载的 WordPress 插件代码被执行；
2. WordPress AI 连接器已验证且启用；
3. Short text 真实调用命中 Hosted GPT-5.5；
4. 返回结果满足 Ability 自有字段语义，而不只是 JSON 可解析；
5. 建议先进入用户审阅面，Cloud 不直接写 WordPress；
6. 审阅和插入阶段没有提前保存；
7. 用户侧显式保存只发生一次；
8. Provider、模型、instance、latency、tokens、fallback 和 error 有最小账本证据；
9. 一次性内容和临时登录会话被清理；
10. M4 candidate、PR、merged、M4 accepted 和 production 状态被分开报告。

## 2. 固定所有权边界

本阶段没有改变既有架构边界。

| 层 | 拥有的事实 |
| --- | --- |
| WordPress AI / Ability | Ability 名称、输入输出 schema、编辑入口和审阅语义 |
| Npcink Cloud Addon | 已验证连接、本地授权、Ability 投影、签名传输和结果桥接 |
| Npcink AI Cloud | 托管执行、Provider 适配、运行路由和 usage/error/provider 证据 |
| WordPress 编辑器 | 建议审阅、插入、dirty state 和最终显式保存 |
| GitHub `master` | 已审查和已合并的开发源码真值 |
| M4 | 候选与已接受开发运行证据 |
| Production | 单独审批、单独部署和单独验证 |

明确非目标：

- 不增加 Admin 页面或宽泛仪表盘；
- 不增加第二套 Ability、workflow 或 route registry；
- 不让 Cloud 成为 WordPress 写入控制面；
- 不自动修改 prompt、WordPress 内容或生产模型配置；
- 不把 Provider 测试、目录同步或 liveness 当成用户闭环；
- 不因为 M4 accepted 就声明 production 或 GA。

## 3. 真实运行面调查

### 3.1 先解析实际 WordPress 挂载

Local WordPress 实际插件路径是：

```text
/Users/muze/Local Sites/magick-ai/app/public/wp-content/plugins/npcink-cloud-addon
  -> /Users/muze/gitee/npcink-cloud-addon-local-suggest-reply
```

这一步先于任何插件诊断。终端当前目录、默认仓库或历史 worktree 都不能替代
WordPress 实际 symlink 解析。

### 3.2 凭据并未缺失

早期把 Provider import dry-run 的 `planned_count=0` 解释成“M4 没有可导入的
OpenAI/MQZJ 凭据”，这个判断是错误的。

数据库只读证据表明：

- `mqzj` Provider connection 已启用；
- 状态为 ready；
- credential 已配置；
- Provider 连接测试能够通过；
- 模型目录包含 `gpt-5.5`；
- `openai-global-gpt-5-5` instance 健康且可用于托管运行；
- 历史 `wp-ai.short-text` 调用曾成功使用 `openai/gpt-5.5`。

`planned_count=0` 的正确含义只是：没有 legacy 环境变量配置需要导入。它不
表示数据库没有 Provider connection，也不表示加密凭据不可用。

### 3.3 真正的初始偏差是运行配置和本地授权

调查时发现：

- `wp-ai.short-text` 一度指向 M4 Ollama；
- WordPress Addon 已验证，但本地
  `wordpress_ai_connector_enabled` 为 false；
- 因此 Cloud 健康、模型可见和凭据存在仍不足以形成真实编辑器闭环。

在已授权的运维操作中：

1. 执行 mqzj 连接测试；
2. 现有 catalog reconciliation 更新了 WordPress managed profile 候选链；
3. Short text 主候选恢复为 `openai-global-gpt-5-5`；
4. WordPress 侧只启用已有的“WordPress AI 连接器”本地授权；
5. 其他 WordPress 本地授权没有随意开启。

需要特别记录：Provider“测试”不是纯 liveness。在当前实现中，它可能触发
模型目录拉取和 managed profile reconciliation。后续执行前必须记录目标
profile 的候选链和 revision，执行后核对差异，不能把“测试”默认当作无副作用
读操作。

## 4. 失败链与根因

真实浏览器验收没有一次直接变绿，而是连续暴露了三个不同层级的问题。

### 4.1 前置检查失败：Connector 未启用

第一次浏览器 preflight 通过了：

- Local 环境检查；
- WordPress origin 检查；
- WordPress AI `1.2.0` 激活检查；
- Addon 加载和验证检查。

但失败于：

```text
Verified Cloud Addon connector is enabled for WordPress AI.
```

只读设置检查进一步确认：

```text
verified=true
connector_enabled=false
wordpress_ai_connector_enabled=false
```

修复是通过真实 WordPress Admin 本地授权开关启用连接器，而不是写数据库、
伪造 connector marker 或让 Cloud 反向控制 WordPress 设置。

### 4.2 第一轮真实 GPT-5.5 失败：Responses API 格式形状错误

启用连接器后，真实标题请求到达 Hosted GPT-5.5，但 Provider 返回：

```text
Missing required parameter: '***.***.name'
```

Cloud provider call ledger 记录：

```text
profile=wp-ai.short-text
provider=openai
model=gpt-5.5
instance=openai-global-gpt-5-5
status=failed
error=provider.invalid_request
tokens_in=0
tokens_out=0
```

根因是 Cloud 将 Chat Completions 的结构：

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "wordpress_title_generation_output",
    "schema": {}
  }
}
```

原样放入 Responses API 的 `text.format`。Responses API 需要：

```json
{
  "type": "json_schema",
  "name": "wordpress_title_generation_output",
  "schema": {}
}
```

因此修复首先发生在 Provider adapter 边界：Chat Completions envelope 保持
原形用于 chat endpoint；Responses endpoint 将嵌套配置转换成原生
`text.format`。

### 4.3 第二轮真实 GPT-5.5 失败：Provider strict schema 子集

第一处修复部署为 M4 candidate 后，错误向前推进为：

```text
Invalid schema for response_format 'wordpress_title_generation_output':
'additionalProperties' is required to be supplied and to be false.
```

这证明 `name` 形状已经正确，但官方 WordPress title Ability schema：

```json
{
  "type": "object",
  "properties": {
    "title": {
      "type": "string"
    }
  }
}
```

并不直接满足 Provider strict structured-output 子集。不能为通过 Provider
校验而改写 WordPress Ability 的所有权真值，也不能退回只检查“可解析 JSON”。

最终采用双层但不重复所有权的方式：

1. 原始 Ability schema 原样保存在 runtime metadata；
2. Cloud 只为 Provider wire format 构造严格兼容副本：
   - `type=object`；
   - 只暴露 `title:string`；
   - `required=["title"]`；
   - `additionalProperties=false`；
   - `strict=true`；
3. Provider 返回后，Cloud 仍按原始 Ability 的 `title:string` 语义提取；
4. 缺少 `title`、错误字段或错误类型即 fail closed；
5. WordPress 最终只接收干净的 suggestion result。

这不是第二套 Ability schema。Provider 副本是传输适配，Ability schema 仍是
语义权威。

## 5. 实现与测试

PR `#325` 修改四个文件：

```text
app/adapters/providers/openai.py
app/domain/wordpress_ai_connector/runtime.py
tests/domain/test_openai_provider.py
tests/api/test_wordpress_ai_connector_runtime.py
```

实现内容：

- 将 nested `json_schema` 转换为 Responses 原生 `text.format`；
- 固定转换后的 `type=json_schema`，不允许嵌套输入覆盖；
- 为 title generation 构造严格 Provider schema 副本；
- 保留原始 Ability schema；
- 保持现有语义提取和错误 JSON fail-closed；
- 不增加依赖、迁移、接口、Admin UI 或新控制面。

本地聚焦验证：

```text
OpenAI Provider tests: 42 passed
WordPress connector runtime tests: 177 passed
Focused regression selection: 3 passed
Ruff on changed files: passed
git diff --check: passed
```

M4 candidate 验证：

```text
OpenAI Provider tests: 42 passed
WordPress connector runtime tests: 177 passed
```

GitHub PR 验证：

```text
PR body contract: passed
Secret scan: passed
Python dependency audit: passed
Frontend: passed
CodeQL Python: passed
CodeQL JavaScript/TypeScript: passed
backend-targeted: passed
CI observability: passed
```

PR `#325` 最终 squash merge：

```text
merge revision=318c2c4bdfa28a6f8d329795e6d9003efeb96b4f
```

## 6. 真实 WordPress 浏览器闭环

最终验收使用：

```text
site=https://magick-ai.local
environment=local
WordPress=7.1-beta3-62861
WordPress AI=1.2.0
Cloud Addon=0.1.3
execution_mode=configured_cloud_provider
fake_provider=false
```

浏览器行为证据：

- 创建一次性 draft；
- 使用短期 WordPress 登录会话；
- 锁定 autosave，防止审阅前写入；
- 从真实标题控件触发 Ability；
- 标题建议出现在审阅弹窗；
- 用户侧 Insert 后只进入 dirty editor state；
- 标题、摘要和 selected-block rewrite 在保存前均未写数据库；
- 正常 Save/Update 产生一次 WordPress REST 写入；
- 保存后 draft 状态保持；
- revision 增量为 `1`；
- 保存结果与审阅结果一致；
- 非目标段落保持不变；
- 临时登录会话销毁；
- 一次性 draft 强制删除。

机器摘要中的关键结果：

```text
title-generation response=200
summarization response=200
content-resizing response=200
pre_save_post_writes=0
explicit_save_writes=1
revision_delta=1
title outcome=inserted_then_saved
fixture deleted=true
auth session destroyed=true
fake provider enabled=false
```

这里的三个 `200` 只是链路证据的一部分。真正的验收是：

- 标题 JSON 先通过 Provider strict schema；
- Cloud 再按 Ability-owned `title:string` 语义提取；
- WordPress 显示审阅面；
- 插入不等于保存；
- 用户侧显式保存后持久化；
- Provider 账本与 WordPress 写入证据能够对应。

## 7. 最小 Provider / Usage / Error 证据

M4 accepted revision 上的最终 Short text 调用：

```text
profile=wp-ai.short-text
status=succeeded
provider=openai
model=gpt-5.5
instance=openai-global-gpt-5-5
latency_ms=3548
tokens_in=975
tokens_out=21
fallback_used=false
error_code=""
```

同一轮中，Editorial summary 和 rewrite 也成功使用 GPT-5.5，但本里程碑的
最小验收对象仍是 Short text。不能因为同一浏览器 smoke 覆盖了多个编辑能力，
就把阶段范围扩张为所有文本能力的产品验收。

## 8. Evidence state 收口

| 状态 | 本阶段结论 |
| --- | --- |
| Local verified | 真实 Local WordPress 浏览器闭环通过；Fake Provider 未启用 |
| M4 candidate | 未合并 worktree 在 M4 上通过聚焦测试和真实浏览器闭环 |
| PR verified | PR `#325` required checks 全部通过 |
| Merged | PR `#325` 已合并到 `master` |
| M4 accepted | 干净 `master=318c2c4b...` 经 `m4:preview:promote -- --pr 325` 接受，并重跑真实浏览器 smoke |
| Production | 未变更、未部署、未验证 |

记录的 M4 accepted 状态：

```text
acceptance_state=accepted
promotion_pr=325
source_revision=318c2c4bdfa28a6f8d329795e6d9003efeb96b4f
source_branch=master
source_dirty=false
alembic_revision=20260728_0075 (head)
```

这是 PR `#325` 对应 revision 的里程碑证据。后续 `master` 前进时必须重新
判断是否需要 promotion，不能把旧 accepted revision 自动投射到新源码。

## 9. 主要开发经验

### 9.1 先查真实挂载，再查源码

WordPress 的 plugin symlink/worktree 是运行真相。没有解析挂载就开始修代码，
很容易在正确仓库的错误 checkout 中得到“测试通过但页面不变”的假象。

固定顺序：

```text
resolve plugin symlink
  -> inspect mounted worktree status
  -> inspect connector settings
  -> inspect Cloud endpoint
  -> inspect routing/provider evidence
```

### 9.2 “没有可导入配置”不等于“没有凭据”

import tool、数据库 registry、环境变量和运行时实例是不同事实源。任何
“没有凭据”结论都应至少核对：

- connection 记录；
- credential configured 标志；
- connection status；
- last tested / synced；
- catalog model；
- catalog instance；
- routing binding；
- 最近 Provider 调用。

始终只读安全字段，不输出 secret ciphertext、API key 或完整敏感 config。

### 9.3 OpenAI Compatible 不是单一 wire contract

“OpenAI compatible”只能说明大方向兼容，不能假设：

- Chat Completions 与 Responses schema 形状相同；
- 所有 Provider 支持相同 structured-output 子集；
- 相同模型目录条目意味着相同 endpoint 行为；
- 一个连接测试能够覆盖真实生成请求。

Provider adapter 必须按 endpoint variant 测试 payload，而不是只按 Provider
名称分支。

### 9.4 Ability schema 与 Provider schema 可以分层，但不能争夺所有权

正确分层是：

```text
Ability schema = product and semantic truth
Provider schema copy = endpoint compatibility artifact
Cloud semantic extraction = fail-closed enforcement
WordPress review = adoption decision
WordPress save = final write truth
```

Provider schema 可以更严格、字段更窄，但不能替代、回写或重新注册 Ability。

### 9.5 错误向前推进是有价值的证据

本阶段的错误从：

```text
connector disabled
  -> missing json_schema.name
  -> additionalProperties required
  -> successful strict structured output
```

逐层前进。每次只修复当前最窄根因，并用相同真实入口重放。这样可以证明：

- 请求确实跨过了上一层；
- 新错误不是旧错误的包装；
- 最终成功不是因为切回 Fake Provider、Ollama 或 json_object。

### 9.6 Provider 测试可能是配置 mutation

测试按钮可能同时完成：

- 凭据验证；
- 模型目录拉取；
- instance 更新；
- managed routing reconciliation。

因此操作前后必须记录：

```text
profile_id
candidate_instance_ids
revision
updated_at
```

UI 应把此类副作用作为操作合同理解，开发人员也不能把它当成只读 probe。

### 9.7 审阅、插入和保存是三个状态

对 suggestion-only AI：

- 生成成功不等于采用；
- Insert/Accept 不等于保存；
- 保存不等于发布；
- 临时 draft 保存不等于生产内容变更。

浏览器测试应锁定 autosave，分别记录：

```text
generation returned
review visible
insert/accept changed editor
pre-save writes
explicit save writes
revision delta
cleanup
```

### 9.8 M4 candidate 与 accepted 必须分开

直接 `sync` 证明候选 worktree 能运行，不证明：

- 已提交；
- 已 review；
- 已合并；
- 当前 `master` 已部署；
- production 已更新。

可靠顺序是：

```text
focused local gate
  -> M4 candidate
  -> real consumer smoke
  -> exact staging and commit
  -> protected PR checks
  -> merge
  -> clean current master
  -> M4 promotion
  -> relevant smoke
```

### 9.9 健康检查只能证明健康检查

`/health/live=200` 对确认进程存活有价值，但不能证明：

- Provider 凭据可用；
- GPT-5.5 可生成；
- structured output 正确；
- Ability 语义验证通过；
- 用户看到了建议；
- WordPress 正确保存。

验收证据必须来自报告问题的真实 consumer。

## 10. 做得好的地方

- 在脏主工作区之外使用独立 worktree；
- 先调查 DB、catalog、routing 和实际插件挂载；
- 没有输出或持久化凭据；
- 没有用 Fake Provider 替代最终验收；
- 每次失败均保持 WordPress pre-save writes 为 `0`；
- 失败草稿和临时会话均自动清理；
- 修复集中在 Provider shape 和 WordPress connector title schema seam；
- 保留原始 Ability schema 和 WordPress 写入所有权；
- 先跑聚焦测试，再使用 M4 真实运行面；
- PR 使用标准模板、受保护 checks 和 squash auto-merge；
- 合并后从干净 current master 完成 promotion；
- 最终明确报告 production 未变更。

## 11. 应改进的地方

| 问题 | 根因 | 改进 |
| --- | --- | --- |
| 早期误称 M4 没有 OpenAI/MQZJ 凭据 | 把 import dry-run 当成数据库 credential truth | 先核对 connection、catalog、instance、binding 和历史调用 |
| 初始计划低估 Provider 测试副作用 | 把“测试”理解成纯 probe | 操作前后记录 managed profile candidate/revision |
| 第一轮单测认可了错误 Responses payload | 测试固化了实现形状，没有对照 endpoint contract | Provider 测试必须按 endpoint variant 断言最终 wire payload |
| 只在真实调用时发现 strict schema 子集 | Ability schema 与 Provider schema 兼容性未进入 corpus | 为每个 structured-output endpoint 增加真实兼容形状测试 |
| 第一次浏览器运行前 Connector 未启用 | 已验证与已授权被混为同一状态 | preflight 显式分别报告 loaded、verified、enabled |
| 失败 smoke 等待审阅弹窗超时后才结束 | 浏览器脚本只能从页面 notice 间接知道 Provider 失败 | 保留当前安全超时，同时在失败摘要中优先输出 Ability response 和清洗后的 error code |

## 12. 推荐的下一次开发方法

### 12.1 调查阶段

1. `git status --short --branch`，保护用户脏工作；
2. 解析 Local WordPress 实际插件 symlink；
3. 读取 Ability schema 和 Addon 投影；
4. 只读核对 Provider connection、catalog instance 和 routing binding；
5. 核对最近成功和失败调用，不读取 secret；
6. 写出一个场景、一个 profile、一个成功标准。

### 12.2 实现阶段

1. 从最新 `origin/master` 创建独立 `codex/*` worktree；
2. 先添加能捕获真实 Provider wire shape 的测试；
3. 只在 endpoint adapter 做兼容转换；
4. Ability schema 保持原样；
5. Cloud result 继续语义 fail closed；
6. 不改 prompt、router 或 WordPress 写入逻辑来绕过错误。

### 12.3 验证阶段

```text
focused provider test
  -> focused connector semantic test
  -> M4 candidate sync
  -> same focused tests on M4
  -> Local WordPress disposable browser smoke
  -> provider ledger correlation
```

浏览器 smoke 必须报告：

- Fake Provider 是否关闭；
- pre-save write count；
- explicit save count；
- review screenshot；
- saved screenshot；
- fixture cleanup；
- Provider instance、tokens、latency、fallback 和 error。

### 12.4 交付阶段

1. 精确暂存当前模块文件；
2. 检查 cached stat 和 name-only；
3. 提交独立 commit；
4. 使用标准 PR 模板；
5. 等 required checks；
6. 确认 merge revision；
7. 从干净、当前 `origin/master` promotion；
8. 运行相关 smoke；
9. 分层报告 Local、M4 candidate、PR、merged、M4 accepted、production。

## 13. 后续建议

### 已完成，不应重复建设

- 不需要新增 Short text Admin 页面；
- 不需要第二套 Ability registry；
- 不需要 Cloud prompt editor；
- 不需要新的 WordPress 写入 API；
- 不需要再用 Fake Provider 证明同一主目标；
- 不需要因本闭环成功立即扩张到全部能力。

### 可以按证据推进

1. 保留现有真实浏览器 smoke 作为 Short text 发布回归；
2. 将 endpoint-specific structured-output payload 纳入 Provider compatibility
   corpus；
3. 对 Provider test 的目录同步和 routing reconciliation 建立明确操作说明；
4. 只在出现真实用户需求时扩展下一项能力；
5. production 验证必须另行审批，并重新收集相同层级的真实 consumer 证据。

## 14. 最终结论

本阶段已经证明：真实 Local WordPress 用户可以从官方编辑器入口调用
WordPress Ability，经 Npcink Cloud Addon 和 Npcink AI Cloud 使用 Hosted
GPT-5.5 生成符合 Ability 字段语义的标题建议，在 WordPress 中审阅和插入，
并由 WordPress 完成一次显式保存，同时留下最小 Provider、usage 和 error
证据。

这个结论的边界是：

```text
Local WordPress verified
PR #325 verified and merged
revision 318c2c4b... accepted on M4
production not changed
GA not claimed
```

真正可复用的成果不是一次 `200`，而是一条可审计、可重放、保持所有权边界
且能区分建议与写入的真实用户链路。

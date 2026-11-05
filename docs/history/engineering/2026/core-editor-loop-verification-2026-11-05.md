# 核心编辑链路开发核验（2026-11-05）

状态：第 2 项定向开发核验完成，未改变应用源码。真实模型成功路径与隔离故障恢复分别通过；不是生产、人工采用、质量改善或自然使用验收，不能据此勾完链路清单六条 Done。

## 范围与版本

本批只检查官方 WordPress AI 的标题、摘要和完整选中段落改写：连接 → 生成 → 审阅 → 采用 → 显式保存，并核对失败恢复、取消、重复操作与积分证据。Cloud 不取得 WordPress 提示词、采用或最终写入权。

| 层 | 实际版本和限制 |
| --- | --- |
| Cloud 本地源码 | `4faceef70aef20e810761ba85567590bc51e42ba`，核验开始时为干净的最新 master；后续本批仅修改文档 |
| M4 | `/health/live` 为 development、`source_revision=1b0e8f90fcb2`、`source_dirty=false`；沿用已接受应用版本，本批不部署或提升 M4 |
| WordPress | Local `magick-ai`，WordPress 7.1.4、WordPress AI 1.4.0、Addon 0.4.4 |
| Addon 挂载源码 | `cc8f6d2a7227ce968b528933a2f2f14fcf2e5e8d` 加其他任务的 29 项未提交改动；按实际挂载组合验证，不能写成干净已合并组合 |
| Toolbox | `a42652c732b6524cdc6a81aee8d9f7fa9066d6c9`，干净；官方文字请求不经过 Toolbox runtime，复用其跨仓质量矩阵 |
| Toolkit / Adapter / Core | 分别为 `95d59864214aec867b6dae3220d20c35c1a8455f`（其他任务的两项界面改动）、`11b7991869541d573bf80b8671156c1a4afbd92a`、`37705d59bd91b9056652f120d56cdae90c122046`（落后其 origin/master 一项） |

私有原始证据位于本机 `~/.codex/task-receipts/npcink-ai-cloud/2026-11-05-core-editor-loop/`。公开文档只记录版本、合成测试的运行标识、结果和复现方法；不纳入凭据、Cookie、nonce、原始请求或正文。

## 结果

| 场景 | 执行与结果 | 证据边界 |
| --- | --- | --- |
| 连接 | 通用 readiness 通过；浏览器预检先拒绝 `snapshot_expired`，用既有签名权益读取刷新后通过 | 通用就绪不能替代浏览器的五分钟能力快照前置门；未伪造新鲜度 |
| 标题、摘要、改写 | 既有 Ollama 真实生成，三次 Ability 均 200；标题 Insert、摘要生成、段落原文/建议对照与 Accept 均可用 | 浏览器自动化采用，英文合成夹具；不是人工质量认可 |
| 显式保存 | 保存前文章/自动保存 REST 写入 0；保存草稿写入 1、revision 增量 1；标题、唯一摘要及目标段落数据库回读一致，其他三个哨兵段落未变 | 验收脚本锁定夹具 autosave 以隔离显式保存边界；未宣称普通编辑器绝不自动保存 |
| 失败、重试、重新生成 | 既有 Fake Provider 在 Addon 出站前返回一次合成 503；编辑器显示错误，重新点击后成功，Regenerate 可用，支持修改候选后再插入保存 | 不进入 Cloud 或真实 Provider，不形成实际扣费证明 |
| 超时恢复 | 私有脚本副本只把首次失败换为出站前 `WP_Error(http_request_failed)` / cURL 28；原断言保留，错误可见，重试、采用、保存通过 | 传输超时投影注入；没有制造真实 Provider 超时，也不证明超时后上游一定未执行 |
| 取消后重开 | 三类建议仅进入编辑器状态，放弃后重开，标题/摘要/改写恢复原数据库内容，写入 0 | 取消本地采用/保存；不是运行中强制终止 Cloud |
| 双窗口 | 两个窗口均能审阅标题；延迟、失败及恢复未提前写入同一草稿 | 隔离替身调用，不外推为真实 Provider 并发计费压测 |
| 重放与计费契约 | 23 项现有 runtime 事务、Provider 执行和生命周期测试通过；同一键重放复用 run、仅一次 Provider 调用/扣减；改变请求冲突、独立请求、重试证据和 queued/inline 取消边界受覆盖 | 本地确定性测试，未新造真实重复模型调用 |
| 超时/失败证据契约 | Provider dispatch / failure evidence 两文件 6 项通过 | 与上述 23 项分批；不是全后端通过 |
| 跨仓门禁 | 7 仓质量矩阵全部通过；Cloud gate 对准本工作树 `4faceef7` 的 exact-SHA GitHub CI | 挂载仓存在上述脏树与 Core 版本差异；矩阵不等于最新干净跨仓发布组合 |

复用 Addon `scripts/smoke-wordpress-ai-text-browser.mjs`，分别运行默认真实模式、`WP_AI_TEXT_FAKE_PROVIDER=1`、以及 Fake 模式的 `WP_AI_TEXT_SCENARIO=cancel-reload` / `concurrent-tabs`。指定 Local 的 `WP_PATH`、`WP_BASE_URL`、`WP_DB_SOCKET`、`WP_CLI_PHP`，并将截图与 summary 输出至私有目录。超时变体的源码哈希与最小差异保存在 `timeout-fixture-source.json` / `timeout-fixture.diff`；未改已挂载源码。

Cloud 定向命令：

```sh
python -m pytest tests/domain/test_runtime_provider_transactions.py tests/domain/test_runtime_provider_execution_characterization.py tests/domain/test_runtime_lifecycle_characterization.py -q
python -m pytest tests/domain/test_provider_dispatch_contract.py tests/domain/test_provider_failure_evidence.py -q
```

跨仓用 Toolbox 的 `composer quality:matrix` 与 `composer quality:matrix:run -- --repo-path=npcink-ai-cloud:<本次 Cloud 工作树>`。这两个命令不发布生产，不运行自然试用。

## 同请求对账

M4 原文字用途指向外部 Provider。本批取得共享 operation lock 后，临时创建无密钥的本地 Ollama 连接，限制 `wp-ai.short-text` / `wp-ai.editorial` 为本地 Qwen3.5 9B、零自动重试、无兜底。`embed.default` 原含外部候选，因此也临时限定为既有本地 8B embedding，避免 Site Knowledge 参考触发付费兜底。未下载模型或改变生产配置。

| 任务 | Cloud run_id | 本地调用数 | 输入 / 输出 token | 消耗 AI 积分 |
| --- | --- | ---: | ---: | ---: |
| 标题 | `run_7c09c92fbc404430b13f7ab64d86d40f` | 2 | 984 / 20 | 3 |
| 摘要 | `run_2fe23b3daf214b358915fd844dca3302` | 2 | 954 / 52 | 3 |
| 段落改写 | `run_ac3f276f3cff48f58039f085655e563f` | 1 | 438 / 35 | 2 |
| 合计 | 3 个成功运行 | 5 | 2376 / 107 | 8 |

五次包括三次文字生成与两次 embedding。Provider、usage 与积分按同一 `run_id` 关联；无 fallback、无自动 retry、无调用错误。积分消耗是执行事实，不能用“取消/未保存”推断免扣。两个模型缺价格，usage 的 `cost_estimate_mode=unpriced`；数据库数值 cost=0 不能解释为免费。三条运行均为 `result_only`，`input_json` 是空对象，不存输入正文。

生成到首个标题建议约 33.1 秒，仅为本地模型夹具的一次延迟，不是生产 SLA 或省时证据。

本地按站点密钥的对象/任务哈希定位到六条既有质量事件：3 条 presented、3 条 `saved_exact_output`。仅发送这六条至既有 `/v1/observability/plugin-events`，首次 accepted/stored/duplicate=6/6/0；换批次键重传为 6/0/6。数据库逐 run 回读恰有两条事件，均为 `omitted_metadata_only`，无 prompt、正文、输出、post_id、user_id 或密钥。自动化保存结果不计为自然人工采用。

## 恢复与证据索引

- 三个用途的候选、策略、revision 与更新时间恢复原值；临时连接、配置备份及共享操作锁已清除，没有重置其他候选或模型。
- 临时草稿 283107、283108、283110、283111、283112、283114 均确认不存在；已创建的临时登录 session 均销毁，无 fixture pending 或 Fake MU 插件残留。真实六条反馈成功后只从本地缓冲移除对应 event_id，保留无关记录；Cloud 的工程运行、用量与反馈事实保留。
- `magick-ai` 原本 running，结束仍 running；另两站原本 halted，结束仍 halted；原 Local cron 范围 guard 保留。未启动、停止其他站点。
- 六个挂载/Cloud 仓的 HEAD 和 tracked diff 哈希在核验前后完全一致；Addon/Toolkit 的他人改动未覆盖、暂存或清理。
- `real.json` / `real.log`：真实成功与写入边界；`fake.json`、`timeout.json`、`cancel-reload.json`、`concurrent-tabs.json`：分层恢复证据；`real/wordpress-ai-text-review.png` 与 `real/wordpress-ai-text-saved.png`：已查看的 PC 审阅和保存截图。
- `reconcile.py.receipt`、`storage-cost.py.receipt`、`feedback.log`、`feedback-db.py.receipt`：运行/积分/费用与反馈；`real-loop.log`、`cleanup.json`、`source-preservation.json`：恢复与精确清理；`quality-matrix-gates.log`：7 仓门禁。

## 处置与后续

本批未发现需修改应用源码的阻塞缺陷，不新增 UI、运行控制或指标平台。后续复用现有脚本；先检查能力快照和当前候选，避免把预检阻断误报为生成故障。真实 Provider 失败、传输超时、浏览器取消及幂等重放必须注明所测层，不能互相替代。

关闭 review 或放弃未保存编辑只决定本地采用；inline 的公开 Cloud cancel 不受支持，queued cancel 与 inline/terminal 拒绝已有契约覆盖。用户重新生成是独立执行，可能新增 run 和积分；同一请求重传才适用幂等去重。恢复时先核对运行状态，不能把“没保存”当作“没执行”。

仍未完成第 3 项真实任务质量修复及第 4 项三人 Free 自然观察。历史中文改写把“好像无法保存”写成确定失败的问题保留至第 3 项；本批不能证明事实/不确定性普遍保留。生产、真实 Provider 故障演练、运行中强取消、十次自然使用、非作者理解与省时/复用/成本承受能力均未因此获验收。

本批交付物仅为开发证据和文档；本地、GitHub CI、M4 既有接受版本、文档合并、生产与人工验收分别报告，文档合并不要求重新部署相同应用。

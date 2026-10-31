# 搜索与图片、站点向量第二批修复交付 · 2026-10-31

状态：2026-11-01 完成本地门禁，builder local-ready；审查、整合、CI、M4 与人工验收由 integrator 分别记录，不能将本记录视为生产验收。

## Scope 与边界

派单会话 `01a190f3-ab78-7763-bad1-79cc8fd7a72d`；执行会话 `01a1929f-2271-7550-b73e-07abd2a0a629`。

- branch：`codex/admin-services-vector-fixes`
- worktree：`/Users/muze/.codex/worktrees/admin-services-vector-fixes/npcink-ai-cloud`
- base：`66fe8ddf0092052c2faa9a213ab18670e88a16d3`（开工 fetch 后的 `origin/master`）
- lock：`codex:01a1929f-2271-7550-b73e-07abd2a0a629`，保留到交接、合并及清洁收尾条件全部满足。
- conflict domain：external-services / vector-settings 页面、必要的 Provider 凭据归一化与相关测试。
- merge lane / M4：builder 不持有、不操作；不发布 PR、不合并、不触碰生产。
- 未修改共享导航保护、弹窗、i18n 或既有落实台账；未修改供应商上一批 7 项修复。
- 不调用付费供应商、不写真实设置、不触发真实向量探测或索引重建。后端测试为临时 SQLite + 无供应商适配器；浏览器为本地 Next 构建 + 模拟接口。

## 10 项逐条处置

| 编号 | 实施与本地证据 |
| --- | --- |
| S01 | Reader 提交合法 `execution_source`，独立保留 `service_role=enhancer`、`web-search.reader`、`web_search` 与 secretless。真实 FastAPI 保存启用/停用均通过，原主搜索保持启用；浏览器断言一致。 |
| S02 | 复用既有 Admin 导航保护。刷新取消、历史后退取消、Escape/继续编辑均保留服务草稿；取消空替换后恢复干净状态。原关闭/清除确认行为保留。 |
| S03 | 前后端都 trim；非空但纯空白的替换在写入前拒绝。缺省/null 保留，精确空串仍是明确清除；真实 API 参数化检查 credential/secret 别名、普通空格/换行/全角空格、创建/更新，原来源与运行凭据保持有效。 |
| S04 | 每条连接的必要字段先验证，空记录或缺字段进入页面级读取失败，保留重试，不创造可写空目录。仅异常接口注入，不声称发生过生产事故。 |
| V01 | Endpoint、密钥或 Token 的实际差异都启用导航保护；取消离开保留草稿，确认放弃才离开。密钥/Token 单字段草稿分别验证。 |
| V02 | 分步回执不把后续修改算成已保存。部分保存后有新密钥时，从 Embedding 重新提交再保存 store；未修改成功步骤时仅重试 store，避免重复探测。后续编辑移除整体已保存结论并显示未保存状态。 |
| V03 | 传输中断、12 秒 deadline、不可用/畸形成功响应先 GET 确认；不自动重放 PUT/POST。读取失败保留旧快照、草稿和待确认回执并禁止保存/重建；恢复按钮仅 GET。读取到进行中重建后跟随生命周期，不能再次启动。 |
| V04 | 恢复动作按当前操作明确分为 embedding / store / rebuild / read，不再用旧失败步骤分派重建的重试。请求序列验证最后两次均为 index-rebuilds。 |
| V05 | 初始 GET、Embedding/store 保存及 rebuild 成功响应复用必要档案结构验证；畸形响应不替换 profile、不清空未确认草稿、不崩全页。读取恢复零写入。仅异常响应注入。 |
| V06 | 从实际字段与已确认 Endpoint 基线推导 dirty；仅展开再取消替换不会阻止轮询更新 Endpoint。1440/1056 PC 均验证最终提交的是新 Endpoint，真实 Endpoint/Token 草稿仍由既有轮询回归保护。 |

凭据写入响应丢失时，GET 只能确认最新公开状态，不能证明具体新密钥是否已替换；页面明确保留结果待确认，不根据 configured=true 伪造成功。成功回读后，操作者可核对状态并明确决定是否重新提交；恢复动作本身始终只读。已明确返回的领域错误与传输未知区分，SDK/Endpoint 等已知错误仍保留原因与对应恢复入口。

## 内容层级与 PC 检查

- 常显：对象、环境与连接/索引/真实检索事实；未保存、失败、待确认、旧快照与下一步；按步骤的提交状态。
- 按需：现有配置 workbench、明确的离开/清除确认，复用共享原语。
- 技术证据：沿用技术详情和向量诊断直接入口。
- 删除重复/迁移：本批不迁移原有信息，不恢复已去重内容，不变更截图基线。

检查限定两个目标页面、相关错误/草稿/确认状态及适用的 1440/1056 PC 宽度；既有 900px PC/明暗回归随原 spec 保留执行。未改颜色 token、全局几何、共享原语或全后台布局，因此未机械运行全后台视觉矩阵。截图必须回到页面顶部后取证，避免浏览器全页截图把固定导航绘在当前滚动位置，遮住待确认说明。

## 验证记录

- `pytest tests/api/test_external_service_save_recovery.py tests/api/test_service_provider_routes.py tests/domain/test_provider_connection_registry.py tests/domain/test_provider_connection_projection.py -q`：94 passed。
- `pnpm --dir frontend run test:e2e -- tests/e2e/admin-external-vector-recovery.spec.ts tests/e2e/admin-vector-settings.spec.ts tests/e2e/admin-external-services.spec.ts`：39 passed，含新 spec 21 项、既有 18 项；本地构建通过。
- 新 spec 改用 `helpers/critical-network-fixture`；`NPCINK_CLOUD_CRITICAL_OFFLINE=1` 离线门禁重放 21/21 passed（40.4s），未匹配的 API/外网请求受守卫约束。
- changed Python Ruff/mypy、frontend type-check、受影响文件 ESLint、`check:admin-ui`、i18n completeness：均通过；最终 `NPCINK_CLOUD_PYTHON_BIN=/Users/muze/gitee/npcink-ai-cloud/.venv/bin/python pnpm run verify:local` exit 0。
- local 浏览器证据保存在 `.runtime/admin-services-vector-evidence/`；最终截图另复制到执行会话产物目录。真实 M4、CI、合并、M4 accepted、生产与人工验收均未执行。

首次新增测试 16/18 通过，另两项为测试重复安装通用模拟接口覆盖向量路由；修正安装一次后全部通过。全量定向 35/36 的唯一失败是既有 Reader 用例断言旧非法 source_role，已更新为真实后端接受的值。原分步失败用例也改为合法完整的领域错误 envelope，以区别“明确失败可重试”和“畸形/丢失响应需只读确认”。这些失败原始截图/trace 保留在 `.runtime`，未以删除断言、放宽截图阈值或更新基线求绿。

后端新增测试首次对运行投影误期望 `tavily`，源码实际策略为 `auto` 且保留 Tavily key；修正为现有契约后全部通过。截图窄复核手动启动本地 server 时首次遗漏 setup override，页面 503，已中止该次并按既有测试环境参数启动；不记为产品缺陷。共享 M4 没有任何操作。

## integrator 后续

1. 审阅本分支并整合下面的台账/词条内容；与上一批供应商修复没有源码文件重叠。
2. 在唯一 merge lane 执行当前基线整合、PR/CI；M4 候选由 integrator 协调占用后同步并核对前后端版本、dirty 身份。
3. 复核真实后端目录与向量档案读取、新旧快照、错误与只读恢复；真实凭据测试或付费调用不属于本地证据，也不能未经授权制造样本。
4. 若修改整合源码，仅补跑受影响窄门禁，按仓库规则完成 merged / M4 accepted 记录；生产另需人类明确授权。

## 供 integrator 统一追加的台账文本

`/admin/external-services`：第二批 S01–S04 本地实现并验证，Reader 来源角色修正、空白凭据前后端拒绝、导航草稿保护、畸形目录读取恢复；原配置/清除入口、运行角色与验证事实保留。M4/人工验收待 integrator。

`/admin/vector-settings`：第二批 V01–V06 本地实现并验证，实际差异 dirty、导航确认、新草稿与分步回执分开、保存/重建恢复归属、未知结果 GET-only 恢复、响应结构验证及取消后更新 Endpoint。现有技术详情、检索证据与暂停/权限边界保留。M4/人工验收待 integrator。

## 供 integrator 统一追加的双语词条

新增提示已使用页面现有 copy fallback，可正常显示中英文；共享 i18n 文件由 integrator 统一修改。下表包含两个页面已有但未收录的 fallback 词条；同 key 的既有不同 fallback 按首项去重，整合时统一措辞。

| key | zh-CN | en |
| --- | --- | --- |
| `admin.external_services.action_or_note` | 操作 / 说明 | Action / note |
| `admin.external_services.boundary` | 这里只配置 Cloud 运行时外部服务，不定义 WordPress 能力、工作流或写入权限。 | This page configures Cloud runtime services only; it does not define WordPress abilities, workflows, or write authority. |
| `admin.external_services.boundary_title` | 运行边界 | Runtime boundary |
| `admin.external_services.cancel_replace` | 取消替换 | Cancel replacement |
| `admin.external_services.categories` | 服务类型 | Service category |
| `admin.external_services.clear_credential` | 清除凭据并停用 | Clear credential and disable |
| `admin.external_services.clear_effect` | 清除凭据后立即停用服务 | Clearing the credential disables the service immediately |
| `admin.external_services.cleared` | 凭据已清除，服务已停用。 | Credential cleared and service disabled. |
| `admin.external_services.column_actions` | 操作 | Actions |
| `admin.external_services.column_credential` | 凭据 | Credential |
| `admin.external_services.column_role` | 角色 | Role |
| `admin.external_services.column_runtime` | 运行调用 | Runtime |
| `admin.external_services.column_service` | 服务 | Service |
| `admin.external_services.column_status` | 状态 | Status |
| `admin.external_services.configuration_item` | 配置项 | Setting |
| `admin.external_services.confirm_clear` | 确认清除并停用 | Clear and disable |
| `admin.external_services.credential` | API Key / Token | API key / token |
| `admin.external_services.credential_action` | 凭据操作 | Credential action |
| `admin.external_services.credential_blank` | 凭据不能只有空白字符。请填写新凭据，或取消替换以保留原值。 | Credentials cannot contain only whitespace. Enter a new credential or cancel replacement to keep the saved value. |
| `admin.external_services.credential_missing` | 尚未配置 | Not configured |
| `admin.external_services.credential_required` | 启用前请填写 API Key 或 Token。 | Enter an API key or token before enabling this service. |
| `admin.external_services.credential_saved` | 已保存 | Saved |
| `admin.external_services.credential_unchanged` | 保留当前已保存凭据 | Current saved credential remains unchanged |
| `admin.external_services.current_value` | 当前设置 | Current setting |
| `admin.external_services.description` | 从固定服务清单配置网页搜索和图库来源，无需创建供应商记录。 | Configure web search and stock-image sources from a fixed service directory; no supplier records need to be created. |
| `admin.external_services.enable_runtime` | 运行调用 | Runtime calls |
| `admin.external_services.enable_runtime_action` | 启用于运行时调用 | Enable for runtime calls |
| `admin.external_services.enhancer_role` | 可与主搜索服务同时启用。 | Can run alongside the primary search service. |
| `admin.external_services.fixed_value` | 系统固定 | System fixed |
| `admin.external_services.footer_notice` | 保存后仅更新当前服务；连接测试需单独执行。 | Saving updates this service only; connection tests run separately. |
| `admin.external_services.image_directory` | 图库来源 | Image sources |
| `admin.external_services.image_rule` | 图片规则 | Image rule |
| `admin.external_services.image_rule_value` | 已启用来源并行 | Enabled sources in parallel |
| `admin.external_services.images` | 图库来源 | Image sources |
| `admin.external_services.load_error` | 加载外部服务失败。 | Failed to load external services. |
| `admin.external_services.new_credential` | 输入新凭据 | Enter a new credential |
| `admin.external_services.no_credential` | 无需凭据 | Not required |
| `admin.external_services.not_verified` | 未验证 | Not verified |
| `admin.external_services.open_diagnostics` | 查看运行诊断 | Open runtime diagnostics |
| `admin.external_services.parallel_role` | 可与其他图库同时启用。 | Can run alongside other image sources. |
| `admin.external_services.primary_role` | 启用后替换其他主搜索服务。 | Enabling it replaces the other primary search service. |
| `admin.external_services.replace_credential` | 替换凭据 | Replace credential |
| `admin.external_services.role_enhancer` | Reader 增强 | Reader enhancement |
| `admin.external_services.role_parallel` | 并行来源 | Parallel source |
| `admin.external_services.role_primary` | 主搜索 | Primary search |
| `admin.external_services.runtime_enhancer` | 实际运行：Reader 增强 | Runtime: Reader enhancement |
| `admin.external_services.runtime_parallel` | 实际运行：并行来源 | Runtime: parallel source |
| `admin.external_services.runtime_primary` | 实际运行：当前生效 | Runtime: effective |
| `admin.external_services.runtime_secondary` | 已启用：备用 | Enabled: secondary |
| `admin.external_services.save_before_test` | 先启用并保存，再测试连接。 | Enable and save before testing the connection. |
| `admin.external_services.save_error` | 保存外部服务失败。 | Failed to save external service. |
| `admin.external_services.saved` | 外部服务设置已保存。 | External service settings saved. |
| `admin.external_services.saved_read_failed` | 设置已保存，但最新状态读取失败。请重试读取，无需再次保存。 | Settings were saved, but the latest state could not be read. Retry reading; do not save again. |
| `admin.external_services.search` | 网页搜索 | Web search |
| `admin.external_services.search_directory` | 网页搜索服务 | Web search services |
| `admin.external_services.search_rule` | 搜索规则 | Search rule |
| `admin.external_services.search_rule_value` | 主服务单选 + Reader 增强 | One primary + Reader enhancement |
| `admin.external_services.secretless_notice` | 可直接启用并保存。 | Enable and save directly. |
| `admin.external_services.service_role` | 服务角色 | Service role |
| `admin.external_services.service_url` | 服务地址 | Service URL |
| `admin.external_services.stale_snapshot` | 以下为上次读取的快照，最新配置尚未确认。确认前不能修改或测试连接。 | The last read snapshot is shown below. The latest configuration is unconfirmed; changes and tests are unavailable until refreshed. |
| `admin.external_services.test_error` | 连接测试失败。 | Connection test failed. |
| `admin.external_services.test_passed` | 连接测试通过。 | Connection test passed. |
| `admin.external_services.title` | 搜索与图片 | Search & images |
| `admin.external_services.verification_failed` | 验证失败 | Verification failed |
| `admin.external_services.verification_passed` | 验证通过 | Verified |
| `admin.external_services.verified_services` | 验证通过服务 | Verified services |
| `admin.vector_settings.awaiting_site_sync` | 站点更新中 | Refreshing sites |
| `admin.vector_settings.cancel_replace_credential` | 取消替换 | Cancel replacement |
| `admin.vector_settings.cancel_replace_token` | 取消替换 | Cancel replacement |
| `admin.vector_settings.collection_fixed` | 固定为 1024 维 COSINE；不兼容时不会修改。 | Fixed to 1024-dimension COSINE; incompatible collections are not changed. |
| `admin.vector_settings.configuration_desc` | 固定档案由平台维护；只填写连接凭据并保存。 | The platform owns the fixed profile; only connection values can be saved here. |
| `admin.vector_settings.configuration_item` | 配置项 | Setting |
| `admin.vector_settings.configuration_note` | 状态 / 说明 | Status / note |
| `admin.vector_settings.configuration_saved` | 配置已保存，并已完成当前固定档案的连接检测。 | Configuration saved and checked against the current fixed profile. |
| `admin.vector_settings.configuration_table` | 向量配置表 | Vector configuration table |
| `admin.vector_settings.configuration_title` | 向量配置 | Vector configuration |
| `admin.vector_settings.configuration_value` | 当前值 | Current value |
| `admin.vector_settings.connection_check` | 连接检测 | Connection check |
| `admin.vector_settings.connection_check_desc` | Embedding 与 Zilliz 均需通过真实探测。 | Both embedding and Zilliz must pass live probes. |
| `admin.vector_settings.connection_required` | 请先完成连接配置和检测。 | Complete connection configuration and checks first. |
| `admin.vector_settings.credential_blank` | 密钥或 Token 不能只有空白字符，请填写或取消替换。 | A key or token cannot contain only whitespace. Enter a value or cancel replacement. |
| `admin.vector_settings.credential_saved` | 已保存，原值不会显示 | Saved; the original value is never shown |
| `admin.vector_settings.discard_action` | 放弃修改并离开 | Discard and leave |
| `admin.vector_settings.discard_confirm` | 离开将丢弃向量配置草稿，已保存的配置不会受影响。 | Leaving discards the vector configuration draft. Saved configuration is not affected. |
| `admin.vector_settings.discard_title` | 放弃未保存的修改？ | Discard unsaved changes? |
| `admin.vector_settings.embedding_space_mismatch` | 现有资料来自旧向量来源，不能直接迁移。请从站点端执行一次全量 Site Knowledge 同步。 | Existing content belongs to an older vector source and cannot be copied. Run a full Site Knowledge sync from the site. |
| `admin.vector_settings.index_check` | 索引检测 | Index check |
| `admin.vector_settings.index_empty` | 暂无资料 | No content |
| `admin.vector_settings.index_space_mismatch` | 现有资料属于旧向量空间。启动后，各站点会在后台自动重送公开内容，不会混入旧索引。 | Existing content belongs to an older vector space. Once started, sites resend public content in the background without mixing it into the old index. |
| `admin.vector_settings.index_waiting_connection` | 等待连接配置 | Awaiting connection configuration |
| `admin.vector_settings.keep_editing` | 继续编辑 | Keep editing |
| `admin.vector_settings.new_credential` | 输入新 API Key | Enter a new API key |
| `admin.vector_settings.new_token` | 输入新 Token | Enter a new token |
| `admin.vector_settings.no_hit_next` | 请核对资料范围、索引和查询相关性；零命中不表示尚未执行。 | Check content scope, indexing, and query relevance; no hits does not mean the search was not executed. |
| `admin.vector_settings.not_ready` | 未完成 | Not ready |
| `admin.vector_settings.pending_validation` | 等待验证 | Pending |
| `admin.vector_settings.production_validation_desc` | 下表验证生产 BGE-M3 / Zilliz 配置，不代表上方本地运行环境。进行中的索引任务会自动刷新。 | These checks cover the production BGE-M3 / Zilliz configuration, independently of the local runtime above. Index work in progress refreshes automatically. |
| `admin.vector_settings.production_validation_title` | 生产连接与索引验证 | Production connection and index validation |
| `admin.vector_settings.provider_unverified` | 保存后执行真实探测；密钥不会回显。 | Saving runs a live probe; the key is never returned. |
| `admin.vector_settings.provider_verified` | 已保存并通过 BGE-M3 1024 维真实探测。 | Saved and verified by a live BGE-M3 1024-dimension probe. |
| `admin.vector_settings.rebuild_boundary` | 仅迁移 Cloud 已接收的公开站点资料；不会写入 WordPress，也不会重新消耗普通 AI 积分。 | Only public content already received by Cloud is moved. WordPress is not written and ordinary AI credits are not consumed. |
| `admin.vector_settings.rebuild_complete` | Zilliz 索引已重建并通过往返自检。请执行一次正常的站点知识搜索，完成真实检索验收。 | The Zilliz index was rebuilt and passed its round-trip check. Run a normal Site Knowledge search to complete retrieval validation. |
| `admin.vector_settings.rebuild_error` | 索引重建失败，请查看向量诊断后重试。 | Index rebuild failed. Review vector diagnostics and retry. |
| `admin.vector_settings.rebuild_index` | 重建向量索引 | Rebuild vector index |
| `admin.vector_settings.rebuild_unconfirmed` | 重建提交结果待确认。已尝试读取最新状态，不会自动再次重建；请核对当前索引状态。 | The rebuild submission is unconfirmed. The latest state was requested without starting another rebuild; review the current index state. |
| `admin.vector_settings.rebuilding` | 重建中… | Rebuilding… |
| `admin.vector_settings.reindex_needed` | 需要重建 | Rebuild needed |
| `admin.vector_settings.replace_credential` | 替换密钥 | Replace key |
| `admin.vector_settings.replace_token` | 替换 Token | Replace token |
| `admin.vector_settings.retrieval_check` | 真实检索 | Live retrieval |
| `admin.vector_settings.retrieval_no_hit` | 已检索，零命中 | Searched, no hits |
| `admin.vector_settings.retrieval_pending` | 重建后执行一次正常的 Site Knowledge 搜索；这里会自动记录结果，不另设测试入口。 | After rebuilding, run a normal Site Knowledge search. Its evidence appears here automatically. |
| `admin.vector_settings.retry_read` | 重试读取状态 | Retry reading state |
| `admin.vector_settings.retry_rebuild` | 重试索引重建 | Retry index rebuild |
| `admin.vector_settings.save_configuration` | 保存配置 | Save configuration |
| `admin.vector_settings.site_sync_requested` | 已通知各站点在后台自动重送公开内容；无需站点管理员手动操作。 | Sites will automatically resend public content in the background. No site-admin action is required. |
| `admin.vector_settings.stale_snapshot` | 以下为上次读取的快照，最新状态未确认。请重试读取后再保存或重建。 | The last read snapshot is shown below. The latest state is unconfirmed. Retry reading before saving or rebuilding. |
| `admin.vector_settings.start_automatic_sync` | 启动自动更新 | Start automatic refresh |
| `admin.vector_settings.status_awaiting_site_sync` | 站点自动更新中 | Refreshing sites |
| `admin.vector_settings.status_awaiting_site_sync_desc` | 站点正在后台分批重送公开内容；无需站点管理员手动执行全量同步。 | Sites are resending public content in bounded background batches; no site-admin full sync is required. |
| `admin.vector_settings.status_rebuild_failed` | 重建失败 | Rebuild failed |
| `admin.vector_settings.status_rebuild_failed_desc` | 索引尚不可用，请查看诊断后重试。 | The index is not usable yet. Review diagnostics and retry. |
| `admin.vector_settings.status_rebuilding` | 正在重建 | Rebuilding |
| `admin.vector_settings.status_rebuilding_desc` | 正在把 Cloud 已保存的站点资料迁入 Zilliz。 | Cloud-owned Site Knowledge is being moved into Zilliz. |
| `admin.vector_settings.status_reindex_required` | 需要重建索引 | Reindex required |
| `admin.vector_settings.status_reindex_required_desc` | 连接已经就绪，但现有站点资料尚未迁入当前 Zilliz 向量空间。 | Connections are ready, but existing Site Knowledge has not been moved into the active Zilliz space. |
| `admin.vector_settings.status_unknown` | 状态未知 | Unknown state |
| `admin.vector_settings.step_failed` | 失败 | Failed |
| `admin.vector_settings.step_not_started` | 未开始 | Not started |
| `admin.vector_settings.step_pending` | 进行中 | In progress |
| `admin.vector_settings.step_succeeded` | 已完成 | Completed |
| `admin.vector_settings.step_unconfirmed` | 结果待确认 | Result unconfirmed |
| `admin.vector_settings.store_unverified` | 保存后会检测并初始化固定 Collection。 | Saving checks and initializes the fixed collection. |
| `admin.vector_settings.store_verified` | 已保存并通过固定 Collection 检测。 | Saved and verified against the fixed collection. |
| `admin.vector_settings.stored_embedding_invalid` | 现有资料的向量不符合固定档案，请从站点端执行一次全量 Site Knowledge 同步。 | Existing vectors do not match the fixed profile. Run a full Site Knowledge sync from the site. |
| `admin.vector_settings.technical_details_desc` | 连接标识、当前后端和索引策略。 | Connection identifiers, active backend, and index policy. |
| `admin.vector_settings.token_saved` | 已保存，原值不会显示 | Saved; the original value is never shown |
| `admin.vector_settings.unavailable` | 尚未读取到向量配置，无法判断连接和索引状态。 | Vector configuration has not been read; connection and index state are unknown. |
| `admin.vector_settings.unknown_state_desc` | 当前状态无法识别，请刷新或查看诊断。 | The current state is not recognized. Refresh or review diagnostics. |
| `admin.vector_settings.unsaved_draft` | 有未保存的修改。步骤回执仅对应已提交的配置。 | There are unsaved changes. Step receipts describe the submitted configuration only. |
| `admin.vector_settings.validation_evidence` | 证据 / 后续操作 | Evidence / next step |
| `admin.vector_settings.validation_item` | 验证项 | Check |
| `admin.vector_settings.validation_result` | 结果 | Result |
| `admin.vector_settings.validation_table` | 验证结果表 | Validation results table |
| `admin.vector_settings.write_unconfirmed` | 提交结果待确认。已尝试读取最新状态，不会自动重复保存。草稿已保留；已保存的密钥不会回显，无法据此确认本次替换。 | The submission result is unconfirmed. The latest state was requested without repeating the write. Drafts are retained; saved keys are never shown, so their replacement cannot be confirmed from this read. |
| `admin.vector_settings.zilliz_endpoint_notice` | 使用集群详情中的公共 Endpoint。 | Use the public endpoint from the cluster details. |
| `common.configure` | 配置 | Configure |
| `common.failed` | 失败 | Failed |
| `common.missing_config` | 缺少凭据 | Missing credential |
| `common.ready` | 已通过 | Passed |
| `common.test_connection` | 测试 | Test |
| `common.testing` | 测试中… | Testing… |

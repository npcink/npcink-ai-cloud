# 本地 WordPress 功能验收记录（2026-10-06）

Status: blocked by local WordPress maintenance; full functional acceptance pending.
本轮只验收开发环境，不授权生产发布或启动试用。浏览器连续两次失败后，
按操作者确认的停止规则结束自动重试；不是功能通过报告。

## 1. 范围、版本与预算

- 工作：账号 Free → Addon → 官方 AI 插件编辑器 → 人工保存 → Cloud 证据。
- 源码：独立锁定 `codex/wordpress-local-acceptance` 工作树，基于干净
  master `e3f4a5d56e26c281f04b57da6c3c25ace5e663f1`。
- M4 只读状态：`acceptance_state=accepted`、`promotion_pr=1073`、
  `source_branch=master`、`source_dirty=false`，源码版本与上述 master 相同。
- Local：`https://magick-ai.local`，WordPress 7.1.1 / 官方 AI 1.3.0 /
  Addon 0.2.0。Addon 挂载源码 `d60cce3`，所在分支为
  `refactor/descriptor-normalizer-dedup`；这不是 Addon 已合并声明。
- 路径：操作者此前选择的 Pgy SSH 前台隧道，Cloud JSON 入口
  `http://127.0.0.1:18010`；不使用生产或 Cloudflare Access 作机器连接。
- 预算：45 分钟拆分点、付费 Provider 调用 0、完整大套件执行 0。
- 非目标：套餐/周限额/邀请管理、支付、Provider 配置、参考图协议、
  生产、其他工作树源码、制造试用数据。WordPress 保持最终写入所有权。

## 2. 已确认的基础状态

| 检查 | 本轮结果 | 证据边界 |
| --- | --- | --- |
| Local 数据库、站点目标 | SELECT 1 成功，siteurl 匹配 | 不代表浏览器编辑器可用 |
| Addon / Toolbox / 官方 AI | 已启用；Addon verified、connector enabled | 不代表每种模型可运行 |
| M4 接收状态 | 仍为 PR #1073 的干净已接收版本 | 本轮没有 sync、deploy 或 promote |
| 本机 Cloud 连通 | 隧道恢复后 readiness=ready，health/live=200 | 初始 502 是独立的本机消费路径问题 |
| 文本、视觉能力 | 原有签名读取刷新后 configured | 配置快照，不是生成或结果质量证据 |
| 文生图能力 | unavailable / no_eligible_model | 本轮不能宣称文生图当前可用 |
| 观测 | monitoring=true，hourly Cron 已注册，journey buffer=0 | 空队列不证明自然上报成功 |

能力快照 `checked_at=2026-10-06T10:11:03.221467Z`，有效期 300 秒，
`provider_call_performed=false`。通过既有 refresh 路径更新缓存，没有写入
伪造快照或修改模型、运行配置。未来验收须重新取得新鲜证据。

隧道的浏览器采样报告 `browser_transport=degraded`、采样字节为 0；
不能把 tunnel_ready 当 Cloud 浏览器质量证明。使用 NO_PROXY 后基础 HTTP
就绪检查通过；本轮没有完成 Cloud 页面浏览器验收。

## 3. 浏览器两次尝试与停止点

复用 Addon 已有 `scripts/smoke-wordpress-ai-text-browser.mjs`，设置
`WP_AI_TEXT_FAKE_PROVIDER=1`。脚本限定 Local/development，使用临时草稿、
短期 WordPress 登录会话、局部假 Provider，finally 清理本轮数据。
没有切换真实站点凭据，没有生成请求到达 Cloud 或外部 Provider。

1. 第一次：Playwright 模块路径未找到。退出前移除本轮替身和 option，
   删除临时草稿 281284。修正为现有 `playwright@1.59.1` 模块路径，
   不安装依赖、不改变 Addon 源码。
2. 第二次：认证 cookie 进入后台目标页，但页面是 WordPress 原生维护提示，
   编辑器等待 30 秒超时。`ability responses=[]`、`pre-save fixture writes=[]`。
   脚本确认移除本轮替身与 option、销毁会话、删除草稿 281285。

只读核对发现 Local 根目录存在 `.maintenance`；WP-CLI 报告
`Maintenance mode is active`，`/wp-admin/` HTTP 503。截图人工核验同样显示
“Briefly unavailable for scheduled maintenance”。标记修改时间为本地
2026-10-06 18:09，无法仅凭标记确认更新已经结束；本轮保留该文件。

连续两次浏览器尝试失败后停止，未第三次重试，未执行取消重载、并发标签页
或权限拒绝变体。当前没有标题/摘要/改写的新通过证据，也不能用空响应证明
已注入 Provider 故障或额度扣减正确。

## 4. 六条 Done 的本轮判定

| Done | 状态 | 原因 / 下一步 |
| --- | --- | --- |
| 真实标题建议不少于 10 次 | 未在本轮完成核验 | 历史运行数量不能替代真实展示与文章使用关联 |
| 空结果、超时、Provider 错误可恢复 | 未验证 | 编辑器未加载，替身故障尚未到达 |
| 建议与人工保存边界 | 历史证据可复用，本轮未验证 | 本轮未进入审阅或显式保存步骤 |
| 重复、取消、重试与扣减幂等 | 部分历史证据，本轮未验证 | 账号幂等不等于编辑器运行与扣减幂等 |
| run / usage / Provider 记录 | 历史事实可见 | 只读数据库查询找到记录，本轮未新建生成 run |
| 真实采纳与质量反馈闭环 | 历史事实可见，关联仍需核对 | 不将人工补充或保存观察冒充原生 agent_feedback |

沿用 [账号权益开发候选记录](trial-free-entitlement-development-candidate-2026-10-06.md)
及 PR #1073 的账号/API、真实 PostgreSQL 并发、Portal 功能和截图证据，
不重跑同一版本完整大套件，也不把这些证据写成 WordPress 全流程验收。

对当前连接站点的 M4 数据执行只读事务并 rollback：历史 connector-runtime
为 1768 succeeded / 83 failed；原生 `agent_feedback.editor_content_support`
89 条，编辑展示事件 28 条、观察结果事件 49 条；customer journey 中
title_generation succeeded 127 条。这些合计混合历史开发与使用，不能当
独立真实用户、10 次正常文章写作、当前成功率或试用 H1/H2/H3。
Provider 记录成本不是第三方账单，本轮不计算商业指标。

## 5. 后续顺序与恢复边界

1. 确认 Local 更新是否仍在进行；结束或按明确恢复方案解除维护后，重新
   检查后台 HTTP 与实际编辑器。按本轮停止规则，需要下一轮明确继续指令。
2. 重新做只读能力刷新，使用已修正模块路径的原有替身浏览器脚本；
   优先完成主流程，再运行取消重载、并发与权限变体，不扩大产品面。
3. 对其余官方能力优先复用已有契约和可关联真实证据；第三方真实生成不为
   制造验收数据发起，模型质量或付费路径未验证就明确标记。
4. 文生图目前没有 eligible model。配置模型或暂停入口应另列明确操作；
   参考图编辑继续暂缓，不用历史成功图片替代当前能力证据。
5. 本地完整验收完成后整理实际生产发布范围、配置与回滚方案，生产仍单独
   授权，之后才招募站长和指定 T+0。

工具附带发现：runbook 的 `pnpm run wordpress:editor:readiness -- --json`
向 argparse 传入额外 `--` 会退出；本轮直接运行现有 Python 脚本完成
同一检查。此命令说明问题单列后续，未修改运行工具。

## 6. 交付与回滚

文档收口：`git diff --check`、release-policy、254 个相对链接核验通过；
documentation reachability 495/495。`check:changed --plan --workflow-lane
development` 判定 documentation-only、PR required=false；这仅验证记录交付，
不消除上述浏览器阻塞。

只新增本记录和 docs 索引；不修改 Cloud、Addon、WordPress 配置/源码或
原文章。Provider dispatch 0；测试临时数据清理已确认。前台隧道在本轮
结束时关闭，M4 维持原已接收版本。源码工作树保留锁定供下一轮继续。

原始证据位于本会话工作树忽略目录 `.runtime/local-acceptance/`：readiness、
M4 status、只读历史查询、journey inspector、失败截图和浏览器日志。
记录为本地 development lane 交付，不创建新 PR，不宣称已合并或生产可用。
撤回本报告仅需移除本轮两处文档变更，不改变已授予权益或已有运行记录。

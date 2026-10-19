# WordPress → Cloud 最小业务自动验收 v1

Status: local development tool; not production acceptance or release authority.

目标：用一个入口检查写作、用量、额度、权限和账户隔离，输出可读报告和精确缺口。
复用现有测试，不新增验收服务、后台配置、测试账户或另一套业务规则。
Cloud 保持执行与计量职责；WordPress 保持建议采用、草稿保存和发布的最终写入职责。

## 一个入口

在 Cloud 仓库执行；Addon 参数必须指向可信的本地 Git 仓库，不是线上 WordPress 目录：

```bash
# 只列五类检查与生产缺口，不运行测试、不读取生产。
pnpm run verify:local -- --business --plan

# 检查本地依赖；缺项即失败，不安装、不下载。
pnpm run verify:local -- --business --doctor \
  --addon-root /Users/muze/gitee/npcink-cloud-addon

# 执行全部最小零付费回归。
pnpm run verify:local -- --business \
  --addon-root /Users/muze/gitee/npcink-cloud-addon
```

默认 `verify:local`、`--critical` 和当前差异分类逻辑均保持原行为。
本入口是固定业务用例编排，不是新的差异分类器。唯一用例清单为
[business-acceptance-v1.json](../config/business-acceptance-v1.json)。

输出位于忽略目录 `.tmp/business-acceptance/run-*/`：

- `report.md`：五类结果和生产实测缺口。
- `receipt.json`：Cloud HEAD/工作差异指纹、Addon 固定提交和源码树、逐步骤结果。
- `cloud.xml`、`cloud.log`、`addon-*.log`：精确测试和断言证据。

退出码 0 只代表本轮完整零付费回归通过。`production_accepted` 始终为 `false`，
生产、M4 和真实 Provider 调用始终为 `not_run`；不接受覆盖这些状态的命令参数。
失败立即停止、不重试、不执行后续阶段；空测试、遗漏函数或 skipped 都不能算通过。
PHP 必须执行到包装器的结束标记；提前 `exit(0)` 也不能算通过。
报告保留失败前已通过的 Cloud 或 Addon 证据，但不把部分结果标为完整通过。

## 已有工具盘点与选择

| 工具 | 当前能力 | 本入口如何使用 |
| --- | --- | --- |
| `scripts/verify_critical.py`、`scripts/critical_offline.py` | 隔离 Fake API/SQLite、环境白名单、真实 DNS/TCP/UDP 拒绝；另有 Mock Portal 浏览器回归 | 复用环境和网络审计插件，选择精确 API/domain 函数；不重复整套前端构建 |
| Addon `tests/behavior-wordpress-ai-connector-runtime.php` | 请求签名、契约、异步运行与错误处理桩测试 | 执行固定提交的测试副本 |
| Addon `tests/behavior-wordpress-ai-failure-projection.php` | 上游失败、权益拒绝与安全错误提示 | 同上 |
| Addon `tests/behavior-editor-assist-quality.php` | 生成与本地保存事件关联、隐私及监测关闭行为 | 验证元数据逻辑；不是实际编辑器保存证明 |
| Addon `tests/behavior-entitlement-summary.php` | 权益缓存、过期/未知状态、用量投影 | 验证站点权益投影逻辑 |
| Addon `tests/behavior-wordpress-ai-connector-registration.php` | 连接器注册、凭据可用性及能力开关 | 验证插件边界；不冒充 WordPress 真实用户角色鉴权 |
| Addon `scripts/smoke-wordpress-ai-text-browser.mjs` | 官方 AI 编辑器标题/摘要/改写、采用与保存证据 | 当前限定本地域名和 local/development，且完整执行三项；本轮不运行、不放宽限制 |
| Addon `scripts/smoke-wordpress-ai-editor.php` | 实际 WordPress REST 数据路径、草稿采用/回读 | 包含真实能力调用和草稿写入；本轮不运行，不能代替浏览器证据 |
| Cloud `app/ops/production_wordpress_ai_connector_smoke.py` | Cloud 连接器 resolve，显式启用时执行真实标题调用 | 不覆盖编辑器采用保存；本轮不运行 |
| Cloud `scripts/wordpress_editor_acceptance.py` | 相关文章、内链推荐的读取与 Cloud 检索证据 | 不是当前正文润色链路，不纳入本次最小范围 |
| `deploy/release-smoke.sh` / `--preflight-only` | 正式发布健康、内部诊断、完整 smoke 前置条件 | 保持独立；本入口不打开 SSH 通道，不以外部 trace 配置阻塞离线业务回归 |

## 五类覆盖与限度

| 范围 | 本地自动证明 | 仍需生产实测 |
| --- | --- | --- |
| 写作 | suggestion-only 结果、正文改写规范化、幂等重放不重复调用、Addon 请求与失败投影、保存关联元数据 | 一个专用草稿的真实润色→采用→保存→刷新；相邻段落不变、仍为草稿；语义质量人工快速判断 |
| 用量 | 开户→Addon 签名运行→用量审计 Fake API、消费与充值分开、积分流水幂等、用量维度汇总 | 同一次真实操作的 Provider/model、回退与附带调用、token、分项积分与余额对账；异步账单延迟 |
| 额度 | 有限积分耗尽拒绝、Provider 预算幂等与日/月滚动、修改上限不清零用量 | 当前主/回退连接预算与套餐的只读核对；线上耗尽、并发和周期切换仅可在专用隔离条件下另行验证 |
| 权限 | 无会话、撤销成员、停用身份、撤销密钥、缺少 scope 的后端拒绝 | WordPress 管理员/编辑者/无编辑权限角色，以及实际过期会话；拒绝前后无 Provider 执行、内容写入及错误扣费 |
| 隔离 | 跨账户成员升级拒绝、站点身份绑定、跨站点运行结果/权益读取拒绝 | 两个专用账户/站点的真实会话；运行结果、列表、用量与权益跨账户不可见 |

这些是被选函数的覆盖，不是所有 API 或全部租户隔离的完整审计。
不得把配置存在当作限额拦截生效，也不得把 Fake 调用和元数据保存测试当作真实生成或保存。

## 零付费与源码保护

Cloud 复用 `critical_offline`：测试使用临时 SQLite、Fake Provider 和进程内 TestClient。
子进程不继承 Provider 密钥、生产地址、代理或额外 pytest 参数；真实网络尝试即失败，
即使异常被测试吞掉也不能通过。这是可信测试代码的防误调用保护，不是任意代码沙箱。

Addon 从读取时的确切 `HEAD` 导出副本，不带 `.git`、未跟踪文件或其他会话未提交修改。
副本目录使用插件打包名以保持注册测试语义，结束后删除副本；日志与版本回执保留。
PHP 使用 `-n`，禁止 URL 文件读取、原生网络/邮件、子进程，并限制读取范围到源码副本；
WordPress HTTP 由已有测试桩应答，不加载真实 WordPress、不连接数据库或线上站点。
它验证的是回执中的 Addon 提交，不代表安装版本，也不验证其他会话的新修改。

本入口不调用 M4、Docker、SSH、GitHub、SMTP、真实模型或生产 API；不安装/升级插件，
不创建真实账户、密钥、预算或内容。不覆盖其他会话的工作，不自动发布 PR。
Cloud 运行前后的 HEAD/差异指纹必须一致，否则本轮不完整。

## 生产实测交接

本轮只交付离线入口和缺口，尚未实现或执行远程单草稿浏览器驱动。
后续实现时复用现有编辑器断言，单独明确测试站点、草稿与权限身份，不移除本地脚本保护。

1. 只读核对生产实际版本、插件版本、现有连接、主/回退预算与余额。
2. 操作者在受保护浏览器中登录；已有 SSH 信息可复用，聊天不传密码、验证码或 Token。
3. 另行明确一次真实工作流的调用边界。一次点击可能包括回退与附带 embedding，
   本入口不提供真实请求硬金额上限，也不通过修改生产路由或预算制造限制。
4. 指定专用草稿，通过真实 WordPress 控件完成正文润色、采用、保存与刷新。
   失败停止，不自动重跑、不自动发布；失败草稿保留便于诊断。
5. 只读查询与该操作匹配的运行和计费；异步记录只做有界查询，不能重新生成补证据。
6. 权限/隔离检查需要专用低权限用户和两个专用账户/站点。缺失时列明缺口，
   不撤销真实用户、不耗尽真实额度、不探测其他用户资源。

已有邮件和标题人工验收保留为历史证据，本轮不重新认证其当前生产状态。
正式发布 smoke、真实业务验收、语义质量判断分别记录，不互相代替。

回退：移除 `--business` 分流、新执行器、用例清单和本说明；不涉及生产配置、数据库或插件升级。

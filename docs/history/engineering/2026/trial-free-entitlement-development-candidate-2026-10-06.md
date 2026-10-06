# 免费试用与注册 Free 开发候选记录（2026-10-06）

Status: Pgy candidate deployed; focused backend, frontend type and lint gates
passed. PostgreSQL concurrency verification failed twice; browser verification
not run. Stopped under the operator's two-failure rule. No PR, merge, accepted
promotion, production action or trial start is claimed.

## 交付与来源

- 操作者确认的[四周计划](../../../trial-stage-commercial-validation-plan-2026-10-06.md)及
  [机制盘点](../../../trial-account-and-quota-mechanism-2026-10-06.md)已独立本地提交：
  937941dfc79e9c84fbee0213ca3b835eb070b4b0。
- 代码基线 origin/master：ca0276c935b702e38ab8f278a452010599caabc3；
  发布前仍须重新 fetch/rebase。实施变更保存在 codex/free-registration-trial，
  本记录随实现提交，不把本地提交当作合并。
- 工作树：/Users/muze/.codex/worktrees/free-registration-trial/npcink-ai-cloud；
  locked codex:free-registration-trial。未合并交付保留，不能解锁清理。
- PR：未创建；合并：未发生；生产、支付配置、第三方模型及 Addon 源码：未操作。

## 已实现

邮箱注册验证、QQ 首次登录在身份事务内复用现有 Free 绑定与权益快照；
注册不创建站点或密钥。旧正常账户在成功验证登录时补齐，无订阅历史才授予。
账户锁与锁后状态刷新保留禁用/撤销保护，已有任何订阅历史不覆盖。
重复登录或注册不重置周期，已有 50 credits 消费后仍剩 250。

Addon 现有可信连接及历史无订阅兜底不修改。Portal 无站点仍显示账户权益，
新注册说明与公开帮助/条款一致；Free 耗尽指向用量核对，不要求付款。
新 [ADR-058](../../../decisions/058-registration-verified-account-free-entitlement.md)
仅替代 ADR-029 的 Free 激活时机，站点与凭据边界保留。

未新增 schema、公共 API、试用套餐、周配额、支付流程、埋点、报表后台、
定时任务或参考图输入协议。开发付费调用：0。

## 首次开发验证结果（恢复前历史）

| 检查 | 结果 |
| --- | --- |
| docs-only diff、release-policy、相对链接、check:changed --plan | 通过，独立文档提交 |
| 变更 Python Ruff I/F/E9、targeted mypy | 通过 |
| 最终 tests/api/test_portal_routes.py 全模块 | 106 passed、1 skipped，18.87s |
| public-entitlement-copy-contract | 通过 |
| admin-portal-i18n-completeness-contract | 通过，1808 keys |
| diff / release-policy 收口 | 通过 |
| 前端 type-check、targeted ESLint、Portal PC 浏览器及视觉契约 | 未执行：锁文件依赖安装未完成 |
| M4 PostgreSQL 并发 / 当前候选运行行为 | 未执行：源码 relay 不可达 |
| GitHub checks、merged master、M4 accepted、生产 | 未进行 |

全模块重跑有明确修正依据：第一次在旧“注册没有订阅”断言停止（4 passed）；
第二次在旧“登录后仍用默认 5 站点容量”断言停止（96 passed、1 skipped）。
更新相应预期，并在最终审查补上注册绑定异常的历史保护后，对最终修订完成
106 passed 的整体门禁。中间 focused 成功证据没有被误报为全模块绿色。

唯一 skip 是新 PostgreSQL 并发测试：本地 SQLite 不证明行锁。
该测试只接受非生产环境的 disposable Docker postgres 地址，创建唯一测试
schema，使用真实并发 QQ 身份解析检查一份订阅、一份快照、一次绑定审计，
最后清理自身 schema。需在候选成功进入 M4 后运行，不能用本地 skip 宣称通过。

## 阻塞与停止

1. pnpm frozen/offline 安装缺少包；按锁文件联网安装随后出现 npm TLS
   证书主机名不匹配及超时。安装重试已停止，未降级包、改锁文件、放宽 TLS，
   也未借用主工作树的旧版本依赖冒充当前版本验证。
2. M4 第一次 sync 在功能分支保护处停止，尚未传输。第二次显式声明
   non-master/dirty candidate 并选择 relay 后，Tailscale 私有 relay SSH 超时。
   未转 direct、未传入当前源码、未替换 M4 运行环境。

遵守本阶段连续两次失败停止及第二个独立阻塞不扩项规则，保留源码和本地
提交；不开始网络、证书、共享运行环境或其他依赖修复任务。

同步前只读 M4 状态是 accepted，PR 1061、source_branch=master、
source_dirty=false、source_revision=c5b6bf884dfea3e20f127f5e4a498e440f80ebbb。
这是旧接收状态，不是本次候选通过证据。

本地当前基线与该 M4 接收版本还存在 uv.lock、pnpm-lock.yaml、
pnpm-workspace.yaml 差异；本会话没有修改这些文件。runtime/frontend 镜像
指纹也不同。恢复连接后须按现有 fingerprint gate 判断是否需要 deploy，
不能跳过检查或将旧镜像证明为当前锁文件的运行证据。

## 恢复与操作者输入

- 恢复当前锁文件依赖的可信获取路径，再完成前端类型、定向 lint、Portal
  桌面浏览器与现有视觉契约；不要自动接受新截图基线。
- 恢复 Tailscale relay；若选择 direct 恢复路径，须由操作者明确指定，
  因 AGENTS.md 规定 direct fallback 只能由操作者选择。
- 当前源码重新完成候选 dispatch；必要时按指纹选择 deploy，运行本次相关
  focused 用例（含 PostgreSQL 并发），获取当前修订 status。仍只证明 candidate。
- 所有门禁完成后提供最终差异和基于模板的 PR 正文，再等待明确发布授权；
  merged 后按正常 clean-master promotion 接收，生产另行授权。
- 试用开始前仍需操作者确认预算已启用并覆盖实际 Provider、3–5 人名单、
  六条 Done、告知/ICP 与 T+0。当前没有真实周报或商业结论。

M4_OBSERVATION_RECEIPT date=2026-10-06; route=Pgy_status+Tailscale_relay_attempt; sync=not completed; focused=not occurred; promotion=not occurred; operations=sync_attempts:2,status:1,runtime_mutations:0; stable_502=not measured; m4_only=not measured; coordination=not occurred

## 蒲公英恢复尝试（2026-10-06）

操作者明确要求尝试贝锐蒲公英，选择 ADR-052 的
`muze@172.16.3.35` 与 `NPCINK_CLOUD_M4_SOURCE_TRANSFER_MODE=direct`。
未改脚本、网络配置、证书校验、依赖版本或锁文件。

1. 只读 status 成功；仍是历史 accepted PR 1061。
2. 当前 clean 候选 91c4bea72f9bcb47bb15b98a81f828000d8bd099 传输成功；
   sync 被依赖指纹门禁阻止，exit 42，明确要求 deploy。
3. 按门禁执行一次 deploy。Python 锁定依赖安装及 app import 检查通过；
   Python builder 依赖层日志耗时 1414.2 秒，不把它当作完整部署耗时。
   前端 frozen-lockfile 安装通过，445 个包复用缓存，日志耗时 3.4 秒。
   候选容器健康、Alembic head 校验与 Ollama ownership postflight 通过。
4. 在 M4 的 Python 3.14.7 上运行六个精确 pytest 节点，共 21 项：
   邮箱注册、QQ 注册、历史登录及生命周期保护、禁用/撤销保护、事务回滚、
   Addon 历史兜底，21 passed，5.32 秒。
5. M4 frontend 容器中的 `pnpm run type-check` 和本次十个变更文件的
   `pnpm exec eslint ... --max-warnings=0` 通过。未复用主工作树旧版 Next.js。

### 并发验证的两次失败及停止

现有 `m4:preview:test` 清除全部 `NPCINK_CLOUD_*` 环境变量，因此并发节点
会跳过。单独在受 operation.lock 保护的 M4 临时 api 容器中运行该节点，
保留已断言为 development / Docker postgres 的两个数据库环境值；未打印
数据库凭据。测试仅建立唯一临时 schema，finally 清理自身 schema。

最初的 stdin 运行器没有把 Python 脚本送入非交互容器，未运行 pytest，
其 exit 0 不作为测试通过证据。改为 `python -c` 后实际进行了两次测试：

- 第一次：1 failed，1.99 秒。四次登录均 authenticated，订阅和权益快照
  均只有一份；失败在期待一次 `subscription.bind` 审计、实际为零。
  `_audit_mixin.py::_record_service_audit_in_session` 在上下文为 None 时返回，
  QQ 正常登录 resolver 未提供审计上下文。
- 修正尝试本地提交 2e1e73e5f87cd94bacef223d1d5f239dd3c48bc0：给测试调用
  添加 ServiceAuditContext。Ruff I/F/E9、diff 检查通过；再次 source sync
  成功，全部镜像指纹相同、没有重建，frontend/worker/migration/proxy 操作跳过。
- 第二次：1 failed，2.05 秒。该 resolver 的实际签名不接受 `audit_context`，
  TypeError 发生在登录调用之前。此修正未核对方法签名，是开发会话的错误；
  提交 2e1e73e5 不是已验证的最终修复。

按操作者连续两次失败规则停止，不再修正或重试，不继续浏览器验收。
下一会话先恢复符合真实 resolver 签名的测试调用，核对 QQ 登录既有审计
契约，保留一份订阅/快照与额度、周期幂等的并发断言；若测试审计，应选择
实际支持审计上下文的入口，不为通过测试扩大公开接口。

### 当前证据与交接

- 最终只读 status：`acceptance_state=candidate`、`promotion_pr=none`、
  `source_revision=2e1e73e5f87cd94bacef223d1d5f239dd3c48bc0`、
  `source_branch=codex/free-registration-trial`、`source_dirty=false`；
  frontend_source_revision 仍为 91c4bea7，因 frontend 内容不变而复用。
  API/frontend/PostgreSQL/Redis/proxy 健康，首页和 health/live 均 200。
- 主工作树只读检查已安装 Playwright 1.59.1，与锁文件一致；仅在本工作树
  的 ignored node_modules 中临时链接这一测试运行器。第一次 NODE_PATH
  方式无法解析 ESM；链接后 `--list` 加载 16 个 Portal 用例，但没有执行
  浏览器断言或截图对比，不能称为 PC 验收通过。
- 本次创建的蒲公英前台 SSH 隧道已关闭，临时 Playwright 链接已移除；
  测试临时容器退出，operation.lock 正常释放。未解锁交付工作树。
- 本次记录修改仅为文档；M4 证据对应上述明确源码修订，未把记录提交
  宣称为新的运行验证。网络传输阻塞已恢复，当前阻塞是并发测试不正确及
  尚未执行的浏览器验收。本机完整依赖安装的 TLS 问题没有修复。
- PR 未创建、未合并、没有 clean-master promotion；M4 保持候选状态。
  开发付费调用 0，生产和支付配置未操作，T+0 未确定，试用未开始。

M4_OBSERVATION_RECEIPT date=2026-10-06; route=Pgy_direct; sync=completed_not_measured; focused=21_cases_5.32s,concurrency_failed_twice; promotion=not occurred; operations=sync:2,deploy:1,status:2; stable_502=not measured; m4_only=concurrency_test_fixture_failure; coordination=not occurred

# 免费试用与注册 Free 开发候选记录（2026-10-06）

Status: stopped after two consecutive final M4 sync failures, under the
operator's explicit stop rule. The repeated translation keys are corrected;
current c2abacdf compiled successfully but sync failed on an exited worker.
M4 API/frontend/proxy/workers are stopped by the existing failure cleanup;
PostgreSQL and Redis remain healthy. No PR, merge, accepted promotion,
production action or trial start is claimed. Keep the task worktree locked.

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

## 并发恢复及 Portal 浏览器验收（2026-10-06）

操作者同意继续修正并发测试、补齐浏览器验收；不包含发布 PR 的授权。
未修改业务代码、公共接口、数据库 schema、套餐或额度规则。

### 并发测试已通过

测试修正提交 ce3d037263fcc4496c186cd6e0e26310b411dfbd：QQ 正常登录 resolver
既不接收审计上下文，也没有必须生成 subscription.bind 审计的既有契约。
移除错误调用参数和该审计断言，改用真实权益断言。Barrier 同步四个登录
请求，重复两轮；两轮间模拟 50 credits 消耗，并将测试时钟推进三天。

- 变更 Python 质量门禁通过；本地 API 模块 106 passed、1 skipped，18.98 秒。
  唯一 skip 仍是本地没有 Docker PostgreSQL，不把它算作并发证明。
- 蒲公英 direct source sync 成功，source_dirty=false；全部镜像及配置指纹
  不变，没有重建，保留 frontend、worker、migration、proxy 的有效状态。
- 同一受限的 disposable PostgreSQL 用例实际运行：1 passed，1.94 秒。
  两轮全部登录 authenticated 且同一身份；仅一份 active Free、一份 active
  额度快照，30 天周期不变，预算 300、模拟使用 50、剩余 250；没有重复
  额度流水、Site、SiteApiKey 或 PaymentOrder。测试只清理自身临时 schema。

### 浏览器结果及停止

Playwright 1.59.1 与锁文件一致，仅复用其测试运行器；实际页面是 SSH
隧道 http://127.0.0.1:18010 对应的 M4 compiled frontend。API 使用现有
测试 mocks，不发起付费模型、付款、真实邮箱注册或 QQ 外部认证。

第一次执行 portal-login.spec.ts，max-failures=1：10 passed、1 failed、
5 did not run，48.1 秒。失败的无站点清单仍断言旧标题和旧说明，而当前
双语文案为“连接您的第一个站点”与“账户套餐和额度请查看上方信息”。
只更新这两条断言；站点连接链接、无付款要求、Free 与 300 可见断言保留。

第二次只运行失败及尚未运行的六项，复用首轮十项的有效证据：5 passed、
1 failed，28.3 秒。五项功能验证覆盖无站点 Free/300、Free 耗尽指向用量、
过期 session、桌面 Addon 返回参数、移动连接及显式账户确认。
共十五个不同功能用例通过，不能把两次命令称为全文件绿色。

最后一个视觉用例的桌面登录、桌面注册、移动登录截图检查通过；移动
注册截图失败：expected 390×1104，actual 390×1128。按连续两次失败规则
停止，不更新截图基线、不继续运行，也不扩展页面实现。

人工核对新旧图：Free 说明由两行变三行，新增 24px，未看到横向溢出或
遮挡。仅说明已观察到的当前中文初始状态，不替代完整视觉门禁。
审查同时发现 portal.register.request_desc 的旧措辞仍是“填写邮箱地址
创建账号；此步骤不会创建站点或发放服务额度”。它显示在请求验证码
阶段，该阶段确实不发额度，因此不是后端违约；但“创建账号”的措辞容易
与完成验证注册混淆。建议下一段统一为“填写邮箱获取验证码；验证成功后
获得 Free，注册不创建站点”，并更新 register 页的英文 fallback 和
public-entitlement-copy-contract 的相关覆盖，再人工核验截图基线。

### 当前交接

- M4 status：source_revision=ce3d037263fcc4496c186cd6e0e26310b411dfbd、
  source_branch=codex/free-registration-trial、source_dirty=false、
  acceptance_state=candidate、promotion_pr=none；HTTP 首页/health/live 200，
  容器健康。尚无 accepted/master/生产证据。
- 本轮仅同步一次、没有 deploy；并发证明 1.94 秒。旧前端类型与 lint
  证据对应未改变的页面及类型代码。最后两条浏览器断言在本地执行通过，
  收口提交不被声称已经再次同步；下一段改文案后需重新 dispatch。
- PNG 基线未改。新旧及 diff 图保存在本工作树 ignored 的
  .runtime/trial-visual-evidence/2026-10-06/，供本地复核，不作为 Git 交付。
  actual SHA-256：cda5243cb17bdae21a7fe309150b3406619fdabd2986c658c2afea9900ba24ba。
- 本轮隧道关闭、临时测试运行器链接移除，工作树继续锁定。
  PR 未创建、未合并，生产和支付配置未操作，付费调用 0，试用未启动。
- 余项：验证码阶段文案统一与契约覆盖、人工核验后的移动注册截图基线、
  当前最终修订重新同步及相关视觉用例通过；然后再提供最终差异/模板正文
  等待 PR 发布确认。T+0 前的预算、种子、六条 Done、告知/ICP 仍待操作者核实。

M4_OBSERVATION_RECEIPT date=2026-10-06; route=Pgy_direct; sync=completed_not_measured; focused=PG_concurrency_1.94s,15_browser_functional_cases_passed,mobile_visual_failed; promotion=not occurred; operations=sync:1,deploy:0,status:1; stable_502=not measured; m4_only=not occurred; coordination=not occurred

## 最终文案与视觉收口（2026-10-06）

操作者同意小范围收口并明确授权随后发布 PR、合并代码；不包含生产发布。
请求验证码说明改为“填写邮箱获取验证码；验证成功后获得 Free，注册不创建
站点”，中英文与 register 页兜底一致。验证码校验、公共会话及接口未改。
文案契约新增请求阶段与完成验证阶段的区别检查，翻译完整性仍为 1808 keys。

清洁候选 1dabae010d3475685bfcf60b946aa4d42d1dd3a8 经蒲公英 direct
同步到 M4。镜像输入不变，无 deploy 或镜像重建；前端源码改变按现有机制
更新 compiled frontend。M4 type-check 与所有变更前端源文件、测试的定向
ESLint 通过。作者核对 390px 移动注册截图：新说明、邮箱框、验证码按钮、
Free 提示及条款完整，scrollWidth 不大于 viewport，无溢出或遮挡。
只更新 portal-register-current-mobile-darwin.png，其他三张基线未改。

完整 portal-login.spec.ts 在 M4 页面经本会话 SSH 隧道执行：16 passed，
57.5 秒；包括桌面/移动登录及注册四张截图，未放宽 2% 比较阈值。使用已有
API mocks 和锁文件同版 Playwright 1.59.1，第三方付费调用 0。
变更 Python Ruff/mypy、Cloud anti-drift、release-policy、494/494 文档可达
检查通过。业务代码与已通过的 106 项 API、21 项 M4 focused 及真实 PostgreSQL
并发验证相同，未重复这些门禁。此前停止记录保留为历史，不代表当前阻塞。

集成测试、审查、发布及 M4 接收结果以之后的最终收口记录及 PR 为准；本次
截图与文档提交尚不能证明代码已合并或 M4 accepted。预算、种子、六条 Done、
告知/ICP 和 T+0 仍待操作者核实，试用未启动。

### 关联标识及集成检查

最终审查发现首页 public-onboarding-surface-contract 及服务端页面的激活标识
仍指向 Addon 激活口径。提交 2e924637915cb3c1775a3239626de874d998d68a
将页面 metadata、remote-smoke 的源码断言、对应契约统一为
registration-verified-free-activation-v2，并在 ADR-058 留档。未执行生产烟测，
未改变发布机制或配置；新增断言源码检查及 bash -n、变更 Python Ruff 通过。
增量 OCR 审查 0 findings（session a2d152d2-6acd-4ea5-bf62-6b0fb7696579）。

一次 M4 契约/领域集成检查覆盖 check:fast 的两个 suite：2125 passed、
13 skipped，544.99 秒。它对应同步的 1dabae01；后续的截图和文档不改变业务
代码，2e924637 只调整核验标识及相应单个契约断言，另做定向验证，不重复
整套 9 分钟检查。skip 不计作有效运行证明；PostgreSQL 并发使用此前已实际
通过的 disposable schema 验证，不能由这批 skip 推断通过。

记录集成结果时与最终源码打包发生重叠，sync 在本地 clean-source 门禁停止：
1 个文档脏路径，未传输或改动 M4。本次先提交记录再同步，不启用 dirty
旁路。此为本会话操作顺序错误，不是网络或业务故障。

### 合并前审查处理

完整 OCR 审查 session 463d14fa-c68f-430f-a36b-d3a767c8a1db 产生七项意见。
首页旧契约（high）已随 2e924637 修正；“Free 用量按钮缺少翻译”（medium）
经原文件和 Git 复核是误报，已有 en/zh-CN 两个键。额度耗尽浏览器用例
新增“查看用量”检查，保留原翻译。两处未生效的
fallback（low）恢复为与既有翻译一致；已生效的注册权益说明保持不变，
不为此再次调整布局或基线。

其余三项低优先级建议作为后续草案：

- 登录历史补齐的常见路径可加无锁订阅预检查，减少每次登录的锁和刷新；
  本轮仅 3–5 人且账户排序锁保证幂等，保留当前已实际验证的正确性路径。
- QQ/邮箱登录 resolver 尚未接收 audit_context，因此这两条历史账户补齐
  不生成 subscription.bind 审计；首次注册沿用既有审计上下文。本轮不扩展
  登录接口/审计流程，未来以 L2 任务补齐并验收审计，机制盘点注明限制。
- Portal 的 Free 判断与共享显示 helper 有重复的稳定标识；现有枚举与
  耗尽行为测试覆盖，两处共用 predicate 留到相关变更，不新增抽象。

上述后续均未列为本轮阻断或已实现，不据审查意见扩大业务、支付或生产范围。

审查误报纠正：git show 2e7a9290:frontend/src/lib/i18n.ts 在 3700/10029 行
已有 usage_action，且当时类型检查通过。本会话未先核实即新增了重复键，
差异复核及 M4 编译日志指出 TS1117；已在作者工作树移除重复，保留原值。
这是源代码可复现错误，不是 M4 特有缺陷，不把 ce1b45d9 的同步视为有效
前端证据。下一清洁候选须恢复 M4、通过类型/契约及中文耗尽按钮验证再发布。

## 本轮停止与准确交接（2026-10-06）

两次连续最终 sync 失败，按操作者确认的“同一阶段连续两次失败即停”停止。
没有继续运行 recover/deploy 或修改 M4 脚本，也没有发布或合并 PR。

1. ce1b45d9：重复翻译键导致 frontend TS1117、首页健康检查失败。已在作者
   源码提交 c2abacdf3b5bc82cefb582a77d70efbf76a0b717 修正，无重复键。
2. c2abacdf：蒲公英传输及 M4 Next production 编译成功，首页与 /health/live
   门禁通过后，服务门禁报 missing service: worker，退出 1；82.87 秒。
   前一次失败的 cleanup_remote 会停止 api/frontend/proxy 及三个 worker；
   本次选择性 sync 因 worker 源码未变跳过其启动/重启，导致服务门禁失败。
   这是 M4 选择性恢复路径的发现，不是 Free 业务缺陷；不在本轮修改运维脚本。

失败 cleanup 再次停止应用服务。只读 status 确认 PostgreSQL、Redis healthy；
api、frontend、proxy、worker、callback-worker、ops-worker 均 exited，HTTP
8010 的首页及健康检查为 000。last-deploy 仍保存上一次成功的 2e7a9290
candidate，不表示当前服务在运行。promotion_pr=none，不能宣称 accepted。
Ollama 现有管理服务仍运行，未调用模型或改配置。生产不受本轮操作影响。

恢复方案已是现成命令，不需要更改代码：[M4 runbook](../../../m4-preview-development-v1.md)
的 m4:preview:recover 启动已有容器。本会话尚未执行；操作者允许恢复后，
通过蒲公英执行一次 recover，核对健康，重新 dispatch 清洁候选，再完成新增
中文耗尽按钮、视觉、最终 type/lint、frontend contracts 及 marker 的定向验证。
复用通过的 106 API、真实 PG 并发、21 focused、2125 contract/domain 和此前
16 browser 证据；不重跑整套集成、不产生付费调用。若有第二个恢复失败，停止。

PR 发布/合并授权已存在，无需重复请求；待解除这次失败停止状态且最终候选
验收成功后，按模板及标准 publisher 发布，受保护检查通过后合并，再做
clean-master M4 接收。生产与 T+0 仍另行确认。

交接：/Users/muze/.codex/worktrees/free-registration-trial/npcink-ai-cloud，
codex/free-registration-trial，locked codex:free-registration-trial；业务代码、
计划、机制、截图及审查处理已本地提交。当前记录追加后只做 docs-only 收口，
不将该记录提交声称已经同步。未合并交付保留，不解锁或归档任务工作树。
本会话浏览器隧道和测试运行器链接已移除；未使用的临时接收 clone 删除。

M4_OBSERVATION_RECEIPT date=2026-10-06; route=Pgy_direct; sync=final_failed_82.87s; focused=contract_domain_544.99s,browser_57.5s; promotion=not occurred; operations=sync_attempts:5,successful_sync:2,deploy:0,status:1; stable_502=not measured; m4_only=selective_sync_skips_stopped_workers_after_failure_cleanup; coordination=not occurred

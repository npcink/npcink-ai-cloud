# Free 试用前生产发布准备（2026-10-06）

Status: repair PR #1074 merged; production preflight documentation candidate; production not approved or dispatched.

操作者同意先修正 Free 回归测试、核验反馈，再准备生产候选。本记录是准备
清单，不是部署完成、六条 Done 完成或试用启动声明。生产执行仍需针对最终
候选的明确授权，沿用 [生产发布策略](cloud-production-release-policy-v1.md)。

## 1. 本次修复与验证

聚焦注册即 Free 的验收：只改两个已有测试文件，不改业务源码、接口、
数据库、额度、支付、Provider 或 WordPress 配置。

- 修复前 master `e3f4a5d56e26c281f04b57da6c3c25ace5e663f1` 的
  [Cloud CI](https://github.com/npcink/npcink-ai-cloud/actions/runs/37442502099)
  backend-pytest (3) 实际执行并失败，两项断言仍要求注册无套餐、连接首次发 Free。
- 修改前在本地同样复现两项失败；不将其称为 flaky，也不以 PR #1073 的
  合并前证据代替该 master 推送的后端结果。
- Admin 注册用户列表应显示 Free / free，仍无站点；Web 注册→登录→连接测试
  确认注册即一份 active Free、一份 300 credits 快照、无 Site/密钥，连接时
  `free_entitlement_activated=false`，订阅、周期、快照不重复创建或重置。
- 两个完整测试文件：80 passed / 8.65s；已有 Python 环境执行隔离 SQLite
  测试，邮件为替身，无真实 Provider 调用。改动文件 Ruff I/F/E9 检查通过。
- `check:changed`：L2 / development / runtime none。测试与文档没有改变运行
  源码，因此不 sync/deploy M4，也不重复 Cloud 完整大套件。
- OCR 按配置排除测试与 Markdown，实际 reviewed=0；这不是独立审查通过。
  人工复核断言与 ADR-058、原 Free 绑定代码、已通过的注册专项测试一致，
  不跳过失败用例或修改业务规则来使测试通过。

[修复 PR #1074](https://github.com/npcink/npcink-ai-cloud/pull/1074) 经操作者明确
授权发布并于 2026-10-06 19:33:02（Asia/Shanghai）合并，master 为
`611668b7da319107df51e8c09c1db00884a6947b`。PR 必需检查通过；该 master
推送的 [Cloud CI](https://github.com/npcink/npcink-ai-cloud/actions/runs/37457150146)
实际执行四个 backend-pytest 分片且全部通过，整体 conclusion=success；
backend-static、frontend 和 PostgreSQL 回归 lane 也通过。跳过的生产镜像/
bundle lane 不作为生产证据。
[CodeQL](https://github.com/npcink/npcink-ai-cloud/actions/runs/37457150048) 已通过。
这次测试/文档修复自身的 release plan 为 `no_deploy`，不能据此将累计生产
promotion 判为无需部署。没有 M4 source sync/deploy，也没有生产操作。

## 2. 本地链路与反馈状态

完整记录见 [本地功能验收](history/engineering/2026/wordpress-local-functional-acceptance-2026-10-06.md)。
真实文章 6261 已关联标题展示、exact_hash_match 保存、成功 run 和 4 credits。
实际模型为本地 Ollama Qwen，不是第三方平台；仍不能计算试用 H3。

19:13:56（Asia/Shanghai）有 2 条编辑器质量事件和 4 条 journey 事件留在本地，
本次运行尚无对应 Cloud 接收或原生 agent_feedback。计划 Cron 为 19:52:21，
正常访问触发后才能核对接收；不手动 flush/Cron，不重新生成来凑数据。

源码进一步核实：Addon 的 `class-cloud-editor-assist-quality.php::emit_event`
使用 Observability Collector，投递 `/v1/observability/plugin-events`；展示/
保存匹配不是 `/v1/agent-feedback/events` 原生采纳事件。Cloud 的 plugin-events
存储路径也没有转换为原生 agent_feedback 的实现。因此自然上报成功只关闭
“观测事件接收”问题，不能自动关闭原清单 Done 6 或原定 H1 的原生采纳证据。

建议继续复用现有展示/保存观测和人工反馈，先核验数据到达；统计口径是否
正式采用该证据，或另开最小 L2 反馈任务，应由操作者确认。H1 40%、H2 50%、
H3 ¥5–7 均不改；人工记录、保存观察及原生反馈分别列示，不制造原生采纳。
真实标题十次、第三方执行、其余能力和六条 Done 的未知项继续显式保留。
本地文生图仍 no_eligible_model，参考图编辑暂缓；不宣称全部官方能力可用。

## 3. 生产范围快照

| 项目 | 本次只读核查结果 |
| --- | --- |
| master | `611668b7da319107df51e8c09c1db00884a6947b`，修复 PR #1074 已合入 |
| production 分支 | `b9d6f02d47fc2d393584d00309ff51dd72957ebd` |
| GitHub 最近成功部署 | [2026-08-23 部署记录](https://github.com/npcink/npcink-ai-cloud/actions/runs/32652661319)，对应上述 production SHA；本次服务器只读实测也确认该 SHA |
| 两树差异 | 803 文件：app 146、frontend 116、deploy 16、migrations 5、scripts 50、docs 305、tests 143，另有依赖/构建/流程文件 |
| 现有 release planner | `full`；后端镜像、前端镜像、migration、runtime config 均 required |
| branch 图 | production/master 各有独立历史，不能把直接合并两个分支当恢复方式 |
| 待冻结范围 | 上述干净 current master；正式恢复发布时重新核对远端和有意发布的累计范围，不能只按 Free 改动估算 |

累计范围包含 Portal/Admin、runtime/worker、Provider/routing、usage、观测、
Site Knowledge 和媒体等模块；本记录是清点，不是逐文件审查或全功能验收。
原始路径清单保存在本任务忽略目录。正式冻结前必须确认这些累计变化都是
本次有意发布的范围。当前暂停策略仍有效；本轮不创建 production PR。

Portal 旧暂停记录所述“仍未合入”的历史状态不能照搬：后续已有
[PR #865 恢复记录](history/portal/2026/portal-ui-restoration-and-delivery-retrospective-2026-08-25.md)。
恢复发布时核对当前 Portal 实现与最新 PC/响应式、多站点状态证据，缺项补
聚焦验收，不默认重写已合入的界面。旧 OpenSSL 例外已过期，不恢复例外，
最终 Linux/AMD64 镜像必须重新扫描并通过精确 bundle 验证。

## 4. 数据库与回滚

本次生产数据库只读实测 Alembic head 为 `20260817_0079`，以下五项迁移
尚待执行。核查使用只读事务，未创建表、迁移或更改配置。

| 迁移 | 内容与风险 |
| --- | --- |
| 0080 | 新建 catalog capability evidence 表及索引 |
| 0081 | Run 增加 worker_eligible_at 和索引 |
| 0082 | 合并视觉 profile/binding，重写 Provider 的 runtime_profile_ids，删除旧路由；downgrade 为 pass，数据合并不自动恢复 |
| 0083 | Run/Provider 统计窗口复合索引；耗时及锁影响须按实际表量验证 |
| 0084 | Provider budget counters/claims 新表及索引；建表不等于预算已启用和配置 |

只读结果如下，未输出凭据或客户内容：

- current 为托管 symlink，指向 `release-97bae233cba6c396-20260823164630-2404`；
  bundle manifest 的 source revision 为 `b9d6f02d47fc2d393584d00309ff51dd72957ebd`。
  安装状态 complete，完成标记存在，无 pending marker 或部署锁。
- PostgreSQL 18.3；连接 SSL 已启用，配置使用 `sslmode=verify-full`。
  三个新表 catalog_capability_evidence、provider_budget_counters、
  provider_budget_claims 均不存在，与待执行迁移一致；这不是完整 schema drift 验收。
- 官方 ownership inventory 状态 passed，违规和警告均为零；1 个账户、1 个身份、
  1 个成员关系、2 个站点（1 个 active）、2 个 binding（1 个 valid current），
  无多用户账户。未自动推断或重新绑定归属。
- api、callback-worker、frontend、ops-worker、proxy、redis、worker 均 running；
  frontend、redis 报告 healthy，其余 health 字段为空。这不是所有端点或模型
  的健康验收，也没有发起付费调用。
- 当前 target images map 存在，rollback images map 不存在；主机本地备份目录
  存在但为空，不据此推断 RDS 无备份。
- 操作者在本会话确认：RDS 有备份并已验证独立恢复；生产服务器与数据库均有
  快照备份。此项是操作者确认，agent 未执行恢复，也未核验快照标识、时间、
  恢复演练记录或与本次发布的匹配关系。

保持 protected structured configuration 的边界，不输出凭据；按
[发布检查清单](../deploy/RELEASE_CHECKLIST.md)确认候选数据库预检、匹配的配置、
备份/校验和及独立恢复演练。

回滚必须绑定“当前实测 release + protected configuration + RDS restore point”。
`b9d6f02d` 已确认为当前运行源码版本；部署前仍须绑定匹配的快照/恢复点、
配置及镜像，不能仅凭源码 SHA 声称完整回滚已就绪。0082 存在不可逆数据变更，
不得仅执行 downgrade 或让旧代码直接连接已迁移数据库。发生迁移后问题时，
遵守既有停止/恢复流程，评估匹配备份恢复或另行评审的 forward fix。

## 5. 按顺序完成的发布门槛

1. 修复 PR 经授权发布、必需检查通过、合入 master，并核对该 SHA 的后端 CI。
2. 关闭可关闭的本地验收项；自然观测接收与原生反馈缺口分别收口。实际
   第三方模型和当前开放能力有有效证据，图片未就绪时明确暂不可用。
3. 刷新服务器现状及完整差异，确认发布范围；付费 Provider 已武装日/月硬
   上限。支付不启用、不充值、不自动转收费，不触碰支付域配置；历史清单
   中收费阶段的真实支付验证不引入本次免费试用。
4. 冻结最终 master 树与当前 production 父节点，准备新的单父 promotion；
   不复用旧已关闭 PR、不将生产独有历史合回 master、不在冻结后夹带新修复。
5. 按实际分类运行 fresh production CI、Linux/AMD64 构建/扫描、精确 bundle
   replay、数据库预检、证据绑定和发布前预检；不因当前源测试绿色跳过。
6. 给操作者最终 production SHA、完整差异、验证结果、迁移方案、受影响运行
   范围、确认回滚点、耗时估计及待授权的确切操作。准备/核查阶段不更新服务器。
7. 明确恢复发布并授权实际部署后，才 dispatch/cutover；完成健康、账号 Free、
   站点连接、真实正常使用与观测核验，独立记录生产 timing receipt。
8. 生产可用后由操作者找 3–5 人试用、收齐前置项并指定 T+0，不以本记录日期启动。

本次没有镜像构建、上传、迁移或切换，故预计部署时长尚未测定；发布前按最终
bundle 与数据库规模给出估计。原始证据在任务 `.runtime/local-acceptance/`。

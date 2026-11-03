# 冻结 Cloud 发布收尾、开发经验与验收交接 — 2026-10-18

Status: dated deployment evidence and pending acceptance handoff; not current
runtime authority, new production authorization, or completed user acceptance.

本记录把本地发布回执转为可随 Git 交接的证据摘要。结论是：冻结 Cloud 版本
已部署、普通运行门禁通过；正式认证 smoke、真实写作及配套 Addon 的生产验收
仍待操作者完成。本文及索引的合并不需要再次部署，也不改变生产配置。

## 1. 已部署的精确范围与证据

| 项目 | 已核对事实 |
| --- | --- |
| 生产源码 | `4a0a305ed116d0b1de99bb7bdba79d67e3b14e55`，树`f2c6fa972af90954311dd2ede40ce0630502c980` |
| 审核范围 | 原91个路径 + Milvus隔离3个路径 = 94个应用路径；累计发布核算工具另7个，完整并集101个；排除PR #1133、迁移0088、PR #1137 |
| 修复及提升 | [#1134](https://github.com/npcink/npcink-ai-cloud/pull/1134)隔离Milvus构造异常；[#1135](https://github.com/npcink/npcink-ai-cloud/pull/1135)修复累计发布基线及保留镜像保护；[#1136](https://github.com/npcink/npcink-ai-cloud/pull/1136)提升隔离生产候选 |
| 必需证据 | 生产PR CI [39030999610](https://github.com/npcink/npcink-ai-cloud/actions/runs/39030999610)实际执行后端分片；精确生产push CI [39031579922](https://github.com/npcink/npcink-ai-cloud/actions/runs/39031579922)复用匹配PR树的证据；CodeQL [39031579991](https://github.com/npcink/npcink-ai-cloud/actions/runs/39031579991)成功 |
| 正式制品 | bundle artifact `12100602845`；计划artifact `12100950090`；包SHA256 `0d266295f1f006c5e9b019dc467148dffa26b8dd09d81870a28997ffe216066d` |
| 安全门禁 | Linux/AMD64 Grype/Syft门禁通过；API新扫，另3份扫描按身份/时效复用；未豁免阻断项0。Redis7项、Nginx10项为既有2026-10-25 UTC到期豁免，不是零漏洞 |
| 部署 | [Deploy Production 39049119345](https://github.com/npcink/npcink-ai-cloud/actions/runs/39049119345)成功；北京时间10月18日00:22:26派发，job 00:22:31—00:27:32，5分1秒 |
| 安装及运行 | `installation_state=complete`，新发布目录`release-0d266295f1f006c5-20261017162317-2177`；清单与正式包逐字节摘要一致，7角色镜像及保护映射一致，部署锁已清理 |
| 数据库 | 只读查询为PG18，迁移头`20261008_0087`，没有0088；全量发布执行规定的Alembic检查，没有新增迁移 |
| 健康边界 | 运行就绪、worker稳定性/心跳、小客户公开入口预检通过；两次容器快照重启计数均0；前后端健康及两个登录页HTTP200。没有Docker healthcheck的角色不能称为Docker healthy |

这是一次full前后端和运行载荷更新，不能缩称为只有Milvus三文件热修。源码分支、
安装清单、镜像ID、数据库与健康各自核对；不同组件合法复用镜像时，不单凭
页面Git SHA判断遗漏。后续master修复不自动进入此冻结版本。

部署前备份由操作者确认：通过其他方法完成且就绪。此前控制台未匹配的记录
没有冒充生产备份；agent未独立恢复验证。本次部署1次，模型调用0，未手工
修改SMTP、Provider预算、凭据或Zilliz配置，未安装或发布Addon。

### Provider目录降级须继续交接

best-effort目录刷新中，`deepseek`、`openai`、`siliconflow`成功，`qwen`返回
`http_404`。系统按[ADR-059](../../../decisions/059-provider-refresh-advisory-release.md)
保留历史目录，运行就绪明确报告degraded。没有自动重试或修改Qwen配置。
目录失败不等于已查清真实生成失败；目录成功也不证明推理可用。若主/回退链
使用Qwen，先核对连接和目录API支持，不通过反复生成或关闭预算保护排查。

## 2. 回退资产：切换前与成功清理后分别记

切换前旧current源`2af00741a2ce06ea56a78e62864d4a35d86c66ab`、保留后端
`982b132d630bf263cedb4f5b1716a7541c1dd251`的7角色镜像齐备。新旧归档重新
校验一致。旧两份完整归档摘要为：

- 2af包：`e15b6dfda45352228f2f534b9703420f9016e765b5b8f7c093a75059dc2b0b16`。
- 982包：`90b91f9d14830b7fae50ae4fc6f23edcab746b83eeb424de4d9c51d49280539a`。

成功后既有脚本清理临时回退标签，旧API/worker及前端镜像不再驻留本机；
旧目录和受保护env仍保留，已校验完整归档保存在操作者本地私有回执中。
**回退需要重新验证并装载归档，不能仅切换current链接。** 原始归档及受保护
配置不上传公开文档；需要恢复时由操作者从私有资产中按摘要定位并先确认可读。

恢复须按[发布政策](../../../cloud-production-release-policy-v1.md)确认旧应用、
配置、数据库兼容及完整镜像组合，受管暂停写入、验证后最后恢复流量。不能把
旧frontend局部计划直接覆盖当前full发布，也不手改包、强推或重置分支。
本轮没有演练归档回退，耗时未测量；数据库恢复另需匹配备份及明确恢复授权。

## 3. 开发经验与既有规范落点

| 暴露的问题 | 固化的执行规则及落点 |
| --- | --- |
| 提升过production却未部署，按上一push计算会漏累计改动 | 以已证明成功的runtime部署为基线，列出94应用+7工具的完整并集；见[发布政策](../../../cloud-production-release-policy-v1.md)累计基线段及#1135 |
| 单个Milvus连接异常令整个worker退出 | 连接构造异常转为任务安全失败，不吞BaseException；验证后续队列继续运行，不制造真实模型调用；见#1134 |
| 图片验证阻断文字配置，列表与弹窗各有状态真相 | 单项保存只校验所改组，共用能力/健康判断；见[运行配置验收记录](../../../runtime-configuration-acceptance-2026-10-17.md)及#1129 |
| 生产才发现异步状态和失败恢复问题 | 复用`verify:local -- --critical`，Fake API和Mock浏览器拦截已知缺陷；真实容器归M4，生产保留环境差异和真人验证；见[关键回归规范](../../../local-critical-regression-v1.md) |
| 重复构建、重扫或重跑整套检查拖慢发布 | 证据绑定版本、树、包、平台和目标状态，失败只补相应边界；见[开发与验证模型](../../../development-validation-operating-model-v1.md)及发布政策 |
| 模板、目录、健康、部署绿色被误当用户闭环 | 分列源码、配置、外部结果、人工采用、原生反馈；见[Portal规范第15节](../../../cloud-portal-customer-workspace-ui-standard-v1.md#15-ordinary-site-owner-acceptance-and-handoff) |
| 备份及回退的早期核对被当作永远有效 | 区分操作者确认与独立验证、切换前缓存与成功后清理；不把只读脚本字段假设当事实，也不为核对脚本错误重部署 |
| 旧会话结束导致验收任务失联 | 历史记录保留日期与限制，索引指向当前交接台账；聊天归档不等于验收通过，也不授权清理其他会话工作树 |

本轮没有新架构决策，不另建ADR或第二套发布/验收机制。Cloud继续拥有托管
执行及证据，WordPress继续拥有审阅、采用和最终写入；沿用既有边界规范。

## 4. 未完成验收台账及下一步

| 项目 | 截至本记录的状态 | 负责人及完成标准 |
| --- | --- | --- |
| 注册邮件、验证、Free和站点连接 | 操作者10月17日已确认收件、注册验证、重新登录及站点连接成功；Free显示300积分、1站点 | 保留原人工回执，不再泛称SMTP全未验证；邮箱更换、完整SMTP路径及升级后界面未因此全部通过 |
| 运行配置隔离、状态一致、预算下拉 | 已进入冻结部署；代码/零付费证据通过，未收到本次上线后的完整人工回执 | 操作者核对单项保存、失败状态和下拉；不点击可能计费的能力验证代替零付费检查 |
| Provider预算及Qwen目录 | 预算实现已交付，实际主/回退覆盖仍需核对；Qwen目录404 | 操作者按canonical Provider ID核对预算及所有可能回退Provider；开发侧只读定位，不自动修改连接或关闭保护 |
| Addon0.4.2配套 | 源码候选`6380e25ebf585bc5564f362437c5a2571ef0e04c`及ZIP已校验；未代为安装或发布WordPress.org | 操作者备份测试站实际插件/设置后升级，核对官方AI插件安装/启用引导、站点连接及知识库用量/错误；Cloud部署不等于插件已升级 |
| 正式认证Release Smoke | deferred，不是passed；部署前secret名称预检仅缺单次Portal登录码 | 操作者预算就绪后临执行申请新码，走受保护secret路径，从production绑定完整4a SHA执行；含真实runtime请求，不属于本轮零付费授权 |
| 一次真实写作 | 10月17日曾反馈生成失败；部署后尚无成功闭环回执，旧文字错误为上游不可用，不能声称根因已完全查清 | 操作者生成一次短文字→人工采用→保存草稿→刷新回读；开发侧核对run、实际模型、积分、成本和失败证据 |
| 自然原生反馈及站长试用 | 反馈生产者已实现，不等于自然投递已验收；3人4周试用T+0尚无记录 | 闭环通过后核对原生反馈关联、去重及隐私，再按既有试用计划邀请；不伪造事件或为取数重复生成 |
| 镜像安全维护 | 本包17项时限豁免截至2026-10-25 UTC | 开发侧在到期前独立核对上游修复及精确镜像门禁；本文不续期、不隐含授权新生产部署 |

操作者按[生产验收步骤](../../../portal-production-validation-runbook-2026-10-16.md)
与[运行配置清单](../../../runtime-configuration-acceptance-2026-10-17.md)执行。
Addon候选ZIP摘要为`3ff923bc0f75098280de19a5b3b4842662c57b0b0e687610a7c83727cf95cc04`；
分发包从操作者私有交接取得，不把本机绝对路径写成可移植仓库依赖。

反馈统一记录北京时间、页面/步骤、错误原文、run/trace（未显示则注明）、
实际Provider/模型、前后积分、草稿状态及脱敏截图；不发送密钥、Cookie、
验证码或完整文章。失败停止连续重试，开发侧不为取证重新调用模型。

独立Release Smoke输入：`expected_deployed_sha`为本记录完整4a SHA，
`base_url=https://cloud.npc.ink`。本次Free受控验收可选
`require_alipay_enabled=false`，正式付费试用依现行清单选true；二者证据分开。
验证码默认10分钟、单次使用。小客户预检步骤未注入专用smoke凭据，其日志
多项missing不等于GitHub secrets均不存在；正式流程须按受保护预检确认。

## 5. 旧会话归档与后续归属

历史入口为[三会话综合纪要](../../portal/2026/portal-three-session-synthesis-and-next-stage-2026-10-17.md)。
其中“关键回归待实现”是当日快照，后续已通过#1126/#1129落实为
`verify:local -- --critical`，不另加历史提议中的`verify:local-critical`命令。

操作者已同意：本记录和索引经PR合并后，将以下两个旧会话归档，当前会话
`01a1429e-69d0-7be3-b432-63784b51a8ab`继续跟进上表生产验收：

- `01a12e1b-39e3-7843-a7cd-64830a0f813a`：后续检查、发布和验证前移讨论。
- `01a11591-f0dd-7f82-bd6c-be1e6a5dbccc`：普通站长用户中心优化。

本节记录归档条件，不提前宣称归档已执行；实际归档以工具回执为准。
归档不关闭未验收事项、不删除分支或工作树、不覆盖其他会话未提交代码。

## 6. 自然观察耗时

部署timing artifact与成功工作流绑定。类别合计去重后：包校验7秒、传输76秒、
镜像装载75秒、迁移类11秒、切换类51秒、健康类16秒、其他1秒，总计237秒；
远端sequence包裹162秒不能再相加。用户可见中断未连续采样，不能用切换类
51秒代替。发布job5分1秒是一次自然样本，不是持续性能承诺。

RELEASE_TIMING_RECEIPT fix=not measured; local=80.56s+focused0.60s+candidate6.97s retained; master_pr_ci=588s; master_merge=2026-10-17 19:57:42 CST/duration not measured; production_pr_preparation=not measured; production_pr_ci=537s; operator_wait=not measured; bundle_build_scan=217s retained; transfer=76s; host_cutover=51s category/remote sequence162s; health=16s category; repeated_broad_ci=0 during deploy, prior2 update waves/same-SHA manual rerun0; deployment_attempts=1; final=deployed4a/complete/ordinary gates passed, qwen catalog degraded, formal smoke and writing deferred.

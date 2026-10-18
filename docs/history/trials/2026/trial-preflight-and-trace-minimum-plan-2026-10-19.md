# 阶段1零模型预检、试用前核对与最小Trace接入方案 — 2026-10-19

Status: dated production preflight evidence and proposed trace plan.
零模型预检未通过；最小Trace方案待操作者选择，未配置、未部署、未执行正式smoke。

## 1. 已保存的历史文档与本轮范围

操作者已确认先保存三会话整理文档，再执行零模型预检及试用前核对，确认就绪后
正式smoke复验。随后选择“先给我最小接入方案，再决定是否配置”。

[三会话纪要](../../strategy/2026/three-chat-synthesis-and-continuation-2026-10-19.md)及其
两个入口已独立保存为提交 `0913a8fe3a75bd03130649718faa30b627769a32`，
共3个文档、270行。分支为`codex/trial-smoke-preflight-20261019`，以已合并master
`ef9e5dfd40ed72f009386645da930030835d92ad`为基线；该基线包含工具修复#1148。
当前分支只增加文档，没有修改验收脚本。

原共享工作区同时有功能暂停任务提交，曾将三份整理文档一起纳入`b7f4252b`；
本次保留该历史，并在隔离工作树创建上述文档独立提交，没有重写其他任务提交。
隔离工作树已锁定为`codex:trial-smoke-preflight-20261019`。

本轮生产操作限只读SSH/HTTP及一次canonical零模型预检。付费调用、构建、
部署、M4操作、OTP请求及生产配置修改均为0。

## 2. 零模型预检：已执行一次，未通过

| 事项 | 证据 |
| --- | --- |
| 工具基线 | 已合并#1148，`ef9e5dfd`；本地`0913a8fe`与其deploy脚本及smoke workflow无差异 |
| 生产完整SHA | `b8cc6049da7d1c33cbfffc9f8e5521f332a1adb5` |
| 部署身份 | 成功[Deploy Production 39122857578](https://github.com/npcink/npcink-ai-cloud/actions/runs/39122857578)；live及SSH安装清单一致 |
| 安装目录 | `release-641bf54c7c2a0524-20261018112143-2192`，预检前后未变化 |
| 时间 | 北京时间2026-10-19 03:37:38—03:37:43，入口包裹约4.69秒；不代表全部核对耗时 |
| 入口 | 已合并的with-smoke-internal-tunnel包装器调用small-customer-trial-preflight，携带require-smoke-env、run-release-smoke、preflight-only |
| 试用支付口径 | 未要求Alipay启用，只核对现有公开callback安全行为；当前callback已启用且拒绝空/未签名notify，本轮未修改支付设置 |
| 本次首个失败 | `formal HTTPS release smoke requires an external OTLP exporter (expected true, got false)` |
| 执行次数 | 预检1次、自动重试0次、完整正式smoke 0次 |
| 计量前后 | Provider调用334→334，run 801→801，积分流水62→62，三项增量均0 |
| 清理 | 临时SSH通道与临时目录已清理；没有持久登录cookie、没有请求验证码 |

canonical脚本依次通过公网live、首页、Portal/Admin入口、受保护Admin设置、
支付callback安全行为及纯预检凭据检查，越过此前的Host/HTTPS来源问题。
执行已走到外部OTLP断言；因此此前的内部ready、operational-ready、worker缺失、
cadence新鲜度、Provider新鲜度和callback压力断言均通过。前段成功证据保留，
整体预检仍为失败。

独立只读设置核对确认：
`otel_exporter_otlp_endpoint_configured=false`，
`otel_trace_query_url_configured=false`。
没有用虚构URL、HTTP替代HTTPS、关闭断言或开放内部端点来获得绿色结果。

完整登录、HMAC runtime凭据及OTP不属于本次纯预检，不声明这些值已验证有效。
完整正式smoke保持未通过，待Trace就绪和新OTP准备后再按既有流程复验。
执行规则见[正式验收入口](../../../formal-release-smoke-entry-v1.md)。

## 3. 试用前核对结果

### 已有证据

- 生产公开首页、登录与注册入口可访问。PC浏览器实际页面显示：
  Free为¥0/30天、300用量、1个站点；注册页说明验证成功即获Free，注册不创建站点。
  本轮未发送邮件或新建账户。
- 已有真实标题run仍为succeeded；关联账户权益快照为active、300积分、1个站点。
  人工采用、保存、刷新回读复用[原生产记录](../../production/2026/deepseek-title-production-acceptance-2026-10-19.md)。
- **此前“原生反馈尚未查到”已有进展**：同一标题run现有1条
  `agent.feedback`，event 2005，接收时间北京时间00:47:14；
  `source_run_id`匹配，`source_runtime=editor_assist`，
  `local_surface=wordpress_ai_editor`，`local_outcome=accepted`，
  `redaction_status=metadata_only`，有dedupe key。
  本轮只读核对标识、声明及payload键名，没有读取operator_note、文章或模型正文。
  顶层未见所检查的正文/prompt/token等禁用键；不据此冒充全递归隐私审计。
- Provider预算保护已启用、缺配置要求拒绝。DeepSeek、OpenAI、SiliconFlow
  均日USD5、月USD100，当前未达到上限；不是供应商账单核验。
- WordPress短文字、正文编辑、分类三个静态binding的候选Provider均有预算覆盖；
  文生图binding的SiliconFlow候选也有覆盖。这里只证明配置，不新发模型请求。

### 仍需保留的缺口

| 项目 | 本轮所见与处理 |
| --- | --- |
| 原生采纳覆盖 | 单个标题accepted事件已关联，不等于所有建议的展示分母、完整去重覆盖及H1≥40%已证明；不把缺失当拒绝 |
| 正式smoke默认profile | text.balanced静态绑定98个候选，包含未配置预算的Qwen；覆盖缺失时现有保护会在分发前拒绝，未证明Qwen实际回退可用。不自动修改路由、预算或把绑定列表称为最终动态执行顺序 |
| 全连接预算投影 | missing_config列出apify、pexels、pixabay、qwen、unsplash、zilliz；各服务用途不同，不能将这六项都直接称为标题付费路径缺陷。实施前按拟用路径分类，不能宣称全平台已覆盖 |
| 能力支持声明 | vision.ai与wp-ai.audio-generation当前绑定为空；参考图编辑仍暂缓。不能邀请时笼统承诺官方插件所有能力已可用；目录healthy也不是推理成功证据 |
| 历史健康窗口 | 短文字/分类候选仍有degraded标签；新标题成功不要求清空历史窗口，回退和其他能力另需实际证据 |
| 告知与ICP展示 | 实际观察的首页、登录、注册页未见ICP备案号或参考图不可用告知；这是页面展示核对，不是域名是否已备案的法律结论。邀请前由操作者核对实际备案信息，并给参与者简短范围告知 |
| 六条Done | 复用已有受控错误/写入/幂等测试和真实标题证据；尚未以本轮只读核对证明“自然真实使用不少于10次”及所有反馈覆盖，不为凑数连续调用Provider |
| 观察队列与T+0 | 尚无首批3人正式邀请、固定队列和起点证据，保持未启动；不生成虚构周报 |
| 第三方实际成本 | 本轮只见Cloud预算与计量，供应商消费明细及分摊仍由正常试用取得 |

试用继续沿用[既定四周计划](../../../trial-stage-commercial-validation-plan-2026-10-06.md)，
不新建试用后台、每周配额或新的观测系统。本轮没有自动补齐上述配置或功能。

## 4. 最小Trace方案：复用现有SDK，接入一个外部服务

### 目标与边界

让已有Cloud HTTP trace能够导出，并在查询页找到一条新trace，补齐现行正式验收
的外部观测要求。第一期只复用现有埋点，不新增日志/指标平台、告警看板、
模型全文采集、WordPress埋点或worker全链路改造。

生产Compose已有规定不捆绑Jaeger、otel-collector或trace store；本方案沿用该边界，
不把已退役容器重新加入Cloud运行栈，也不占用M4。

建议顺序：

1. 若已有兼容OTLP/HTTP的外部服务，优先复用。
2. 若没有，可评估Grafana Cloud Traces作为托管候选，先确认账号、地域可达性、
   数据接收范围、保留与额度，再决定。此处没有开账户、购买或承诺免费费用。
3. 第一轮小规模接入可评估现有Python SDK直接HTTPS导出，减少自运维组件。
   Grafana官方将直连定位为quickstart；其生产推荐为Collector，直连的传输可靠性
   与集中处理能力较弱。这里的取舍是本项目初期最小接入建议，不是供应商生产推荐。

### 实际需要准备的三项

| 输入 | 接入位置与要求 |
| --- | --- |
| Trace专用OTLP/HTTP完整URL | 现有NPCINK_CLOUD_OTEL_EXPORTER_OTLP_ENDPOINT；通常包含/v1/traces，按供应商实际URL填写 |
| 运营人员查询页URL | 现有NPCINK_CLOUD_OTEL_TRACE_QUERY_URL；指向受登录保护的trace查询入口，不放token在URL |
| 专用写入凭据（服务要求时） | 最小写入权限，沿受保护配置注入；不放聊天、Git、argv或.env.deploy，不复用模型/管理员密钥 |

一个重要限制：**不能承诺只填两个URL就完成托管服务接入。**
当前[tracing实现](../../../../app/core/tracing.py)已使用OTLP/HTTP与批量exporter，
但应用设置中只有两项地址，没有专用认证配置；现行受管启动路径尚未证明能够
安全注入供应商所需的认证头。SDK本身支持OTLP认证headers，应用部署接线仍需核对。

因此，选定服务后先核对其认证要求与既有受保护注入链。若需要新增认证支持，
另列一个仅覆盖认证注入、隐私/失败回归及对应运行文档的L2小改动，完成必要候选、
合并和发布步骤；不往URL塞secret、不在服务器临时改源码、不借本次预检绕过发布门禁。
具体文件范围和运行影响在服务选定后给出，不预先宣称是纯配置任务。

地址配置位于启动时读取的settings，exporter也在进程启动时初始化。真正启用涉及
受控应用进程重建/重启，届时单独列影响范围、预计窗口和恢复原空配置的方法。
本轮没有这些运行操作授权，也未执行。

### 最少验证动作

1. 核对两个地址与认证路径，完成零付费源码/传输测试；确认输出仅含既有
   HTTP方法、路径、状态、服务和时间等元数据，不扩展到正文、prompt或密钥。
2. 配置批准生效后，发送一次带新W3C traceparent的正常GET /health/live。
   项目已有context提取及HTTP span，按预先确定的trace ID在外部服务回读，
   证明“新数据确实到达”，不靠布尔configured字段代替实际成功。
   该动作不请求AI模型，也不需要OTP；保留trace ID、时间和查询证据。
3. 零模型预检再运行一次；仅在配置变化后重测，不重复当前失败版本。
4. Trace及其余正式前置项通过后，准备新OTP，执行一次完整canonical smoke；
   失败即停，核对可能已执行的模型及账本增量，不自动重跑。

Trace查询URL当前只作为配置事实展示；应用不会因为填入URL就验证查询服务可用。
单个HTTP trace也不代表所有模型/worker内部跨度已经可见。

### 依据与回退

- 项目实现：[HTTP trace中间件](../../../../app/api/main.py)、
  [现有exporter](../../../../app/core/tracing.py)、
  [生产OTLP边界](../../../../deploy/PRODUCTION_GITHUB_DEPLOY.md)、
  [正式验收入口](../../../formal-release-smoke-entry-v1.md)。
- [Grafana Cloud OTLP官方说明](https://grafana.com/docs/grafana-cloud/send-data/otlp/send-data-otlp/)
  支持SDK直连、认证输入及完整signal路径，并列出与Collector方案的区别。
- [OpenTelemetry配置说明](https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/)
  说明HTTP traces endpoint与headers。以上外部资料核对日期为2026-10-19。

配置阶段的恢复目标是恢复原先未启用export的配置及匹配应用版本，重建受影响进程后
核对健康。若有认证源代码改动，则通过独立revert/发布路径处理。恢复并不使正式smoke
变为通过。普通标题已通过的真实写作证据保持有效，Trace阻塞单独记录。

## 5. 保存、预算与后续

本轮预检和查询脱敏回执位于操作者本地受保护目录：
`~/.codex/task-receipts/npcink-ai-cloud/2026-10-19-trial-preflight-continuation/`。
内部token仅在SSH捕获与子进程内存间使用，未写入回执。该目录不是跨环境依赖。

操作者当前选择是先审阅最小Trace方案，再决定配置。下一阶段是选择已有服务或
具体托管接入，核对认证与受控运行影响；正式smoke继续等待，不提前索取OTP。

本记录与入口按documentation-only门禁验证并独立提交；不因此发布PR、合并到master
或部署。回退仅撤回本次文档差异；历史独立提交0913a8fe继续保留。

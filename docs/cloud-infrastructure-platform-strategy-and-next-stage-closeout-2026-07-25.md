# 云基础设施、平台战略与下一阶段收尾 — 2026-07-25

## 状态

项目历史归纳、决策索引与执行交接记录。

本文把服务器性能与 CPU、x86/ARM、RDS、PostgreSQL 16/18、FC/OSS
图片处理、内容安全、多平台扩展、产品目标和当前项目状态串成一条可执行的
决策链，供后续采购、试用和开发时快速恢复上下文。

本文不是新的生产授权、GA 授权、采购报价、法律意见、云资源开通授权或
Provider 调用授权，也不取代现有 ADR、边界文档、受保护的 `master`、
生产发布政策和日期更晚的状态权威。历史主机、价格和规格观察均为日期化
证据，采购前必须重新核验。

本文不记录服务器地址、密码、令牌、数据库凭据、Provider 密钥、用户原图
或生成内容。

## 一句话结论

当前项目不缺新的技术栈或更多平台代码，缺的是在安全门槛关闭后，用极小的
真实编辑者样本证明：

```text
现有 WordPress -> Cloud -> Provider -> WordPress 审阅与本地保存闭环
确实能稳定节省时间、产生可接受结果，并且成本和支持负担可控。
```

因此当前主线不是换 ARM、换语言、迁移 FC、并行开发多个 CMS 或继续重构，
而是：

1. 先关闭 Python 3.14.6 镜像 CVE 例外；
2. 再做一次有预算上限的真实编辑者观察；
3. 根据证据明确作出 `go / modify / hold / stop` 决定；
4. 只有 WordPress 价值成立后，才考虑一个 Typecho 薄适配器验证。

## 历史问题如何收敛为当前决策

### 1. 服务器性能与 CPU

2026-07-20 的只读生产快照记录了：

- 实例为 `ecs.e-c1m2.large`；
- 客户机架构为 `x86_64`，`2 vCPU / 4 GiB`；
- 当时呈现的 CPU 为 Intel Xeon Platinum，约 `2.5 GHz`；
- CPU 约 `94%-98%` 空闲，无 I/O wait、steal、容器重启或 OOM；
- 当时运行量和图片衍生任务量都很低。

这证明该实例足以承载当时的低流量验证，不证明正式多用户并发能力。共享型
实例显示的宿主 CPU 型号也不是采购后长期不变的保证；实例族的稳定性、网络
和磁盘能力，以及应用实测结果，比一次 `lscpu` 品牌字符串更有意义。

当前采购方向是：

- 有界试用可以继续使用现有 `2 vCPU / 4 GiB`，避免在需求未出现前升级；
- 如果准备承载正式用户并需要新购或升级，默认评估稳定计算型或通用型
  `x86_64 4 vCPU / 8 GiB` 作为起点；
- 具体实例族只能在购买前根据区域库存、价格、网络、云盘和一轮同版本
  压测重新选择；
- 不因为开发设备是 Apple Silicon MBA 就购买 ARM 服务器。

### 2. MBA 是 ARM，不等于服务器必须是 ARM

开发机架构只决定本地构建和验证方式，不决定生产采购。

当前项目已经存在 `linux/arm64` 工程证据，同时受控生产发布记录使用
`linux/amd64`。这说明项目能够处理多架构交付，但两者的证据层级不能互换。

当前默认选择 `x86_64` 的原因是：

- 受控生产运行和发布链已有 AMD64 证据；
- Python、系统库、图片编解码器、Node 原生依赖和安全扫描在 AMD64 上的
  供应与故障经验更完整；
- 迁移架构不会自动改善 Provider 网络延迟、数据库查询或产品价值；
- MBA 上构建出的 ARM 镜像不能直接当作 AMD64 生产包上传。

ARM 不是永久排除项。只有在同一源版本、同一负载、同一安全门槛下证明依赖
完整、性能或价格有实质收益、发布与回滚都成立时，才应单独通过 ADR 接受。

### 3. 为什么 Cloud 使用 PostgreSQL，而不是跟随 WordPress 使用 MySQL

WordPress 本地数据库和 Cloud 运行时数据库是两个不同所有权域：

- WordPress/MySQL 保存 CMS 内容、用户、权限和本地审计真相；
- Cloud/PostgreSQL 保存托管运行、幂等、队列状态、Provider/用量证据、
  商业记录和临时媒体元数据。

Cloud 已经围绕 PostgreSQL、SQLAlchemy 和 Alembic 建立并验证了：

- partial index、JSON、timestamp 和 `ON CONFLICT` 语义；
- `SKIP LOCKED` 并发认领；
- 支付、幂等、回调、队列和媒体生命周期语义；
- 高基数查询、备份恢复、迁移重放和真实并发证明。

改为 MySQL 不会减少 WordPress 与 Cloud 之间的网络边界，也不会带来已经测量
到的用户收益，反而需要重写迁移、SQL 语义、并发测试、运维手册和恢复证据。
因此当前不迁移 MySQL 是基于现有契约和迁移面的决定，不是数据库品牌偏好。

### 4. 为什么选择 RDS PostgreSQL 18，而不是继续 PostgreSQL 16

当时项目没有真实用户，原 PostgreSQL 16 数据可丢弃。项目采用了“全新空库
初始化”的方案，而不是迁移旧数据、双写或建立兼容层：

- 生产数据库改为私网 RDS PostgreSQL 18；
- 首次安装要求 TLS `verify-full`、空库和完整 Alembic 历史；
- 原 PostgreSQL 16 仅作为限定时间的离线恢复证据；
- 不让新旧数据库拓扑长期并存。

历史讨论中暂称的“方案 B”因此没有在重构中途直接实施，而是在 P0-P5
边界稳定后由 ADR-022 正式化为一次性安装和全新 RDS PostgreSQL 18 路线。

选择 18 的主要收益是获得一个清晰、单一、可验证的新生产基线，而不是宣称
PostgreSQL 18 对本项目一定比 16 更快。PostgreSQL 16 已经证明过大量语义，
但继续保留它会把一次无用户负担的干净切换变成长期兼容工程。

RDS 值得使用的原因是把 durable database 从应用 ECS 生命周期中分离，并为
私网 TLS、备份、恢复、监控和高可用提供明确的运营边界。但当前 Basic
规格只允许验证：在第一个真实用户、付费负载或不可替代业务数据出现前，
必须升级到高可用版，并完成真实备份恢复和故障证据。

### 5. 当前图片处理流程

当前实现仍是：

```text
WordPress/本地主机
  -> 签名单文件上传
  -> Cloud 技术校验
  -> 本地卷临时源 Artifact + PostgreSQL 元数据
  -> 每张图片一个 typed run
  -> PostgreSQL 排队真相 + Redis 唤醒
  -> ECS Python worker + Pillow 处理
  -> 临时衍生 Artifact
  -> 站点绑定的签名拉取
  -> WordPress 校验、预览、审阅与受治理写入
  -> transfer-only ACK、TTL 与清理
```

这条链路已经把 Cloud 处理和 CMS 最终写入分开。ACK 只证明传输成功，不证明
审阅、导入、设为特色图、插入文章或发布。

### 6. FC 3.0 适合什么，不适合什么

`image.transform.v1` 是未来合理的 FC 候选，因为它有界、可按图片重试、
CPU/内存敏感并且可能突发。FC 的主要收益是批量吞吐和隔离，不保证单张更快：

```text
串行批次时间约为所有单项处理时间之和
FC 并发后的处理部分约为 ceil(N / C) 个波次
再加上传、审核、调度、冷启动、对象 I/O 和结果汇总开销
```

因此 20 张或 100 张常态批次可能受益，但正确模型不是把 20/100 张二进制塞进
一个函数事件。仍应每张图片一个 typed run，批次只协调有界的 item ID 和并发。

当前不迁移 FC，原因是：

- 真实生产图片负载和队列压力几乎没有；
- FC 无法直接读取当前 Docker 共享卷，必须先有 OSS-backed
  `ArtifactStore`；
- ECS 仍要承载 API、前端、Redis、回调、运维和非图片运行时，迁移图片不会
  消除固定主机成本；
- FC 会增加重试、重复事件、超时、过期 run、回调、观测和双执行器回滚问题；
- 当前没有证明 `FC + OSS + 审核 + 日志/监控 + 保留 ECS` 的总成本更低。

只有出现常态 20/100 张批次、队列或批次 SLO 失守、图片工作持续挤压主机，
或为了偶发图片峰值必须升级 ECS 时，才启动正式 FC 对照证明。

### 7. OSS 与涉黄涉暴等用户内容风险

OSS 不能作为公开直传后立即进入处理或长期保留的普通网盘。未来如启用
浏览器直传，最低流程必须是：

```text
Cloud 授权 upload intent
  -> 站点/对象/大小/MIME/TTL 受限的临时 STS
  -> 私有 OSS quarantine
  -> 文件类型、MIME、解码、尺寸和像素预算校验
  -> 色情、暴力、违法等语义内容审核
  -> 通过后才成为可处理 source artifact
  -> 未通过则拒绝、隔离、短期清理并保留最小审计原因码
```

约束包括：

- bucket 和对象默认私有，不公开原生 OSS URL；
- 临时凭据不能获得列桶、跨站点读写或长期权限；
- 技术文件校验不能替代语义审核；
- 审核失败不能进入 FC、Provider 或 WordPress 导入链；
- 日志只保留有界标识、时间、分类结果和原因码，不保留原图或敏感内容；
- 必须具备站点暂停、密钥撤销、人工复核、删除和申诉/处置路径；
- 测试仓库不能保存真实违规素材，应使用供应商测试样例、合成标签或受治理
  的独立测试资产。

内容审核是启用直接用户到 OSS 上传的前置条件，不取决于是否使用 FC。

### 8. 产品方向：一个 Cloud 运行时，多个薄平台适配器

项目最终目标不是“再做一个建站系统”，而是让 AI 在传统软件中形成可治理的
真实工作闭环：

```text
读取本地上下文
  -> Cloud 托管分析/建议
  -> 本地权限、审阅和批准
  -> 本地执行
  -> 回读验证
  -> 可回滚
  -> 保留最小证据
```

冻结的所有权是：

- Cloud：托管执行、Provider 路由、用量/权益证据、临时 Artifact、健康和诊断；
- 平台本地适配器：权限、能力、上下文、审阅、批准、最终写入和本地审计；
- Cloud 不能成为第二套能力、工作流、提示词、审批或 CMS 控制面。

WordPress 是第一个真实消费者，不是永远的架构中心。WordPress 价值成立后，
Typecho 可以只验证标题建议、内容摘要和选中文本改写三项
`suggestion_only` 任务，并复用同一 Cloud 主路径、幂等、错误语义和诊断。

如果 Typecho PoC 需要 `/v1/typecho/*`、独立运行时、独立队列、Cloud
能力注册表或 Cloud 直接写入，说明抽象失败，应先修正，不应继续做 Z-BlogPHP、
Ghost 或 Hexo。第二个平台验证成功且出现真实需求后，才决定是否抽取共享 SDK。

## 当前目标体系

### 长期使命

把 AI 从“能生成内容”变成传统软件中可审阅、可测量、可回滚、可治理的执行
能力，以真实完成的工作降低成本、缩短时间并提高质量。

### 未来 12 个月目标

1. 证明一个 WordPress 工作流被重复使用，并具有可解释的时间收益、质量收益
   和单位经济性；
2. 保持未授权写入、跨站点泄漏、重复副作用和治理绕过为零；
3. 最多有条件验证一个第二宿主平台，优先 Typecho；
4. 不以 CMS 数量、页面数量、模型调用量或 token 消耗作为主要成功指标。

核心价值指标是每周 verified outcomes：编辑者明确接受/应用，或本地执行后
回读验证成功的结果。调用次数只是成本和诊断数据。

### 当前阶段目标

#### Gate 1：关闭 Python 3.14.6 CVE 例外

2026-07-25 `12:07:38Z` 的仓库只读上游检查仍为：

- `status=waiting_for_candidate`；
- `python_version=3.14.6`；
- `fixed_image_claimed=false`；
- 例外到期日 `2026-08-05`。

固定候选出现后，必须锁定 digest、重建同一 AMD64 发布包、重新扫描、同包双重
回放、通过发布政策，再经受保护 Git 和单独的生产审批发布。

若到期仍无候选，停止扩张并重新作出显式风险决定，不能静默续期。

#### Gate 2：做一次有界真实编辑者观察

仅在 Gate 1 关闭且试用另行批准后：

- `2-3` 名真实编辑者；
- 至少 `2` 个相互独立的 WordPress 站点；
- 标题、摘要、选中文本改写；
- 共享 Provider ledger 总上限 `30` 次；
- 每次外部调用前原子 claim；
- 只保留 scalar ID、耗时、token、成本模式、结果分类和原因码；
- 不保留 raw prompt、输出正文、用户内容、凭据或 cache key。

记录：

- 技术成功、错误、fallback 和端到端耗时；
- 原样接受、修改后接受、拒绝；
- 完成任务用时和编辑负担；
- 支持介入次数和原因；
- 每个被接受建议的成本；
- 重复调用、重复扣费、保存前 WordPress 写入和跨站点泄漏。

首批样本的任务是建立可信基线，不预设“接受率必须达到某个漂亮数字”。

#### Gate 3：显式决定下一步

试用后只记录一种结论：

- `go`：证据足以进行有界扩张；
- `modify`：价值存在，但只修一个已命名的薄弱环节；
- `hold`：证据不足，按同一规模再观察；
- `stop`：价值、成本、支持或风险不成比例。

之后才允许讨论 Typecho PoC、稳定规格扩容、FC/OSS 证明或更完整的商业化。

## 当前决策登记表

| 议题 | 当前决定 | 重新打开的证据门槛 |
| --- | --- | --- |
| 现有 ECS | 保留低成本 `2 vCPU / 4 GiB` 作为有界验证资源 | 代表性生产窗口、并发/SLO 或稳定性证据 |
| 正式服务器 | 默认评估稳定型 `x86_64 4 vCPU / 8 GiB`，购买前重测 | 真实试用负载和区域报价 |
| ARM 服务器 | 不因 MBA 是 ARM 而购买 | 同版本全链路兼容、扫描、压测、成本和回滚显著更优 |
| Cloud 数据库 | 继续 PostgreSQL，不迁移 MySQL | 当前语义或运营成本出现不可修复的实测问题 |
| RDS PostgreSQL 18 | 接受私网、`verify-full`、空库初始化 | ADR 或区域/产品约束发生变化 |
| RDS Basic | 只用于验证 | 真实用户、付费或不可替代数据出现前升级 HA |
| 当前图片执行器 | ECS worker + local-volume `ArtifactStore` | 队列、批量、主机压力、耐久性或总成本触发 |
| OSS | 暂不作为公开直传入口 | 私有 ArtifactStore、quarantine、审核、TTL、清理和回滚均通过 |
| FC 3.0 | 未来批量 burst executor，不替代整个 Cloud | 20/100 张常态负载和全成本/吞吐对照证明 |
| WordPress | 当前唯一主攻真实平台 | 首批真实编辑者证据 |
| Typecho | 有条件的第二平台薄 PoC | WordPress 价值成立且有真实需求 |
| Z-BlogPHP/Ghost/Hexo | 暂停 | Typecho 证明同一 Cloud 主路径且出现真实需求 |
| 新语言/工作流平台 | 暂停 | 命名负载反复失守且当前栈最小修正无效 |

## 可复用开发经验

1. **先找最新状态权威。** 历史审计可以解释当时为什么行动，但不能覆盖日期
   更晚的关闭记录。
2. **先测量，再采购或重写。** 空闲快照不能证明并发能力；语言微基准不能证明
   整体系统收益。
3. **一次只解决一个主要矛盾。** 当前主要矛盾已经从工程可行性转为真实编辑者
   价值，不应继续用结构重构逃避产品验证。
4. **把所有权边界写进设计。** Cloud 执行和记录最小证据，平台本地负责权限、
   审阅、最终写入和审计。
5. **区分证据层级。** 本地通过、M4 candidate、PR、merge、M4 accepted、
   生产发布、人类接受和 GA 是不同事实。
6. **外部调用先预算后执行。** 真实 Provider 调用必须先 claim，并在结束后与
   Provider 记录核对。
7. **存储适配与执行适配分开。** OSS、FC、审核和直传不能在一个大迁移中同时
   引入。
8. **先验证真实消费者。** SDK、mock 和 Cloud API 成功不能替代 WordPress
   编辑器中的审阅、明确保存和写入差分证据。
9. **保存失败和无收益证据。** 不通过重复跑测试把容量边缘、冷启动或无收益
   结果抹掉。
10. **停止规则也是交付物。** 当一个边界已经关闭，就转向用户价值，不继续
    添加抽象、页面或平台。

## 工作审视报告

### 原定目标

- 判断现有服务器性能和正式采购方向；
- 判断 MBA/ARM 是否应决定服务器架构；
- 判断 RDS、PostgreSQL 18 和当前数据库路线是否值得；
- 判断图片处理是否应迁移 FC/OSS，以及如何处理违规内容风险；
- 为 WordPress 到多平台的 AI 落地制定可执行目标；
- 结合当前项目状态更新目标并形成长期可引用的本地记录。

### 完成情况

- [x] 服务器观察被限定为日期化、只读、非容量承诺的证据。
- [x] x86/ARM 决策与开发机架构解耦。
- [x] PostgreSQL、RDS PG18、Basic/HA 边界和 MySQL 非目标已说明。
- [x] 当前图片链路、FC 适用性、OSS quarantine 与审核前置条件已说明。
- [x] 多平台方向收敛为一个 Cloud 运行时和薄本地适配器。
- [x] P0-P5 完成状态与 GA 未完成状态保持分离。
- [x] 下一阶段收敛为 CVE、真实编辑者观察和明确决策三道门。
- [ ] 真实编辑者价值、HA RDS、FC/OSS 和第二平台仍需未来实践证据。

### 发现的问题

| 严重度 | 问题 | 根因 | 改进 |
| --- | --- | --- | --- |
| 必须纠正 | 早期计划仍把 P5-B3/B4/B5 当作待完成，而最新权威已记录 P0-P5 工程关闭。 | 先读了历史审计，未先排序状态权威。 | 今后先读取日期更晚的 closeout，再把旧计划作为历史证据。 |
| 必须纠正 | 一次原定最多 `30` 次的 Provider 实验最终出现 `39` 次调用。 | 多 worktree 缺少共享原子预算。 | 所有真实调用使用 common-git-dir ledger，调用前 claim，结束后核对。 |
| 应纠正 | 技术、页面和基础设施讨论多于真实编辑者价值证据。 | 工程闭环可控，用户观察存在外部依赖，因此容易继续做确定性开发。 | 关闭 CVE 后优先做最小真实观察，不再并行扩平台。 |
| 应纠正 | 空闲服务器快照容易被误解为正式容量结论。 | 把“当前无压力”和“未来可承载”混为一谈。 | 采购前使用代表性负载、稳定性要求和全成本重新评估。 |
| 建议改进 | FC 单价低容易被误解为系统成本一定下降。 | 忽略 OSS、审核、观测、工程和保留 ECS 的成本。 | 只比较端到端总成本与避免的扩容/业务损失。 |
| 建议改进 | 多平台愿景容易变成同时开发多个 CMS。 | 把市场方向直接翻译成代码数量。 | 一次只验证一个新平台，并以同一 Cloud 主路径为硬门槛。 |

### 做得好的

- 所有基础设施建议都回到实际仓库、运行边界和测量证据。
- 没有因为语言、云产品或新平台更“先进”就启动重写。
- WordPress 最终写入权和 Cloud suggestion-only 边界始终保持稳定。
- 主机、Provider、M4、生产和真实用户证据没有互相冒充。
- 违规内容风险被放在上传入口前，而不是处理完成后再补救。
- 本记录不保存聊天中出现过的任何凭据或用户内容。

### 下次重点

1. 继续只读观察 Python 固定镜像候选；
2. 固定候选出现后只做同一安全问题的最小发布闭环；
3. 试用获批后，以一个 controlling clone 和最多 `30` 次调用运行首批观察；
4. 先输出真实数据和 `go / modify / hold / stop`，再谈采购、FC 或 Typecho；
5. 每次完成报告继续区分源码、M4、生产和人类接受状态。

## 暂停项与停止规则

在 Gate 1 和首批真实观察完成前，暂停：

- Typecho、Z-BlogPHP、Ghost、Hexo 并行开发；
- FC/OSS 生产迁移和公开对象直传；
- 新语言、Agent 平台、工作流引擎、队列或第二控制面；
- 无真实瓶颈的缓存、延迟和服务器规格优化；
- 进一步首页/Admin/Portal 润色，除非是已确认的发布阻塞项；
- 无可信账单、费率或结算记录的成本结论。

出现以下任一情况立即停止试用或扩张：

- 未经明确保存产生 WordPress 写入；
- 跨站点数据泄漏；
- 重复副作用、无法解释的 Provider 调用或预算绕过；
- raw prompt、用户内容、凭据或敏感对象进入不应存在的日志/证据；
- CVE 例外到期却没有新的显式风险决定；
- 审核隔离被绕过；
- 支持负担或单位成本明显高于产生的价值。

## 验证与回滚

本文和 README 入口只改变文档，不改变代码、数据库、API、Compose、M4、
生产、Provider、Cloudflare、WordPress 或云资源。

验证范围：

- Markdown 相对链接；
- 敏感信息和 secret-like 模式；
- `git diff --check`；
- 精确暂存文件清单和受保护 PR 发布流程。

回滚只需回退本次文档提交，不需要运行时或数据库回滚。

## 相关权威记录

- [Image Processing FC/OSS Readiness](image-processing-fc-oss-readiness-2026-07-20.md)
- [ADR-022: One-Time Cloud Install And Fresh RDS PostgreSQL 18](decisions/022-one-time-cloud-install-and-rds-postgresql-18.md)
- [Cloud First Install Contract](cloud-first-install-contract-v1.md)
- [Post-P5 Final Integration And Production Validation Closeout](post-p5-final-integration-and-production-validation-closeout-2026-07-22.md)
- [Post-Refactor Runtime Stack And GA-Readiness Retrospective](post-refactor-runtime-stack-and-ga-readiness-retrospective-2026-07-25.md)
- [Provider Call Ledger And Next-Stage Deferral](provider-call-ledger-and-next-stage-deferral-2026-07-25.md)
- [Cloud Content Generation Boundary](cloud-content-generation-boundary-v1.md)
- [Multi-Platform Connector Boundary](multi-platform-connector-boundary-v1.md)
- [Development And Validation Operating Model](development-validation-operating-model-v1.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [Cloud Production Release Policy](cloud-production-release-policy-v1.md)

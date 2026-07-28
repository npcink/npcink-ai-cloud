# Production / Master 差异审查 — 2026-07-25

## 状态

只读生产发布差异审查，结论为 **HOLD**。

本记录回答“当前 `master` 相对 `production` 改了什么、能否直接发布、还缺
什么证据、如何发布和回滚”。它不批准生产发布、不证明线上主机实际运行版本，
也不替代
[Cloud Production Release Policy](cloud-production-release-policy-v1.md)、
[Cloud Release Checklist](../deploy/RELEASE_CHECKLIST.md)、
受保护分支、正式发布包或发布操作员审批。

审查过程没有连接生产主机、RDS、Edge、M4 或 WordPress，没有修改数据库、
服务设置、Provider、GitHub Environment 或任何生产资源。

## 一句话结论

当前 `master` 已具备成为下一次生产候选的源码基础，但不能直接提升到
`production`：

1. Python 3.14.6 的三个受控 High CVE 仍未关闭，例外在 `2026-08-05`
   到期；
2. M4 已接受的应用版本是 `f06d2dbb`，当前应用树又增加了
   `c030027f` 的 WordPress 编辑器文本分类修复；
3. 正式 `Release Smoke` 工作流尚无成功记录，发布清单仍有真实支付、
   WordPress 重连、schema drift、外部 OTLP、24 小时观察等未完成项；
4. 本次仅审查 Git 和 GitHub 证据，未验证线上主机、RDS、TLS、备份和当前
   配置，因此不能把仓库状态表述为生产就绪。

解决这四类差异后，应走一次完整生产发布，而不是静态页面快速发布。

## 审查快照

审查时间：`2026-07-25T14:23:42Z`。

| 事实 | 固定值 |
| --- | --- |
| 开发基线 | `origin/master` = `8d4dc496801589fdfccbbcc0e160bb2a14c2b218` |
| 开发 tree | `abd46bf9a140cb0965bebfb90e97baf6030edda3` |
| 生产分支基线 | `origin/production` = `57ffbe22dd7e3d37647034dfe8c4b5edc65d569c` |
| 生产 tree | `d776b8f35d84d566f92d919e99e429b3b1d252b0` |
| merge base | `a635c8c220d6f0b956fa95ad2d613736f38b6a76` |
| 分支图差异 | `production` 独有 71 个提交；`master` 独有 58 个提交 |
| tree 差异 | 175 个文件，`+24,540 / -488` |
| 应用源码差异 | `app/**` 与 `frontend/src/**` 共 68 个文件，`+6,336 / -219` |

`production` 和 `master` 是有意分叉的发布分支，71/58 是 Git 历史图计数，
不是“生产简单落后 58 个提交”。发布判断以 tree、精确候选提交和发布证据为准，
不通过反向合并 `production` 来美化分支图。

生产分支最新提交 `57ffbe22` 是 PR `#222` 的生产提升合并，主题为首次安装后
Admin 登录主机信任修复。仓库中更早记录的受控生产发布
`972fee82` 是一个日期化的已验证发布证据，不应被误写成当前最新
`production` 分支 HEAD。

## 差异总览

### 1. 数据库与部署骨架没有变化

以下内容在两个 tree 中完全相同：

- `migrations/**`；
- `app/core/models.py`；
- `docker-compose.prod.yml`；
- `docker-compose.runtime.yml`；
- 根 `Dockerfile`；
- `deploy/image-lock/**`；
- `pyproject.toml` 和 `uv.lock`。

因此：

- 本次候选不引入新的 Alembic revision；
- 不改变 RDS PostgreSQL 18、Redis、API、Frontend 和三个单并发 Worker
  的生产拓扑；
- 不改变 Python 依赖集合或基础镜像；
- 不新增生产数据库密码或运行根密钥的环境变量入口；
- 不需要数据搬迁或 schema 兼容层。

这只说明“没有新的 schema / topology 迁移”，不允许跳过候选镜像的 RDS
私网解析、TLS `verify-full`、PostgreSQL 18、Alembic 单头、备份恢复点和
完整安装状态校验。

### 2. Provider 执行语义发生实质变化

Provider/runtime 差异包括：

- OpenAI-compatible、Anthropic 等 Provider 的错误与 usage 归一化；
- 跨 Provider 的 context overflow 分类；
- 调用前 context-window 预算检查，超限时在 Provider 调用前失败；
- 站点范围内、仅由有界稳定字段派生的 prompt-cache affinity；
- uncached、cache-read、cache-write 和 reasoning token 证据；
- cache read/write 价格元数据与“未知 / 未定价 / 估算”姿态；
- 基于既有 `ProviderCallRecord` 和 `UsageMeterEvent` 的只读 Provider
  证据汇总；
- 新增内部接口
  `GET /internal/service/runtime/provider-evidence/summary`。

这些变更仍位于 Cloud 托管执行和运行证据边界，没有新增 Prompt、Ability、
Workflow、审批或 WordPress 写入真相。WordPress 输入也不会被 Cloud 自动
截断或改写。

生产影响为中高：Provider 调用前置拒绝、错误码、fallback 判断、usage 和
成本估算会改变。发布前必须用生产候选配置验证实际 Provider/model 的
`context_window`、cache price 姿态和一个真实 suggestion-only 文本闭环。
第三方网关结算价仍未获可信发票或费率证据，不能把运行估算用作客户计费真相。

### 3. WordPress 文本默认分类变得更严格

当前应用 tree 相比最后一个 M4 accepted 版本多一个运行时修复：

- `WP_AI_CONNECTOR_DATA_CLASSIFICATION` 从 `public_site_content` 改为
  `internal`；
- WordPress connector 仍允许显式的 `pii` 或 `secret` 提升；
- 变更文件仅为 `app/api/routes/runtime.py`、
  `app/domain/wordpress_ai_connector/contracts.py` 和对应 API 测试。

这是合理的保守修复，但它改变 Provider 选择/数据治理输入，必须在当前
`master` 上重新完成一次 focused M4 promotion 和 WordPress 标题路径 smoke，
不能用更早的 `f06d2dbb` M4 接受记录替代。

### 4. Portal 和商业语义发生实质变化

主要变化包括：

- 未绑定 QQ 首次授权不再返回 `binding_required`，而是创建 Free
  `principal/account/site/subscription` 并建立 QQ Provider binding；
- Portal HTML callback 成功后直接返回原目标页面；
- 新增匿名 `GET /open/plan-catalog`，公开价格和权益从已发布 plan/offer
  投影，不再由首页硬编码；
- 标准 Plus/Pro offer 的可购买性收敛到 canonical offer；
- package credit 的 remaining/used 计算改为基于 ledger net delta，使
  operator grant 和 adjustment 正确进入可用额度；
- Portal 套餐、余额、注册和登录页面相应更新。

这部分不是纯 UI。它会创建持久业务记录并改变现有 ledger 的余额投影。
发布前应：

1. 明确批准“首次 QQ 登录自动注册 Free 账号”的产品行为；
2. 若 QQ 未准备好，保持 Service Settings 中 QQ disabled；
3. 若 QQ 启用，完成真实 QQ callback、重复登录、冲突、解绑和重登 smoke；
4. 对生产现有代表性账户执行只读额度对账，确认 operator grant、package
   remaining、paid remaining 和 total remaining；
5. 检查匿名 plan catalog 与 Admin 中已发布 plan version / active offer
   一致，缺失项目必须显示不可用而不是虚构价格。

### 5. 新增版本化公开合规投影

新增 `SiteComplianceAdminService`，使用现有 `service_settings` 表保存
`site_compliance` 行：

- Admin 可保存 draft 和 publish；
- publish 前对运营主体、联系方式、退款、保留期、第三方服务和人工法务确认
  执行阻断/警告校验；
- 类似 secret、password、credential、token、API key 的字段名会被拒绝；
- 公开接口 `GET /open/compliance` 只投影已发布版本；
- Admin 写操作要求内部认证和幂等键，并记录不含凭据值的审计事件。

没有 schema 变更，旧版本也不会主动读取这个新的 setting ID。技术兼容风险低，
但公开内容具有法律和信任影响。生产发布不能自动“发布”合规资料；必须由操作员
填写真实资料、完成适用法务复核并显式 publish。本文不判断文案的法律充分性。

### 6. 公开前端成为完整产品入口

前端增加或重做：

- 首页价值、边界、套餐和 CTA；
- `/help`、`/status`、`/privacy`、`/terms`；
- robots、sitemap、Open Graph 和图标；
- QQ 登录/注册入口；
- 公开 plan/compliance/status 投影；
- Admin 网站合规工作区；
- Portal 套餐与额度说明；
- Admin/API 页面 `X-Robots-Tag: noindex, nofollow, noarchive`。

`next` 从 `16.2.9` 升到 `16.2.11`，锁文件相应变化。即使正式 Compose 和
Dockerfile 未变，也必须重建 Frontend 镜像；应用源和 Provider 代码变化也要求
重建 API/Worker 镜像。该差异不符合只更新 `site/terms/*` 的静态快速发布条件。

### 7. M4、CI 和发布工具变化主要属于开发控制面

`master` 还新增了 M4 source relay、package proxy/cache、candidate/promotion、
CI pytest 分片、PR publisher、Provider 调用账本和 Python CVE daily watch。

生产 Compose 不引用新 M4 配置：

- `deploy/nginx.m4-preview.conf`；
- `deploy/top.mqzj.npcink-ollama-preview.plist`。

它们不应被安装到生产运行时或被当作生产控制面。发布包仍应由既有 exact-bundle
合同决定内容，而不是把整个开发工作区原样复制到服务器。

## 数据兼容与回滚判断

### Schema 兼容

结论：**无 schema 差异，但有新数据语义。**

新版本使用既有通用存储：

- Provider 细分 usage 写入既有 `UsageMeterEvent` 的新 meter key 和 JSON
  payload；
- Provider 证据读取既有 `ProviderCallRecord`；
- 合规资料写入既有 `ServiceSetting` 的新 setting ID；
- QQ 自注册使用既有 principal、account、site、subscription、entitlement
  和 identity-provider 结构。

代码审查表明旧生产版本会忽略未知 Service Setting 和 meter key，因此容器
回滚不需要 schema downgrade。但 QQ 新建账号、Free subscription、合规发布
记录和 ledger 事实不会随容器回滚自动消失。

### 回滚边界

发布前：

- 固定旧 Release、旧镜像、受保护运行配置和 RDS 恢复点；
- 不修改 `.env.deploy` 中的数据库秘密；继续使用 protected
  `runtime-config.json`；
- 记录候选发布前账户/额度只读快照和 Provider 连接状态。

发布失败且数据库未发生非兼容写入时：

- 恢复旧 Release、旧镜像和匹配的受保护配置；
- 保留新写入业务记录，先禁用 QQ/相关 Provider lane，再人工判断是否需要
  业务补偿；
- 不通过删除账号、账本或合规记录来“回滚代码”。

若发现数据损坏或无法解释的商业余额：

- 停止写入者；
- 使用匹配的旧 Release、旧配置和发布前 RDS 恢复点；
- 不允许旧代码自动连接一个已经发生未知迁移或不兼容写入的新数据库。

## 证据矩阵

| 要求 | 当前证据 | 状态 | 生产前动作 |
| --- | --- | --- | --- |
| 当前 `master` 源码完整 | `8d4dc496`，工作树基线已固定 | PASS | 生产候选需重新固定最终 SHA/tree |
| 当前 `master` Cloud CI | [run 30157700040](https://github.com/npcink/npcink-ai-cloud/actions/runs/30157700040) 成功 | PASS，docs-only lane | 最终生产提交仍需自身 green CI |
| 当前 `master` CodeQL | [run 30157700028](https://github.com/npcink/npcink-ai-cloud/actions/runs/30157700028) 成功 | PASS | 最终生产提交仍需自身结果 |
| 当前应用 tree 全套 CI | `c030027f` 的 [run 30155305730](https://github.com/npcink/npcink-ai-cloud/actions/runs/30155305730) 通过 frontend、static、3 个 pytest shard、dependency audit 和 PG16 regression | PASS | docs-only 后续未改变 app/frontend tree |
| 数据库 migration | production/master migrations tree 相同 | PASS | 仍执行候选 PG18/TLS/Alembic preflight |
| 正式 Compose / Dockerfile | production/master 相同 | PASS | 仍从最终 exact bundle 重建并验证镜像 |
| 当前应用 tree M4 accepted | accepted 为 `f06d2dbb`；当前 app tree 是 `c030027f` | GAP | clean `master` focused promote + WordPress text smoke |
| Python CVE | [run 30144033757](https://github.com/npcink/npcink-ai-cloud/actions/runs/30144033757) 为 `waiting_for_candidate`，Python `3.14.6`，`fixed_image_claimed=false` | **BLOCK** | 固定新候选并 rebuild/rescan/replay，或在未到期前重新作出同包、同范围受控决定 |
| CVE 观察与当前安全输入一致 | watch 后 Dockerfile、Python lock、allowlist、watch script/workflow 均未变 | PASS for observation | 不等于 CVE 已修复 |
| production HEAD CI | `57ffbe22` 的 Cloud CI 和 CodeQL 成功 | PASS for old production tree | 不覆盖新候选 |
| 正式 Release Smoke | 唯一可见 run `29134616379` 失败；无成功记录 | **BLOCK** | 配置正式 smoke secrets 并从最终 production SHA 成功运行 |
| 最新代码已部署生产 | 本次未连接主机；Git 历史不证明部署 | UNKNOWN | 部署前后读取 release manifest、container image ID 和 source revision |
| RDS/Edge/backup/restore | 本次未连接真实资源 | UNKNOWN | 执行发布清单中的只读 preflight、恢复点和恢复证明 |
| 真实 QQ 登录 | 仅在启用时需要；代码改变了首次登录行为 | CONDITIONAL BLOCK | 启用则跑真实 callback；否则保持 disabled |
| 真实支付、WordPress 重连、OTLP、24h 观察 | 发布清单仍未关闭 | BLOCK for GA | 受控验证与 GA 分开记录 |
| 人类编辑者价值与 GA | 尚未证明 | PENDING | CVE 关闭后再进行有预算真实编辑者观察 |

## 生产发布分类

当前差异必须使用 **完整生产发布路径**：

```text
关闭安全门槛
  -> 接受当前 master 的 M4 应用树
  -> 固定最终 production 候选
  -> exact bundle / fresh scan / same-bundle replay
  -> production PR 与操作员审批
  -> production SHA 的 Cloud CI / CodeQL
  -> RDS PG18/TLS/Alembic/backup preflight
  -> 重建并部署 API、Frontend 和 Worker 镜像
  -> 正式 release smoke 与 WordPress/Provider/商业 smoke
  -> 24 小时受控观察
```

不能使用：

- `site/terms/*` 静态快速路径；
- 只替换 Frontend；
- 只同步源码不重建镜像；
- 因“无 migration”而跳过 RDS preflight；
- 因 M4 较早版本已 accepted 而跳过当前应用树 promotion；
- 因 CI 为绿色而绕过 CVE、生产审批或真实 smoke。

## 建议执行顺序

### Gate 0：先关闭安全阻断

优先等待或发现支持的固定 Python 镜像候选，完成 digest 固定、Linux/AMD64
重建、fresh scan、同包双重回放和 allowlist 清理。

若在 `2026-08-05` 前仍需要继续受控生产验证，只能针对最终同一发布包重新
核对威胁情报和受控风险合同；不能静默续期，也不能用于 GA 或真实用户扩张。

### Gate 1：补齐当前应用树 M4 接受

从干净、当前 `origin/master` 执行 source sync 级 promotion。因为
`f06d2dbb..c030027f` 未改变依赖、Dockerfile 或 Compose，正常情况下不需要
重新 build；由 M4 脚本的 dependency fingerprint 作最终决定。

最小 smoke：

- WordPress title suggestion；
- 执行上下文为 `data_classification=internal`；
- Cloud 返回 suggestion-only；
- WordPress 审阅后显式本地保存；
- 无 Cloud 直接 WordPress 写入。

### Gate 2：冻结最终生产候选

- 从最新、干净 `master` 创建 production promotion；
- PR 明确包含
  `Approved for production validation by operator.`；
- 记录最终 SHA、tree、变更范围和回滚 release；
- 等最终 `production` SHA 的 Cloud CI、CodeQL 和 exact-bundle 证据。

若 `master` 在本文快照后新增应用改动，必须重新计算本审查，不允许继续使用
`8d4dc496` 的差异结论。

### Gate 3：生产前只读核验

- 当前 host release manifest、container image ID、source revision；
- install state = `complete`，配置 checksum 匹配；
- RDS 私网 DNS、TLS `verify-full`、CA、PostgreSQL 18、单 Alembic head；
- RDS 可用恢复点和一次可复述的恢复路径；
- schema drift index-name 差异已解决或被数据库 owner 明确接受；
- Provider connection/model metadata、真实 credential 可用性和禁用 lane；
- QQ 开关、Portal public URL、SMTP、Alipay、公开 plan/offer 与合规发布状态；
- 发布前代表性账户额度快照；
- Edge/TLS、外部 OTLP 和 Worker heartbeat。

### Gate 4：完整部署与 focused smoke

部署后至少验证：

1. `/health/live`、internal ready、Frontend `/api/health`；
2. Admin 登录、service settings、site compliance draft/publish；
3. `/open/plan-catalog`、`/open/compliance`、首页、status、privacy、terms；
4. Portal 邮箱验证码；QQ enabled 时真实首次注册、重复登录和解绑；
5. 一个真实 Provider 文本调用、context preflight、usage/cache 证据；
6. 代表性账户 package/paid/total credits 对账；
7. WordPress 重连、标题 suggestion-only 和本地保存；
8. WordPress 图片往返、签名拉取和 transfer-only ACK；
9. 正式 `Release Smoke` 工作流无条件成功。

### Gate 5：受控观察，不直接宣布 GA

观察至少 24 小时：

- API/Frontend/Worker 重启和错误率；
- Provider timeout、context overflow、fallback 和 metering completeness；
- QQ/邮箱登录、支付 callback、额度变化；
- 队列 residue、heartbeat、SMTP、OTLP 和 RDS 连接；
- WordPress 文本/图片往返；
- 无跨站点泄漏、未授权写入或重复副作用。

安全门槛和受控发布关闭后，再执行有预算的真实编辑者观察，最后单独作出
`go / modify / hold / stop` 和 GA 决定。

## 最终判断

| 判断 | 结论 |
| --- | --- |
| 当前重构是否需要重新打开 | 否；这是发布差异和产品验证，不是新一轮系统重构 |
| 当前 `master` 是否值得作为生产候选 | 是；Provider、公开入口、合规和商业正确性均有明确收益 |
| 当前是否可直接部署 | 否；CVE、当前应用树 M4、正式 smoke 和生产实况证据未闭合 |
| 是否需要数据库迁移项目 | 否；无 schema 差异，但仍需正常 PG18 preflight |
| 是否可使用静态快速发布 | 否；存在后端、商业、Provider、前端依赖和持久写入语义变化 |
| 回滚是否比有 migration 的版本简单 | 是；但 QQ/账本/合规等新业务事实需要保留和人工补偿 |
| 下一步最小正确动作 | 先关闭 CVE，再补一次当前 `master` focused M4 acceptance |

本审查的价值是把“代码差异大”转换成少数可执行门槛。当前不需要继续扩大
架构或增加平台；需要完成的是一个有精确候选、精确证据、精确回滚边界的
生产发布闭环。

## 相关权威记录

- [Post-P5 Final Integration And Production Validation Closeout](post-p5-final-integration-and-production-validation-closeout-2026-07-22.md)
- [Post-Refactor Runtime Stack And GA-Readiness Retrospective](post-refactor-runtime-stack-and-ga-readiness-retrospective-2026-07-25.md)
- [Python 3.14 CVE Upstream Checkpoint](python-3-14-cve-upstream-checkpoint-2026-07-24.md)
- [Python 3.14.6 Controlled Production Validation Risk Decision](python-3-14-6-controlled-production-validation-risk-decision-2026-07-21.md)
- [Public Frontend Development Retrospective And Standard](public-frontend-development-retrospective-and-standard-2026-07-25.md)
- [Provider Three-Item Closeout And Development Retrospective](provider-three-item-closeout-and-development-retrospective-2026-07-25.md)
- [M4 Preview AI Development Standard](m4-preview-ai-development-standard-v1.md)
- [Cloud Production Release Policy](cloud-production-release-policy-v1.md)
- [Cloud Release Checklist](../deploy/RELEASE_CHECKLIST.md)

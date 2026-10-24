# Engineering Follow-up Queue v1

Status: active engineering backlog. 记录已判断为"低收益/收益递减、暂缓执行"的
工程清理与整改项，以及近期已完成的工程整改索引，防止后续会话重复规划。本文
不构成发布授权；产品主线见
[next-stage-plan-2026-09-22.md](next-stage-plan-2026-09-22.md)。

取舍原则（操作者 2026-09-22 确认）：优化做不完，先做收益高的；其余记录于此，
后续再做。每项标注建议触发条件——条件不满足就不动。

## 1. 待办队列（按建议优先序）

### 1.1 i18n 死键后续批次

- 事实（2026-10-25，固定基线 c4831b50）：#1000 的动态键族契约与首批
  300 个死键删除已有源码承接；当前
  [动态键族契约](../frontend/tests/unit/i18n-dynamic-key-families-contract.mjs)
  注册 40 个 FAMILY_SOURCES 前缀。旧“34 族、1,687 个剩余候选、335 个
  zh-only 键”是历史计数，未重算为本次库存。
- 成本/收益：每批仍需按最新调用与守卫重新分析、双语同步删除并维护
  [回归守卫](../frontend/tests/vitest/i18n-retired-dead-keys.test.ts)；
  收益为目录减重，优先级仍低，不因旧计数自动开清理批。
- 建议触发：触碰 frontend/src/lib/i18n.ts 结构的任务顺带做有界批次，
  每批 ≤300；zh-only 键在明确英文回退策略时单独裁决。
- 原 .tmp/i18n_dead_keys.py 是未入库的一次性分析工具，不假定当前仍可用。
  后续按 #1000 规则重建可重复分析，并保护所有现行动态族；本记录不新增运行命令。

### 1.2 有界动态键族枚举化

- 事实：failure_reason_、failure_step_、plans.state_ 等有界键族仍由
  [动态键族契约](../frontend/tests/unit/i18n-dynamic-key-families-contract.mjs)
  保护。未发现独立的全面枚举化交付；有界取值不等于已经改成显式常量。
- 建议触发：仅在 1.1 对应清理或该页真实 i18n 构造任务触及时，评估局部
  枚举化；保留未知值回退与契约守卫。未触发不等于取消，亦不单开全仓重构。

### 1.3 PBKDF2 盐：逐条随机盐已实现，稳定摘要另有用途

- 源码状态：#1168 后的
  [security.py](../app/core/security.py) 中 build_secret_hash 已为新存储
  secret 生成逐条随机盐，verify_secret_hash 同时支持新四段格式和旧三段格式。
  [哈希测试](../tests/core/test_secret_hash.py)覆盖随机性、列长度、旧格式和
  稳定摘要；本次只读检查源码，未重跑测试，未盘点存量 hash。
- SECRET_HASH_SALT 仍存在于 derive_stable_secret_digest 和旧格式校验。
  前者用于身份/Addon 查找以及 callback HMAC 派生，故意保持确定性；不能仅因
  常量存在就断言新 API key/OTP 仍统一用全局盐，也不能统一替换为随机摘要。
- 原“全局盐整体改 per-record 必须做 schema 迁移”的前提已被源码替代；
  新格式在现有字段内存储，不需为这项已交付改造再立迁移任务。存量是否全为新
  格式、现场部署版本及旧格式退役仍未核实。
- 后续最小动作：只有触及相关存储/校验合同且明确获批时，再盘点实际存量、
  查找/HMAC 兼容及退役条件；本条不授权批量重哈希、移除旧格式校验或数据迁移。

### 1.4 dev/CI 依赖安装消费 uv.lock（源码已落实，保留编号）

- 原问题：未锁定的 CI 开发安装曾在同提交重跑时解析到不同 FastAPI，
  引出 tracing 测试环境差异；这属于历史原因，不代表当前仍未锁定。
- 处理结果：固定基线的 [Makefile](../Makefile) bootstrap、[CI 两条相关
  lane](../.github/workflows/ci.yml)及
  [依赖审计](../scripts/check-python-dependency-audit.sh)、
  [生产 extras smoke](../scripts/production-python-extras-smoke.sh)均消费
  uv.lock 并要求 locked 安装。无需重复实施该项。
- 本次只校正文档状态；未重新安装依赖或验证运行环境。保留锁文件纪律，
  不从源码存在推定所有未来 CI/生产环境已验收。

### 1.5 RuntimeService / CommercialService 拆解

- 事实（固定 c4831b50）：app/domain/runtime/service.py 为 7,028 行；
  app/domain/commercial/service.py 为 221 行，后者通过聚合/mixin 组织职责。
  旧“CommercialService 约 1.9 万行”不是当前单文件测量，不能作为拆分范围。
- 结构债仍在；[可维护性清单](refactor-deletion-inventory-v1.md)要求行为保持
  委托抽取、先有表征覆盖、一次一个职责，维持单一运行入口。
- 建议触发：真实功能任务触及相应职责时，只抽取该切片，并按任务验证实际行为；
  不因体量快照开无消费者的纯拆解会话，不改运行/商业真值边界。

### 1.6 前端数据加载统一（react-query）与 features 抽取

- 事实（固定 c4831b50）：现有
  [AdminQueryProvider](../frontend/src/components/admin/AdminQueryProvider.tsx)与
  react-query 已接入。frontend/src 静态文本中 useQuery 的直接调用形态为
  6 处，new AbortController 的构造形态为 18 处；这不是运行时调用量或
  “多少页面未迁移”的精确分母，旧“7 处使用、10+ 页”不再作为当前计数。
- 建议触发：admin 页面真实功能任务改到该页时，评估复用现有 query/provider
  与 features 分层，一次一页。AbortController 的存在本身不是缺陷，不机械
  替换有界取消逻辑；仍需验证 loading/error/retry/cancel 行为。
- 部分页已有 features 抽取不等于全前端数据层已统一；延期未取消。

### 1.7 测试体系提速与脆性

- 事实：固定基线的 [Playwright 配置](../frontend/playwright.config.ts)
  仍为 workers: 1、fullyParallel: false；
  [tsconfig](../frontend/tsconfig.json)明确排除 tests。
  源码文本契约仍存在，但旧“40 spec、91 个文本契约”未刷新为当前库存。
- 结构/配置事实不证明套件耗时今天已经阻塞日常工作，也不证明全部文本契约都
  应改写。并行化与测试类型覆盖是不同问题，不能以总清零目标一起扩张。
- 建议触发：有实际耗时收据证明日常阻塞后，再评估隔离、并发与稳定性；
  有具体文本断言误报阻碍真实重构时，逐条改为可验证行为。测试类型检查范围
  的改变另按明确任务安排，不由本条自动授权。

### 1.8 残余小项（观察清单，不是统一整改任务）

- 路由体量：固定 c4831b50 的 app/api/routes/service.py 为 6,956 行，
  portal.py 为 6,346 行；高于原观察阈值不等于出现新故障。按现行可维护性
  watched-files 纪律观察，真实功能任务触及时局部抽取，不专开拆分批。
- domain/adapters 双向依赖及 domain/workers 倒置仍属对应边的架构观察；
  下次 provider/worker 功能任务先确认实际依赖再处理，不声称全仓已完成或
  无运行时影响。
- revision 字面量、重复 except、EXIF/邮箱通知异常处理、BaseException、
  客户端组件、内联回退和 any：旧 221/114/11/39÷42/247/65 等是历史
  计数，未作本次精确库存或严重性结论。相应模块触及时逐处核实行为与原因，
  不自动统一加日志、捕获异常或扩大硬化。
- deploy/magick-domain-nginx.conf.template 的旧命名及域名绑定引用，待真实
  域名绑定任务核对全部消费者后处理；本条不授权主机/域名配置修改。
- Xcode 许可与系统 git 的故障是旧工作站观测，不是当前机器状态。仅在实际
  复发时按操作者环境问题处理；不据旧记录执行系统授权操作。
- 上述事项没有统一“完成”证明；局部后继实现与未触发建议须分别记录。

### 1.9 2026-10-04/05 收尾会话延后项（2026-10-25 对账）

- **Provider 预算实现已有后继，不重拆历史分支**：#1029/#1031 已合入核心
  claim/日月预算、旁路 guard 和 Admin 投影，后继 #1092/#1093 等继续修正。
  [历史盘点](provider-budget-hard-cap-inventory-2026-09-23.md)已有合入更新。
  旧 worktree 的“约57个独有提交、45+文件交叠、拆三PR”是旧资产快照，
  不是当前功能清单。分支/目录是否保全退休归当前生命周期收据；其他历史独有
  意图仍按逐项对账，不据预算源码存在全部销账。CI、M4 accepted、实际预算
  配置、操作者与真实 Provider 证据另列，不由此授权真实调用或生产操作。
- **Admin quality-scope WIP 是未验收建议**：850f7dd8 的 quality_scope_note
  未在本基线产品源码发现，当前 troubleshooting 已有多批后继，不能整体
  恢复旧候选。未来明确授权相应排障/文案任务时才按当前页面重做最小改动；
  没有任务或超过旧“一月”期限不等于自动交付/删除归档的授权。
- **CPython 镜像前提已变化**：[Dockerfile](../Dockerfile)与
  [镜像锁](../deploy/image-lock/production-images.json)固定的是
  python:3.14-alpine 的 digest；
  [已核权威元数据](../deploy/image-lock/authoritative-not-affected.json)在
  2026-10-19 记录 package_version 3.14.8。旧“镜像仍固定3.14.7”不再作为
  当前前提。锁元数据不是本次镜像重建/扫描或已安装生产版本证明；下次已授权
  发布或上游安全更新时核对精确镜像、适用 advisory 和证据时效，不自动重建或部署。
- **Next/eslint 配对仍缺**：[package.json](../frontend/package.json)当前为
  Next ^16.4.1 与 eslint-config-next ^16.2.9，旧“升至16.3.6”的目标过时。
  在下一项已授权前端依赖任务中选择兼容组合并更新锁与相应验证；本条不升级依赖。
- 本节只纠正历史实现/候选/镜像与依赖前提，不改变价格、既有商业范围、
  生产授权或冻结功能。

### 1.10 Portal 自助服务进阶能力（2026-10-25 事实对账）

2026-10-22 的“基础功能够用”是原验证阶段的范围决定；其后已有分批交付，
不能继续把下列能力一概列为缺失。以下“已承接”仅指已合入的源码范围；
本地、CI、M4 candidate、merged、M4 accepted、production 与 human evidence
仍须分别报告，不据此宣称现场验收或合规义务已全部完成。

**已有源码承接（防止重复立项）**：

- **账号注销与有界个人数据副本**：#1227 已承接两步账号关闭与通知收件箱；
  #1236 已承接当前本人、单一有效账户关系下的邮箱再验证 JSON 副本。
  副本只含契约规定的个人资料、成员关系、本人提交工单及公开消息、已发送附件
  元数据和本人通知；不含 WordPress 数据、附件二进制或全部账单/用量记录，
  不能称为完整 GDPR/个保法合规证明。见
  [个人数据副本契约](portal-personal-data-copy-v1.md)。
- **通知收件箱与受限事件**：#1227 的公开客服回复通知按原工单提交人隔离，
  回复、站内通知与审计在同一事务提交；#1246 复用现有生命周期与执行拒绝路径，
  对实际结束的 Plus/Pro 试用按订阅及结束时间去重，对 AI 积分执行拒绝按订阅
  周期去重。后两类仅写 Portal inbox，且要求唯一有效 owner、有效 principal
  和可规范化邮箱；未增加 SMTP、定时扫描或历史回填，不能代表全部通知覆盖。
- **登录会话管理**：#1241 激活统一会话注册/验证，#1232/#1243/#1244 承接
  全部退出确认、本人会话列表、单条撤销及保留当前会话的“撤销其他”。会话
  不是经过验证的物理设备清单，不能据浏览器提示推定设备身份。
- **TOTP 的受限交付**：#1245 的存储基础与 #1247 的 T2 登录挑战、已有因子的
  受保护管理路径已合入；启用因子的用户须完成第二因子验证才能得到完整会话。
  `POST /portal/v1/totp/setup/start` 与 `/setup/confirm` **仍未挂载**，无公开
  自助开通入口；不能把 T2 写成完整自助 TOTP。现行边界与历史验证见
  [TOTP 契约](portal-totp-v1.md)及
  [七会话收口](history/engineering/2026/seven-chat-phase1-closeout-2026-10-24.md)。
- **已关闭工单重开**：当前工单详情已有“重开并回复”入口与说明；本人回复
  resolved/closed 工单时服务端恢复 open，清除对应结束时间并回到支持队列。
  见[工单详情](../frontend/src/app/portal/support/[requestId]/page.tsx)及
  [支持域实现](../app/domain/commercial/mixins/_support_mixin.py)。
- **超量出路与现有购买/试用**：#1220 承接所有符合既有资格账户的 Plus/Pro
  月套餐、积分包购买和共享一次 14 天 Plus/Pro 试用；保留现价、发布/销售状态、
  权限、资格及试用升级不延长结束时间等规则，三人 Free 验证独立进行。
  商业冻结仍约束其他扩展，不能再解释成“现有升级一律不可用”。#1231 只为
  既有查看用量/套餐目的地、容量说明及错误恢复增加只读 mock 浏览器回归，
  不证明真实购买、实际释放容量或新增知识库删减能力。见
  [有界商业契约](engineering/commercial-development-next-stage-v1.md)及
  [超量恢复回归](../frontend/tests/e2e/portal-quota-recovery.spec.ts)。

**仍待处理或单独验收（未取消）**：

- **TOTP 自助开通**：setup/confirm 挂载、完整前后端开通消费及相应激活/恢复
  验证仍是后续独立范围；有明确排期后按 TOTP 契约重新审查、验证，不能仅改
  设置或挂路由即认定完成。
- **知识库索引自助降量**：现有 Portal 路由未提供知识库条目删除/缩减接口。
  套餐升级入口及只读容量恢复回归不等于此能力已实现。保留真实用户被容量
  卡住或明确产品排期时的范围评估，不在本次文档修正中新增删除/同步控制面。
- **其他通知需求**：支付/退款、提前阈值提醒、其他额度及邮件渠道等需求仍需
  按具体事件核实现有实现、可靠投递与需求；#1246 不覆盖这些范围，不能由
  收件箱存在推定全部完成，也不据旧建议直接引入 outbox、cron 或全量告警。
- **真实业务与生产证据**：支付宝实际支付/退款、真实试用周期、邮件现场投递、
  当前站点与生产版本的使用验收仍须各自补证；源码合入、mock 回归及历史 M4
  accepted 不能替代。生产部署/配置与真实交易按既有规则取得具体动作授权，
  不从本队列或“全仓清零”推导授权。三人 Free 验证及 Phase 1 编辑器真实闭环
  证据继续独立保留，不能用付费试用样本替代。

本节只校准原队列的实现与证据状态；未完成项仍保留，不把延期写成取消，
也不授权新产品功能或重做已被现行契约替代的旧提案。

## 2. 已完成（2026-09-21/22，防重复规划）

2026-10-05 会话补充完成项：

- braces 告警（alert #98）已关闭：依赖链为 tailwindcss（devDependency）
  → fast-glob/micromatch/chokidar → braces，生产前端镜像仅含 Next standalone
  输出、不含构建期工具链，ReDoS 路径运行时不可达；以 `not_used` + 证据
  dismissed。复审条件：tailwindcss 移入运行时依赖或镜像打包方式变化。
- source-map-js 告警（alert #99）已修复：override 钉 1.2.2（#1069）。

- async 阻塞集群全关：路由层 #982、认证热路径与幂等管道 #983（PBKDF2 随
  #982 路由包装覆盖）。
- `app.dev` → `app/ops` 迁移完成，`app.dev` 包已删除：删除波 #986、reencrypt
  #987、运维工具波 #993、live_site 终波 #1001；生产镜像混入开发工具问题随包
  删除消解。
- 仓库清理波 #989：p5-b4 proof compose 归档、孤儿脚本删除、前端开发文档重
  校准、i18n 首批死键。
- i18n 动态键族契约 + 300 死键 #1000。
- CI 修复：选择器 impact 条目 #990、master E501 热修 #999、targeted 车道全
  仓 ruff 缺口修复（本批）。
- pg18-proof 泳道经评估**决定保留**（生产 PG18 契约唯一证据桥，CI 零执行成
  本；退役条件见讨论记录）。
- Mimosa 预提交门禁降为 warn 模式（`~/.zshrc`）。

## 3. 维护规则

- 完成一项就把它从第 1 节移入第 2 节并注明 PR 号；新发现的低收益项按同一
  格式追加（事实/成本收益/建议触发）。
- 本文档是队列不是承诺：任何项开始前仍须按 AGENTS.md 建变更信封。

# 战略定位 v1（2026-09-21）

Status: operator-directed strategy record. 本文记录产品方向判断与执行纪律；不构成
发布授权、功能完成声明、边界变更、生产或商业化决策依据。

修订记录：v1 初稿记录三层定位与路线图纪律；同日修订并入同行对标结论、
"不重复官方基础生成"定位、混合 BYOK 模式与端点分离纪律（操作者同日确认，
其中"站点写作画像"等用法属举例，不指定为唯一主打功能）；2026-09-22 增补
使命声明、六道使用门槛与使命判据（操作者确认，见第 1 节增补）。

## 1. 定位声明

Npcink AI Cloud 的产品定位是**面向中国境内建站者的 AI 建站提效平台**。文章撰写
提效是第一条竖切与当前阶段的全部主攻面，不是产品边界本身；后续提效面（媒体治理、
站点运维等）在满足第 8 节纪律后逐条开启。

最终形态：**单点提效功能 + 平台连接器 + 站点数据互联层**。平台顺序：WordPress
起步，其后 Typecho、Ghost、Hexo/Astro 与纯本地静态构建。

**不重复原则**：基础标题/摘要生成等商品化能力由平台官方 AI 表面承担
（WordPress 7.x 核心 AI 已内置），Cloud 不重建同类生成 UI。Cloud 的角色是
**让既有 AI 更懂站点**——通过站点知识上下文提升官方/已有表面的输出质量，
并提供官方不做、需要全站数据的能力。

### 使命（2026-09-22 操作者确认）

让 AI 落地：**让每个人都能方便地使用 AI 进行生产提效，降低使用门槛**。这是
三层结构、路线图纪律与全部后续决策的"为什么"。使命的第一次真实测试就是
本地优先链路本身：操作者本人是第一个"每个人"，链路中每一步卡住的地方就是
一道真实的门。

### 六道使用门槛

| 门槛 | 现状（2026-09-22） | 谁在拆这道门 |
| --- | --- | --- |
| 发现 | 尚无落地页与分发渠道 | 阶段 C 之后 |
| 安装 | 官方 AI 插件 + Cloud Addon 两点链路，需 WP 7.x | 主线已是两点；大众化靠 WP 6.x 轻插件（阶段 C） |
| 连接 | Portal 授权流程已建成 | 三点链路验证中确认"三步内可用" |
| 付费 | 支付宝实测通过、境内模型成本低、免费额度可锚定 | 商业闭环时收口 |
| 信任 | 境内服务器 + ICP 备案 + 个体工商户收款 | 同类产品中已属最强一档 |
| 认知 | 用户需先"会用 AI"——最大的一道门 | 按钮紧贴工作流 + 懂站上下文隐形生效 + 配置清零 |

第六道门是"每个人"与"会用 AI 的人"之间的关键一跳：由"懂你站的隐形上下文 +
默认可用"来拆，不要求用户先学会使用 AI——这也是数据互联层存在的使命级理由。

### 使命判据

任何新功能、新面板、新仓库立项前先回答：**它降低了六道门中的哪一道、
对谁？**答不上来的属于基础设施——可以做，但必须显式说明服务的未来场景与
兑现时点（治理栈、本地自动化运行时等均属此类，见第 8 节路线图纪律与
[next-stage-plan-2026-09-22.md](next-stage-plan-2026-09-22.md) 第 5 节冻结
清单）。这条判据用于防止"建"挤占"降门槛"。

## 2. 三层产品结构与现有资产

| 层 | 职责 | 现有资产 | 主要缺口 |
| --- | --- | --- | --- |
| 功能层 | 官方不做的、需要全站数据的提效功能 | runtime 执行域、eval-lab 中文评测基线、`related_content`/`internal_links` 等 11 种检索 intent | 真实采纳证据为零 |
| 连接器层 | WordPress 及后续平台的接入面 | cloud-addon 已注册为 WordPress AI 连接器（`npcink-cloud`，`title_generation`/`content_summary` 已注入隐藏 `writing_context`）、五个 PHP 插件、[multi-platform-connector-boundary-v1.md](multi-platform-connector-boundary-v1.md) | 公共内容 API（上下文/生成分离端点）、浏览器安全鉴权（公开 key）、CORS、JS/TS SDK、WP 6.x 轻量消费插件 |
| 数据互联层 | 站点知识、采纳反馈、运行证据的相互链接 | site_knowledge 域（中文 embedding、Zilliz 向量后端）、agent_feedback 端点、observability、correlation_id/traceparent 骨架 | 跨平台内容源抽象、采纳反馈数据闭环、非 WordPress 摄取路径 |

Site Knowledge 的具体现状、耦合清单与缺口见
[site-knowledge-inventory-2026-09-21.md](site-knowledge-inventory-2026-09-21.md)。

## 3. 核心论点：数据互联是壁垒

- 单点功能（摘要、标题、ALT 等）任何人可直接调用公开模型复现；站长缺少的不是
  "又一个摘要工具"，而是"懂我站的 AI"。
- 数据互联把功能从可替换变为有切换成本。知识层的用法家族（举例，不限于此）：
  - 全站内容图驱动的内链建议与前台相关文章推荐（eval-lab link-recommendation
    已有金标基线；`related_content` intent 已存在）；
  - 站点写作习惯分析与写作语气模仿（从现有 chunks 派生的统计投影，符合
    "派生投影、不拷贝真相"边界）；
  - 生成前的背景信息注入（`writing_context` 链路已在 WordPress AI 连接器运行）；
  - 媒体治理闭环（图片 ↔ 引用 ↔ 处理历史 ↔ 采纳反馈）；
  - 站级画像（巡检 + 运行证据 + 采纳记录，反哺功能路由与优先级）。
- Site Knowledge 从"内部增强"升格为战略资产，其演进从现在起按跨平台内容源
  抽象设计（抽象点清单见盘点文档第 5 节）。

## 4. 与既有边界的相容性（三条硬线）

数据互联方向与仓库既有边界体系相容，但必须守住：

1. **知识层是派生投影，不是数据真相拷贝。** 既定语义是"Cloud 拥有索引与新鲜度
   真相，平台本地拥有内容与写权限真相"
   （[site-knowledge-runtime-contract-v1.md](site-knowledge-runtime-contract-v1.md)）。
   Cloud 一旦充当第二内容真相、第二注册表或第二工作流真相，即违反 README
   Product Boundary。
2. **写操作治理留在平台侧。** WordPress 场景的提案/审批/预检/审计归 Governance
   Core；Cloud 永远 `suggestion_only`、不拥有最终写入。
3. **单点功能扩张纪律。** 在第一个外部站长产生真实采纳证据之前，不开新的提效面。

## 5. 机会面（按"数据打通后才可能"筛选）

| 域 | 场景 | 现有资产 | 缺口 |
| --- | --- | --- | --- |
| 写作 | 内链/相关文章/风格与语气增强的生成上下文 | link-recommendation 金标、site_knowledge intents、`writing_context` 注入链路 | 采纳反馈接入 |
| 媒体 | 图片 ↔ 引用 ↔ 处理历史 ↔ 反馈的治理闭环 | media_governance、image_context_evidence | 关联数据模型、采纳反馈 |
| 运营 | "哪类建议被采纳"的站级画像 | agent_feedback 端点、observability、夜间巡检 | 喂数据闭环 |
| 跨平台 | 静态站 / git 内容源接入；构建时相关文章缓存 | 连接器边界文档、Typecho PoC 规划、llms.txt 社区标准 | 内容源抽象层 |

注意战场区分：编辑时内链（Link Whisper 类，`internal_links` intent）与前台相关
文章推荐（`related_content` intent）是两个产品面；后者可在静态站构建时离线
计算并缓存，是切入 Hexo/Astro 的天然楔子。

## 6. 同行对标（2026-09 调研）

| 同行 | 做法 | 对我们的含义 |
| --- | --- | --- |
| Jetpack AI（Automattic 官方，3M+ 安装） | 编辑器内官方写作助手；20 次免费 → $10/月 | 官方已占住基础生成；不正面竞争 |
| AI Engine（Meow Apps，10 万+ 安装） | 免费 + BYOK（自带 provider key 直付），Pro 约 $79/年/站 | BYOK 冷启动模板；但纯 BYOK 无知识层即无壁垒 |
| Link Whisper | wp.org 免费版 + 按站点 license + 可选 AI 用量；编辑时内链 | 单点功能可独立成产品的证据；与前台相关文章不同战场 |
| Ghost 官方 | 2026-09 无官方 AI 生成（仅 AI 搜索优化方向） | 跨平台窗口存在；需求强度待 PoC 验证 |
| Chatbase / CustomGPT / SiteGPT | 贴 URL 爬站 → RAG → 挂件；约 $19–99/月；5 分钟接入 | "站点知识"市场已验证；但爬虫视角不懂 CMS 内部——我们的差异在长在编辑器/媒体库内 |
| llms.txt 运动（hexo-generator-llms 等） | 构建时产出 llms.txt / AI 摘要已成静态站社区标准 | 接标准不造格式；AEO（让站点被 AI 搜索引用）是新增需求入口 |
| 中文生态（SEO合集、5118 等） | 面向中文站长的 SEO/AI 工具，站外 SaaS 形态 | 中文站长付费习惯已有教育；站内原生体验是差异 |

对标结论：① 同行普遍"先分发后深化"，我们需以轻插件/连接器补分发面；
② BYOK 是冷启动王牌，但必须以知识层为锚；③ 单点功能可独立成产品，前台相关
文章推荐可作为静态站楔子；④ 官方表面已覆盖基础生成，验证"不重复原则"。

## 7. 混合 BYOK 模式与端点分离纪律

**定义**：生成可自带 key（用户直连 provider、费用直付），知识上下文永远是
Cloud 的服务。与 Link Whisper 式"纯本地 BYOK"的区别在于：后者无知识层，
等于放弃壁垒。

**成本结构支持**：上下文检索（embedding + 向量查询 + 排序）不消耗 LLM token，
单位成本极低（sync 本属 `site_knowledge_index_maintenance` 免费计量类）；生成
才是成本大头。因此"上下文低价/慷慨免费额度、生成可自带"在经济上成立，收费
锚点从模型用量转向**知识服务订阅**（量级对齐 AI Engine 的 ~$79/年/站；免费
额度锚 Jetpack 的 20 次/月）。

**平台顺序**：WordPress 上不自建 BYOK 写作助手——借道官方连接器面（cloud-addon
已注册 `npcink-cloud` 连接器），用户保留官方表面与自有凭据，选我们即获得知识
增强。非 WordPress 平台（Typecho/Ghost/静态站）无官方表面可借，公共 API +
瘦客户端 + 混合 BYOK 是合理形态。

**工程纪律**：公共内容 API 必须把**上下文检索端点**与**生成执行端点**分离定义、
独立计量。混合 BYOK 因此成为后续的开关（本地直连生成 + 调用 context 端点），
而不是一次重构。用户自带 key 的存储复用 cloud-addon 已有的加密凭证信封模式；
出站仅允许固定 provider 域名，延续 outbound endpoint policy 约束。

## 8. 路线图纪律（v1.1）

1. **公共内容 API 是第一优先级**：固定的上下文/生成分离端点 + 公开 key 鉴权
   （域名绑定、限额、限速）+ CORS。它是功能面与数据面的共同入口。
2. **Site Knowledge 按跨平台内容源抽象演进**（抽象点清单见盘点文档第 5 节）。
3. **采纳反馈闭环提前**：agent_feedback 端点已存在，缺真实数据；采纳率是提效
   产品的核心价值证明。
4. **WordPress 产品面 = 连接器路线 + 官方不做、需要全站数据的功能**；不自建
   基础生成 UI。
5. **非 WordPress**：公共 API + 瘦客户端 + 相关文章（构建时缓存）+ 混合 BYOK
   （二期开关）。
6. **媒体治理是资产最全的下一站**，但在采纳证据出现前不开工。
7. **已识别支线冻结出主线**：媒体批处理扩展、水印等确定性操作的云端化扩张。
   相关治理范围外溢分析（单图/批量授权倒挂、确定性操作占用 AI 云链路）发生于
   2026-09-21 会话，未单独成文，如需固化应补独立评审记录。

## 9. 战略风险

- **广度风险**：云端 `app/domain/` 已有 28 个域目录，单人产能是第一约束。愿景
  升级必须伴随"一条竖切走到底再开下一条"的纪律，否则边界文档与代码现状会再次
  超出操作者本人的跟踪能力（2026-09-21 会话中操作者对单图水印路径的认知落后
  代码 16 天，是这一风险的实证）。
- **平台官方化风险**：Jetpack/官方 AI 下场基础生成已被"不重复原则"规避；但若
  官方未来也做知识层，差异化将依赖站内深度与多平台中立。
- **境内就绪度（2026-09-22 更新）**：服务器位于境内且已有 ICP 备案、可正常
  访问；API 延迟待实测；生成式 AI 服务与 AI 生成内容标识合规仍待确认；收款
  主体为个体工商户且真实收款已实测通过、退款未完成。见
  payment-and-domestic-readiness-note-2026-09-22.md。
- **数据互联的安全与同意面**：服务端抓取各数据源需延续 cloud-addon outbound
  endpoint policy 的出站约束（HTTPS/DNS/大小限制，仅允许固定 provider 域名、
  拒绝环回/私网地址）；知识层的同意标准需在现有观测同意标准基础上扩展。

## 10. 交付与证据状态

development lane、documentation-only、L0。本文与配套盘点文档基于 2026-09-21 的
静态代码阅读、战略讨论与公开同行调研；不包含运行验证、M4 操作或生产变更。
基线：Cloud `master` `f799bfc6`（PR #982 之后）、Addon `master` `078bf419`。
本地优先验证阶段的现行计划在未合并分支 `codex/local-first-validation-20260921`
上，本文不改变其任何暂停/暂缓决定。

提交说明：本次 docs-only 提交经操作者明确授权豁免 Mimosa 预提交安全扫描拦截；
拦截原因为存量测试夹具假键（如 `tests/domain/test_openai_provider.py` 的
`api_key="test-api-key"` 桩值）的误报，与本任务改动无关，后续应单独处理扫描器
对测试夹具的规则或夹具本身。回退：删除本文与盘点文档并还原 `docs/README.md`
索引行。

## 11. 参考来源

仓库内：

- [site-knowledge-inventory-2026-09-21.md](site-knowledge-inventory-2026-09-21.md)
- [multi-platform-connector-boundary-v1.md](multi-platform-connector-boundary-v1.md)
- [refactor-master-plan-v1.md](refactor-master-plan-v1.md)
- [site-knowledge-runtime-contract-v1.md](site-knowledge-runtime-contract-v1.md)
- Addon 仓 `docs/site-knowledge-vector-operations.md`、
  `docs/site-knowledge-full-index-delivery.md`
- 分支 `codex/local-first-validation-20260921` 上的本地优先验证阶段计划（未合并）

外部同行调研（2026-09-21，公开页面）：jetpack.com、meowapps.com、wordpress.org
（Link Whisper Free）、linkwhisper.helpscoutdocs.com、ghost.org、chatbase.co、
sitegpt.ai、mintlify.com（llms.txt 平台指南）、github.com/SSARCandy/hexo-generator-llms、
cn.wordpress.org（SEO合集）、5118.com。

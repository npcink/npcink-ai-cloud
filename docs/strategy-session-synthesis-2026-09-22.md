# 战略会话综合纪要（2026-09-21/22）

Status: dated synthesis. 记录 2026-09-21 至 09-22 战略会话的讨论脉络、决定与
落实去向。本文是索引与摘要：各事项的权威在所指向的现行文档，本文不构成新的
决定或授权。

## 1. 会话时间线

| 阶段 | 讨论内容 | 落实去向 |
| --- | --- | --- |
| 体系认知 | 七仓库结构梳理、写操作黄金路径、边界体系 | 本文第 2 节 |
| git 确认 | 七仓状态核对；发现操作者已批准但未合入的本地优先计划 | PR #985 集成 |
| 问题诊断 | 以水印为例：治理范围外溢、单图/批量授权倒挂等八个问题 | 本文第 3 节摘要；详细评审记录待补 |
| 目标澄清 | 境内 WP 站长起步 → 多平台 → "JS 请求返回摘要"；四个零（浏览器鉴权/CORS/内容 API/SDK） | 战略文档第 2 节缺口列 |
| 愿景升级 | 建站全流程提效；数据互联是壁垒；三条硬线 | 战略文档第 3、4 节 |
| 文档化 | 战略定位 v1 与 Site Knowledge 盘点成文（含 Mimosa 拦截与操作者豁免） | PR #984 |
| 同行调研 | Jetpack AI、AI Engine（BYOK）、Link Whisper、Ghost、Chatbase 类、llms.txt、中文生态 | 战略文档第 6 节 |
| 定位收敛 | 不重复官方基础生成；混合 BYOK 与端点分离 | 战略文档第 1、7 节 |
| 规划 | 阶段 0/A/B/C 路线与提示词 P1-P5 | PR #988 |
| 执行 | 子智能体完成阶段 0 四项（支付事实、双观测点延迟、退款盘点） | PR #992、#994、#995、#997 |
| 使命 | 让 AI 落地、降低使用门槛；六道门与使命判据 | PR #1002 |

## 2. 七仓库体系总览（含 2026-09-22 重定位）

**主线三点**（当前唯一活跃产品面）：

- WordPress 官方 AI 插件（`ai/ai.php`，wp.org）：编辑器按钮、建议对话框；
- npcink-cloud-addon：连接/授权/HMAC 签名传输、WordPress AI 连接器投影
  （`npcink-cloud`，注入 `writing_context`）、反馈上报；
- npcink-ai-cloud：runtime 执行、计量与权益、Site Knowledge、agent-feedback
  接收、Admin/Portal。

**维持模式**（操作者 2026-09-22 定位为临时验证性项目，为以后扩大做准备，
验证期只修阻塞性缺陷）：

- npcink-abilities-toolkit：能力契约所有者（约 60 个一方能力，写类默认 dry-run）；
- npcink-governance-core：提案/审批/preflight/审计的唯一权威（5 张表）；
- npcink-ai-client-adapter：外部 AI 客户端通道、AI 套件发行包入口；
- npcink-workflow-toolbox：固定 review-only 工作流产品面、跨仓平台协调中枢
  （PR 发布契约与中央质量矩阵所在地）。

**质量管理**：npcink-eval-lab——开发期共享评测资产（标题/摘要/内链/媒体等
中文评测基线），各仓经薄脚本调用。

**写操作黄金路径**（扩大后启用）：客户端/Toolbox → Adapter → Governance Core
审批 → commit-preflight → Toolkit 能力执行 → 审计留痕；Cloud 永远
`suggestion_only`、不拥有最终写入。

## 3. 问题清单摘要（详细评审记录待补）

1. 治理范围外溢：为 AI 写操作建的治理栈被套到非 AI 站长操作上；单图/批量
   授权倒挂（ADR-017 后单图路径最重、批量反而最轻）；
2. 确定性图像操作（水印/裁剪/格式转换）占用 AI 云全链路，本地 GD/Imagick
   即可完成；云端 `media_batch_plans` 甚至用自然语言解析规划确定性操作；
3. 三种写入确认语义并存（编辑器正常保存 / 批量强确认 / 单图治理路径），审计
   落点各异；
4. 一个能力需跨 4-6 仓手工同步（水印涉及 7 仓 107 文件）；
5. 云端 28 个域目录的广度对单人产能构成第一约束；操作者心智模型曾落后代码
   16 天（广度风险的实证）；
6. 真实上线缺口：退款四块（回调入口/对账/失败终态/运营入口，见
   [refund-gap-inventory-2026-09-22.md](refund-gap-inventory-2026-09-22.md)）；
   支付状态已更新（见
   [payment-and-domestic-readiness-note-2026-09-22.md](payment-and-domestic-readiness-note-2026-09-22.md)）；
7. 云主机无法解析自身公网域名（记录性运维发现，见
   [domestic-latency-observation-2026-09-22.md](domestic-latency-observation-2026-09-22.md)）。

处置：收敛方向已入战略文档第 8 节纪律（支线冻结、治理只留给 AI 写场景）；
单图在场管理员例外恢复、确定性媒体操作本地化两项**未立项**，扩大前需独立
评审（评审记录缺口即第 1 项的"待补"）。

## 4. 决定与落实对照

| 决定 | 落实 |
| --- | --- |
| 不重复官方基础生成，差异化 = 站点知识层 | strategy §1 不重复原则 |
| 数据互联是壁垒 + 三条硬线 | strategy §3、§4 |
| 混合 BYOK（生成可自带 key，知识上下文是云服务）+ 上下文/生成端点分离 | strategy §7 |
| 公共内容 API 第一优先级 | strategy §8、next-stage §3、P5 提示词 |
| 阶段 0/A/B/C 排序与冻结清单 | next-stage-plan §1-§5 |
| 只处理本会话内容，不碰其他会话在途工作 | 历次 PR 的执行原则 |
| Mimosa 拦截的一次性豁免（存量测试假键误报） | strategy §10 记录；钩子治理已由操作者在别会话处理 |
| 四仓库进入维持模式 | 本文 §2、链路验证清单 §1 |
| 使命、六道使用门槛与使命判据 | strategy §1 增补 |

## 5. 当前待办

- 主线：三点链路验证（[wordpress-ai-loop-verification-checklist-2026-09-22.md](wordpress-ai-loop-verification-checklist-2026-09-22.md)）；
- 等触发：P5 公共内容 API 设计草案（本地优先标题 happy path 稳定后）；
- 退款四块缺口按 refund-gap-inventory §4 顺序补（契约先行 → 实现 → Admin
  入口 → 沙箱全链路）；
- 运维：云主机自解析问题排查（操作者）；
- 未立项待评审：单图例外恢复、确定性媒体操作本地化。

## 6. 参考文档

- [strategy-positioning-v1-2026-09-21.md](strategy-positioning-v1-2026-09-21.md)
- [site-knowledge-inventory-2026-09-21.md](site-knowledge-inventory-2026-09-21.md)
- [local-first-validation-stage-2026-09-21.md](local-first-validation-stage-2026-09-21.md)
- [next-stage-plan-2026-09-22.md](next-stage-plan-2026-09-22.md)
- [payment-and-domestic-readiness-note-2026-09-22.md](payment-and-domestic-readiness-note-2026-09-22.md)
- [domestic-latency-observation-2026-09-22.md](domestic-latency-observation-2026-09-22.md)
  及其补充
- [refund-gap-inventory-2026-09-22.md](refund-gap-inventory-2026-09-22.md)

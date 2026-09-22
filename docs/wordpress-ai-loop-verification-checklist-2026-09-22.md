# WordPress AI 链路验证清单（2026-09-22）

Status: dated active checklist. 本文是当前主线的执行口径：把"官方 AI 插件 →
Cloud Addon → 云端"三点链路跑通并收集证据。第 2 节六条标准全部满足后，本文
转为历史记录。不构成发布授权或完成声明。

## 1. 链路与范围纪律

```text
WordPress 编辑器（官方 AI 插件 ai/ai.php 在标题旁画按钮）
      ↓ 官方插件经 wpai_* 过滤器选中 npcink-cloud 连接器
Npcink Cloud Addon（连接 / 授权 / 任务投影 / 实现官方 Provider 接口）
      ↓ POST /v1/runtime/execute
Npcink AI Cloud（画像 → 路由 → Provider 执行 → Run 记录）
      ↓ 返回建议
WordPress（官方插件展示建议对话框 → 人工修改 → 保存 / 发布）
      ↓ 采用与质量事件
Npcink AI Cloud（/v1/agent-feedback/* 接收证据）
```

范围纪律：验证期只动这三点。npcink-abilities-toolkit、npcink-governance-core、
npcink-ai-client-adapter、npcink-workflow-toolbox 为临时验证性项目，处于维持
模式（只修阻塞性缺陷、不加新面）；npcink-eval-lab 按需提供质量门槛。

## 2. Done 标准（六条全满足才算通）

1. happy path：编辑器标题旁按钮返回可用标题建议，真实使用不少于 10 次；
2. 失败韧性：空结果、超时、Provider 错误不破坏编辑器流程，状态可解释、可恢复；
3. 写入边界：建议 ≠ 写入，仅人工确认保存才落库，无任何自动写回；
4. 幂等可解释：重复点击、取消、页面重试后，Run 记录与计费状态可解释、无重复
   扣减，两个独立新请求不被误判为同一请求；
5. 云侧证据：每次执行在云端有 Run 记录（usage、错误、实际命中的 Provider）；
6. 反馈闭环：`/v1/agent-feedback/*` 真实收到采用与质量事件，云端观测面可见。

## 3. 三步走（每步只加一个变量）

| 步骤 | 内容 | 检查点 |
| --- | --- | --- |
| 1 裸链路 | 不开 Site Knowledge 与观测上报，纯标题生成往返 | Done 1-5 |
| 2 开画像 | 开启 `site_knowledge_delivery_enabled`，`writing_context` 注入生效 | 重跑 1-5；同一篇文章有/无上下文的建议对比，复用 eval-lab generation-context 盲评模板 |
| 3 反馈闭环 | 开启观测上报，确认事件到达云端 | Done 6 |

两个开关默认关闭是安全默认。第 2、3 步每开启一个，先重跑第 1 步检查点再继续，
避免双开关叠加导致问题无法定位。

## 4. 复用资产（不要新造验收工具）

- [wordpress-editor-readiness-runbook-v1.md](wordpress-editor-readiness-runbook-v1.md)
  ——编辑器验收就绪前提；云端不可用时阻断而不是当作建议证据；
- [history/engineering/2026/wordpress-editor-acceptance-observation-2026-08-24.md](history/engineering/2026/wordpress-editor-acceptance-observation-2026-08-24.md)
  ——五样本延迟与证据基线，新一轮跑完对照；
- Addon PR #153：文本能力证据是浏览器验收的前置门；
- [local-first-validation-stage-2026-09-21.md](local-first-validation-stage-2026-09-21.md)
  的最小记录表——每次真实试用填一行；
- 编辑器验收收口工具（`codex/editor-acceptance-closeout-20260922` 会话在途），
  稳定后直接复用。

## 5. 注意点

1. 多会话协调：编辑器验收收口由另一会话进行，跑通验证前先确认其产物稳定；
2. 模型归因：DeepSeek 主模型 + Ollama 兜底配置下，评估建议质量先看 Run 记录
   实际命中的 Provider，不把兜底结果归因于主模型；
3. 测试环境：用可牺牲测试站或草稿验证保存行为；站点需 WP 7.x（官方 AI 插件
   与 Connectors 的前提）；
4. 云侧不动：验证期不做生产发布、不改 Provider 配置、不为测量制造付费调用。

## 6. 证据状态

本文是执行清单不是验收证据；完成情况按本地优先计划的证据状态规则逐条记录，
每步的产物是 dated 观测/记录文档加填写过的记录表。

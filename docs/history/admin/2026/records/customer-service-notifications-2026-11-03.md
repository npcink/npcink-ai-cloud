# 客户服务通知开发验证 — 2026-11-03

## Scope / Boundary

操作者要求依次落实临时客户通知建议。本批复用现有Portal收件箱，增加Admin
指定客户/全部活跃账户快照、纯文本预览、确认发送、结果查询与历史；修正既有
工单/试用/积分通知说明及站内跳转。不含邮件、营销、调度、WordPress写入、
真实客户发送、合并或生产操作。授权契约见[客户服务通知v1](../../../../customer-service-notifications-v1.md)。

## 本地证据

- 后端新功能domain/API/SQLite迁移：21 passed；3个真实PostgreSQL测试本地明确skip。
- 新增功能及既有生命周期/收件箱/工单事务相关定向回归：44 passed。
- `pnpm run verify:local`：通过；包含release-policy、Ruff correctness/import、targeted mypy、上述后端测试、TypeScript、ESLint、Admin28路由结构契约和定向Vitest。
- 完整Ruff新Python文件通过；i18n completeness通过；新contracts/proxy与既有navigation Vitest共27 passed。
- Admin视觉完整门禁：228项中227 passed、1张客户详情Mac golden失败。
  已逐图审查actual/diff：差异仅新增客户通知导航与发送通知入口；更新该单张Darwin基线。
  随后客户详情8项＋通知4项＋Portal6项，18 passed。未将定向复验改写成完整门禁全绿。
- 发送成功后移除重复禁用表单，通知4项再次通过；1440×1050、1056×800、
  中文/英文与结果明暗均有截图，代理复查通过。人工视觉验收待进行。

## 修复中发现的问题

初次浏览器运行因外部node_modules软链接导致Turbopack失败，改为离线冻结安装；
最初缺少路由IA登记已补齐。select隐式label匹配、重复查询按钮、误用HTML title
作为区块标题等由浏览器失败暴露后修正。另补预览过期明确恢复、历史请求乱序隔离、
存储失败保留最新文本、响应操作者/收件人证据约束。没有放宽断言或截图阈值。
`verify:local`初跑因Next生成的next-env.d.ts被ESLint忽略而失败；移除生成差异后通过。

## 候选与交付状态

本地开发候选已验证；M4 candidate与真实PostgreSQL验证待本次后续记录。
Linux对应golden需要真实Linux浏览器生成并审查；不会复制Mac图冒充Linux证据。
CI、PR、merged、M4 accepted、production、human acceptance均未完成。
本记录不授权生产部署或真实客户发送。

## 外置证据

当前任务独立目录：`/Users/muze/.codex/visualizations/2026/11/03/customer-service-notifications/`。
`local-broad/`保留新增页面截图/回执以及旧golden的actual/diff/trace；
后续定向最终图保留在`local-final/`。截图均为合成客户与合成消息。

## Review / Risk

核对正确性、边界、权限、恢复和查询上限；无新依赖，无Provider花费。
预览绑定原操作者和不可变内容；未知结果保留批次，重复发送使用同一ID；
发送/收件箱/审计同事务。最多1000账户，超限拒绝；发送前资格变化只跳过。
普通应用回退保留新增批次表；0092降级会丢弃批次历史，须先保存相应数据。
入收件箱不代表客户已看到，当前不提供邮件或紧急触达保证。

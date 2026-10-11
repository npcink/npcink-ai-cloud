# 支付与境内就绪度状态记录（2026-09-22）

Status: dated operator-fact note. 来源为操作者 2026-09-22 会话口头确认，尚未附系统证据；后续补充证据时应以新的 dated 记录追加，不修改本文。

## 1. 境内就绪度

- cloud.npc.ink 生产服务器位于中国境内（操作者提供的云主机；IP 与凭据不入库）。
- 域名已完成 ICP 备案；操作者确认可正常访问。
- API 延迟尚未实测，以后续 domestic-latency-observation 记录为准（见
  next-stage-plan-2026-09-22.md 的 P3 任务）。

## 2. 支付状态

- 收款主体：个体工商户，资料齐备。
- 支付宝真实收款已实测成功（操作者 2026-09-22 确认）。这更新了本地优先计划
  中"真实支付配置与收款暂缓"的状态：收款路径已进入实测通过阶段。
- 退款功能未完成：代码层退款 adjustment 与幂等基础已存在（payment/credit 契约），
  真实退款流程缺口待 refund-gap-inventory 盘点确认（next-stage-plan P1）。

## 3. 对现行文档的影响

- strategy-positioning-v1-2026-09-21.md 风险节"境内就绪度未确认"收窄为"仅延迟
  未测"（本任务同步修订）。
- local-first-validation-stage-2026-09-21.md 保持原文，顶部加状态指引指向本文。
- 暂缓清单中"真实支付宝收款/生产支付配置"的状态以本文为准重新评估；其余暂缓
  项不变。正式商业化 closeout 前需以系统证据替代口头确认。

## 4. 证据状态

development lane、documentation-only、L0。本文不含任何凭据、密钥或服务器地址。

# 境内访问延迟观测（2026-09-22）

Status: dated observation record. HTTP 探测、有限样本，非 SLA；只证明观测时点的
可达性与量级，不授权任何发布或容量结论。

> 补充（2026-09-22）：第二独立观测点（境内跨云 ECS）已补测，P95 ≈138ms，
> 同步端点结论不变，见
> [domestic-latency-observation-supplement-2026-09-22.md](domestic-latency-observation-supplement-2026-09-22.md)。
> 本文其余内容为原始记录，未改动。

## 1. 方法

- 目标 GET https://cloud.npc.ink/health/live（完整 TLS 往返，含 DNS 与握手），
  每观测点连续 20 次 curl 计时，取 min/P50/P95/max。
- 观测点 A：操作者 macOS 本机（境内网络）；目标解析为境内云主机（IP 不入库）。
- 观测点 B：原计划为第二境内观测点；操作者提供的主机即 cloud.npc.ink 目标
  服务器本身，仅构成"自测"，且自测失败（见第 3 节）。
- 未对真实 runtime/生成端点计时（避免制造付费调用）。

## 2. 结果（观测点 A：境内本机）

n=20；min 56ms、P50 69ms、P95 90ms、max 182ms；失败 0。首样本 182ms 为
冷启动（DNS/TLS 首次握手）离群，其余 55–90ms 稳定。

## 3. 观测点 B（目标服务器自测）：失败与记录性发现

- 该主机无法解析 cloud.npc.ink（getent 为空）；20 次请求全部约 20 秒超时且
  未建立连接（无 remote_ip）。
- 结论：自测数据无效（其本也不构成独立观测点）。同时记录一个运维观察：
  云主机自身无法解析自己的公网域名——若服务器侧任何组件按域名回环调用
  自身（回调、webhook、健康自检），将超时。属记录性发现，不在本任务诊断
  或修复。

## 4. 结论与阈值对照

对照 [next-stage-plan-2026-09-22.md](next-stage-plan-2026-09-22.md) P3 的
阈值：境内客户端 P95 约 90ms，远低于 1 秒——公共内容 API 的同步端点形态
成立，异步/流式/边缘加速不构成前置条件。

限制：单一家宽观测点、20 样本、健康端点不含模型生成耗时。建议阶段 B 落地
后对真实 context/generation 端点补测一次；如需第二独立境内观测点（如某个
WordPress 站点服务器），由操作者另行提供。

## 5. 证据状态

development lane、documentation-only、L0；本文不含服务器 IP 与凭据。

# 正式用户观测方案开发复盘（2026-08-19）

Status: time-bounded production historical evidence; not current release authorization.

Current authority: [Cloud Production Release Policy](../../../cloud-production-release-policy-v1.md).

## 原定目标

- 本地阶段先消除大部分问题；
- 正式用户不承担测试操作；
- 管理员连接后能明确授权匿名诊断；
- 支持人员能清晰识别站点并排查工单；
- 提前准备数据收集和埋点，但不扩大 Cloud 控制面；
- 最终生成可人工安装的 Addon 包。

## 完成情况

- [x] Addon 在连接验证完成后显示 monitoring consent dialog；
- [x] Cloud 观测摘要投影站点名称和 URL，同时保留 `site_id`；
- [x] 正式流程不要求 cohort；
- [x] Cloud 和 Addon 均完成本地确定性验证；
- [x] M4 候选同步和 focused 测试通过；
- [x] Addon ZIP、清单、Plugin Check、Playground 全部通过；
- [ ] 尚未进入 PR 合并、正式 Release 或生产部署（按授权范围保留）。

## 关键经验

1. 先区分“身份、同意、观测、实验”四种事实，再设计字段和界面。
2. 对正式用户场景，减少操作比增加配置能力更重要；授权应靠近连接验证完成点。
3. 复用已有 `Site` 真源比新增站点映射字段更高效，也更容易保证工单定位稳定。
4. 先做窄测试，再做 M4/Playground 等更接近运行时的验证，避免重复消耗时间和预算。
5. 全量视觉门中的既有失败要单独记录，不能把无关失败归咎于当前改动，也不能借机扩 scope。
6. “代码通过” “候选包通过” “已合并” “已发布” “已部署”必须分开报告。

## 自我批评

早期方案曾把 `cohort` 过度解释为正式站点/测试批次，并把 monitoring 主要放在设置页。
根因是没有先以“正式用户零操作”和现有 Site 真源为首要约束进行建模。改进方式是：
今后先写四类事实表和明确非目标，再决定字段、页面和传输；任何新增身份字段必须先证明
现有真源不能满足需求。

## 后续工作

- 人工安装 ZIP 后完成一次真实站点的连接验证和授权确认观察；
- 收集匿名观测数据后，只基于证据优化错误率、延迟和支持定位；
- 若要引入实验分组，另写实验合同，明确 cohort 生命周期、样本范围和退出方式；
- 不自动打开 monitoring，不把观测摘要扩展成客户画像。

# ADR-048: 将正式用户观测授权放入连接验证完成流程

## 状态

Accepted

## 日期

2026-08-19

## 背景

历史讨论希望绑定站点、收集匿名数据并支持工单排查，但早期方案把 `cohort`、
monitoring 和站点身份混在了一起：这会要求正式用户或管理员做额外配置，也可能
把 Cloud 推成第二个 WordPress 控制面。

当前产品实际情况是：邀请使用者是正式用户，不存在生产测试批次；Cloud 已有
`Site.site_id`、`Site.name` 和 `Site.site_url`；Addon 已有 verified 状态和
匿名 metadata-only observability transport。

## 决策

1. `site_id` 继续作为正式站点的稳定身份，不新增 `site_ref`。
2. 连接验证完成后由 Addon 显示一次明确的管理员 consent dialog。
3. monitoring 仍由 WordPress 本地授权拥有，允许后复用既有观测传输。
4. Cloud 管理员观测摘要只读投影 `Site.name` 和 `Site.site_url`。
5. `cohort` 仅为未来显式实验字段，普通正式流程不填、不展示、不依赖。
6. 正式用户零操作；本地测试使用 Fake Provider，与正式数据隔离。

## 被否决的替代方案

### 强制设置页配置

被否决：管理员容易遗漏，连接验证和授权意图被拆成两个页面，增加支持成本。

### 用 cohort 绑定客户/站点

被否决：批次标签不是业务身份；会产生生命周期、迁移和数据混淆问题。

### 新增 site_ref 或第二站点注册表

被否决：现有 Cloud Site 已是身份真源，重复建模会造成双写和不一致。

### 将站点名称写入每条事件

被否决：名称可能变更，增加事件体积和隐私暴露；摘要查询时投影即可。

## 后果

- 管理员只需在连接完成后做一次清晰选择；
- 工单页面同时具备可读站点名称和稳定 `site_id`；
- 观测链保持 metadata-only 和只读边界；
- 实验分组和正式身份被明确分离；
- 未来新增数据字段必须经过用途、同意和保留期限审查。

## 验证证据

- Cloud 观测管理测试 11/11 通过，本地与 M4 focused 均通过；
- 前端 type-check、lint、`check:admin-ui` 通过；
- M4 候选同步对应提交 `beb232df`，API/Frontend 健康；
- Admin 全量视觉门 52 通过、2 个既有基线失败，失败不在本变更路由；
- Addon 精确发行 ZIP 通过清单、ZIP、Plugin Check strict 和 Playground 激活冒烟。

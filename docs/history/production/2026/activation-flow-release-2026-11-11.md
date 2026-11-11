# 激活流程生产发布 — 2026-11-11

Status: dated production installation evidence; real WordPress binding/activation/return acceptance remains pending.

## Scope and boundary

操作者明确授权合并并部署生产。精确 production 为 `15ae3f4efc7bf41f3ab42b6b71b9458a16a3b90c`，应用源码冻结于 master `8fe0b88a`，含 Cloud #1407 显式连接/激活及 #1408 焦点恢复。Addon #350 已合入 `1c8f52074753a5833de730a3c970e3a71736c5b2`；不证明客户插件已更新。

历史分支冲突使用 #1414 reviewed-tree integration 处理。部署前通过 #1415/#1416 恢复默认 CodeQL 规则，仅精确过滤已审查且源码 hash 未变的三个误报。不包含摘要修复 #1413 或后续本地候选。现行契约、版本地板、WordPress 写权和暂停边界不变；无新增迁移文件或运行配置变化，标准 Alembic upgrade/head 门禁仍执行。

## Evidence states

| 状态 | 证据 | 限制 |
| --- | --- | --- |
| local | Cloud定向144通过1跳过，browser定向7通过，Addon门禁通过；扫描纠正10测试通过 | 不等于生产或人工验收 |
| CI | 精确production Cloud CI42976561796、CodeQL42976561801成功；plan13835347963、bundle13836165959 | 不替代实际安装 |
| M4 candidate | `24bc37fdee3d` 定向8通过且健康 | 不宣称最终15ae已在M4验收 |
| merged | 功能和必要后续合入；#1416固定最终production15ae | Addon客户安装另验 |
| production | [Deploy Production #54](https://github.com/npcink/npcink-ai-cloud/actions/runs/42977066716)成功；`installation_state=complete`；独立主机与公网核验通过 | 正式认证业务smoke未运行 |
| human/business | 待完成 | 真实绑定、替换激活、返回回写和自然采用未在本次重复执行 |

## Installed identity and health

- Release: `release-7476f023a6a038e7-20261111070654-2275`。
- Archive: 242,525,317 bytes；SHA256 `7476f023a6a038e7439e3ab39743388c898f91bdd99537448c84da5b267aabb4`。
- Manifest SHA256: `d29459a0a39060b99bc400268afcedefffc67b91d03607e8b898d08beaa83838`。
- 08:40:06Z独立只读核验：manifest为完整15ae，七服务精确镜像匹配、运行、重启0、无OOM，内部operational-ready通过；安装标记存在，deploy/one-off锁和失败标记均已清理。
- 公网 `/health/live`、`/api/health` 均HTTP200且健康；前端完整15ae、后端 `15ae3f4efc7b`，release一致、dirty=false。
- small-customer preflight通过公开健康、页面及保护性拒绝检查；日志同时提示未提供认证smoke凭据。正式release smoke按输入未运行，不能称为完整认证验收。

## Timing, recovery boundary and limitations

只发起一次主机部署，无取消、重试或并发安装。07:06:21Z dispatch，08:39:04Z job完成。完整包上传5160秒（86分钟），只读证据确认持续增长；远端部署sequence313秒。结构化receipt的阶段合计5462秒不等于全部workflow墙钟时间。外部网络根因未定位。

08:36:41Z曾观测切换期502；受控停服务后，one-off、API及worker门禁顺序推进，08:39:25Z独立公网观测为新版本200。离散观测与部署时长不是精确停机时间。

回退基线 `4af1aca79a5936c71c29f8bc4d99fbf2c648fcfc` / `release-3465a3bf765c696c-20261111031030-46556` 的既有包和证明保留，未演练回退。新包、checksum、run/plan/timing及安装证明保存在仓库外发布证据目录，不提交归档、主机目标或凭据。

本次未购买、未付费调用模型、未修改真实WordPress内容或客户绑定。真实业务闭环与人工采用须单独验收。

## Residual PC UI acceptance

生产只读PC复验观察到：device详情的“修改站点名称”弹窗点击取消后关闭且名称不变，但焦点落到BODY；键盘打开后按Escape也未观察到关闭，最终通过取消退出。该弹窗的具体来源和修复范围待独立核对，不把#1408或生产健康通过外推成所有弹窗键盘验收通过。本次未保存名称或重新部署。

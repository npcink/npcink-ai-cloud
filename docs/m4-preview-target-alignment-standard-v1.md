# M4 预览目标与 18010 对齐规范 v1

状态：active operating guidance。

## 目的

避免代码已同步但 18010 仍显示旧页面。18010 是一条本地隧道地址，实际可能连接 LAN、Pgy 或 Tailscale 的不同 M4 运行时；同步目标和隧道目标必须一致。

## 固定流程

1. 同步前运行 `pnpm run m4:preview:tunnel -- --auto`，记录输出的 `selected_route` 和 `ssh_target`。
2. 使用同一个 `NPCINK_CLOUD_M4_SSH_HOST` 执行 `m4:preview:sync`；不得仅依据本地 URL 判断版本。
3. 同步完成后运行 `pnpm run m4:preview:status`，核对 `source_revision`、`source_dirty` 和前端指纹。
4. 在 18010 页面执行强制刷新，并核对页面底部版本标识或 `/api/health` 的部署身份。
5. 若隧道自动切换路径，必须重新同步到新路径，再开始浏览器验收。

## 失败处理

- 页面仍是旧版本时，先比较隧道 `ssh_target` 与同步目标，不修改页面代码。
- 发现目标不一致，停止验收，按当前隧道目标重新同步。
- 隧道或 SSH 失败时保留证据，使用项目允许的下一条路径；不得把不同路径的页面结果混在一起。
- 记录 `candidate`、`merged`、`accepted` 状态；候选预览不等于合并或正式发布。

## 最低回执

每次候选同步至少记录：18010 端口、隧道路由、同步目标、源分支/修订、前端指纹、强制刷新后的页面版本和浏览器验证结果。未测量项写 `not measured`，不得推断。

## 适用范围

本规范适用于 Cloud 管理后台和本地 WordPress 连接器预览，不改变 Cloud 与 WordPress 的数据所有权，也不授权生产部署。

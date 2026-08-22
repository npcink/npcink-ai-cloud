# M4 单人网页预览自动选路复盘（2026-07-25）

Status: historical M4 implementation evidence; current M4 standards and live state are authoritative.

状态：已完成，已合并。

关联实现：

- PR：`#253`
- 合并提交：`1cfa808ac67b6d79237e1b7f95da1b1d46ab3835`
- 统一命令：`pnpm run m4:preview:auto`
- 固定浏览器入口：`http://127.0.0.1:18010`

## 1. 要解决的问题

Cloud 的源码和 Git 由开发机维护，Docker 运行时位于办公室 M4。操作者只有
一人，但存在两种网络环境：

1. 在公司时，开发机与 M4 位于同一局域网；
2. 在宿舍时，开发机无法直接访问公司局域网，但开发机与 M4 都可使用
   Tailscale。

日常预览不需要经过 `cloud.mqzjmax.top`，也不需要多人共享入口。公网域名、
Cloudflare Access、QQ 登录审核和真实服务器验收不属于本问题。

目标是让操作者在两个地点都执行同一条命令、打开同一个浏览器地址，不需要
记忆当前应使用局域网 IP 还是 Tailscale IP。

## 2. 已确认的边界与现场事实

M4 的相关地址和端口为：

| 项目 | 值 |
| --- | --- |
| 办公室局域网 SSH | `muze@192.168.10.200` |
| Tailscale SSH | `muze@100.102.170.79` |
| M4 Preview Proxy | M4 本机 `127.0.0.1:8010` |
| 开发机浏览器入口 | 开发机本机 `127.0.0.1:18010` |

M4 Docker 发布端口必须继续绑定 `127.0.0.1`。现场检查确认：

- M4 本机请求 `http://127.0.0.1:8010/` 正常；
- 从开发机直接请求 `192.168.10.200:8010` 不可用；
- 从开发机直接请求 `100.102.170.79:8010` 不可用；
- 通过 SSH 本地端口转发后，首页和 `/health/live` 均返回 `200`。

这不是端口故障，而是安全边界的预期结果：应用端口不向 LAN 或 Tailscale
直接暴露，访问必须通过 SSH 隧道进入 M4 的 loopback。

## 3. 方案比较

### 3.1 采用：局域网优先、Tailscale 回退的 SSH 隧道

统一链路为：

```text
browser 127.0.0.1:18010
        -> SSH local forward
        -> M4 127.0.0.1:8010
```

自动选择顺序：

1. 通过 `muze@192.168.10.200` 检查 M4 `/health/live`；
2. 局域网路径不可用时，通过 `muze@100.102.170.79` 再检查；
3. 选择第一条实际返回健康响应的路径；
4. 两条路径均不可用时失败并给出明确诊断提示。

### 3.2 未采用：将 `8010` 绑定到 LAN 或 `0.0.0.0`

这样虽然能直接打开 `http://192.168.10.200:8010`，但会扩大服务暴露面，还要
额外维护防火墙、来源限制和登录安全。对于单人开发没有收益。

### 3.3 未采用：通过源码中转服务器代理网页

私有中转服务器的职责是临时传递部署源码包，不是反向代理或第二个运行入口。
让网页经过中转会增加一跳，并引入持续服务、Cookie、WebSocket、鉴权、日志
和故障归属问题。

### 3.4 未采用：日常使用 `cloud.mqzjmax.top`

公网域名适合验证 Cloudflare Access 或外部环境，不适合作为个人开发的默认
内环。它增加公网链路和 Access 登录过程，也不能替代本地 WordPress 连接所需
的非重定向 JSON API。

## 4. 实现

`scripts/m4-preview.sh` 的 `tunnel --auto` 完成自动选路，
`package.json` 提供稳定入口：

```bash
pnpm run m4:preview:auto
```

脚本保持以下不变量：

- 浏览器地址始终为 `http://127.0.0.1:18010`；
- SSH 隧道只绑定开发机 `127.0.0.1`；
- M4 目标始终是 `127.0.0.1:8010`；
- 隧道以前台进程运行，`Ctrl+C` 即关闭；
- 不同步源码、不使用源码中转、不获取部署锁、不修改容器；
- 原有 `pnpm run m4:preview:tunnel` 仍可用于明确指定 SSH 目标。

可覆盖项：

```text
NPCINK_CLOUD_M4_LAN_SSH_HOST
NPCINK_CLOUD_M4_SSH_HOST
NPCINK_CLOUD_M4_TUNNEL_LOCAL_PORT
```

这些变量只允许合法 SSH 目标或端口值，不能通过空格或命令字符注入 SSH
参数。

## 5. 关键踩坑与修正

### 5.1 不能只检查 TCP

历史经验已经证明：TCP 端口可连接不代表 HTTP 路径可用。自动选路直接通过
SSH 在 M4 上请求：

```text
http://127.0.0.1:8010/health/live
```

只有收到成功 HTTP 响应才选择该路径。

### 5.2 LAN 与 Tailscale 不能共用过短超时

第一版对两条路径都使用 2 秒、1 次连接尝试。真实回退测试曾把可用的
Tailscale 路径误判为不可用。

最终策略：

| 路径 | ConnectTimeout | ConnectionAttempts | 原因 |
| --- | ---: | ---: | --- |
| LAN | 2 秒 | 1 | 同网段应快速成功或快速失败 |
| Tailscale | 5 秒 | 3 | 首次建链可能需要路径协商或中继回退 |

这保留了公司场景的快速响应，同时避免宿舍场景被瞬时握手失败阻断。

### 5.3 `portal-demo@example.com` 不能从普通登录页收验证码

`/portal/login` 是正式邮箱验证码登录路径。M4 没有配置 SMTP 时，从该页面
提交 `portal-demo@example.com` 会收到：

```text
portal.email_not_configured
```

该地址是开发身份，应通过开发入口建立会话。使用本地隧道时必须显式提供
本地 `origin`，否则 M4 的公共基础地址可能使浏览器跳转到
`cloud.mqzjmax.top`。

本地入口：

```text
http://127.0.0.1:18010/portal/dev-entry?origin=http%3A%2F%2F127.0.0.1%3A18010&redirect=%2Fportal
```

实测返回 `303`，目标为：

```text
http://127.0.0.1:18010/portal
```

开发入口不需要 SMTP、邮箱验证码或 Portal 密码。普通 `/portal/login` 留给
真实邮件配置验证。

## 6. 最终操作方式

在包含最新 `master` 的源码工作区执行：

```bash
pnpm run m4:preview:auto
```

看到下列任一输出即表示已选路：

```text
[m4-preview] selected_route=lan
```

或：

```text
[m4-preview] selected_route=tailscale
```

然后打开：

```text
http://127.0.0.1:18010
```

Portal 开发会话直接打开第 5.3 节的 `/portal/dev-entry` 完整地址。使用完成后
在隧道终端按 `Ctrl+C`。

## 7. 验证证据

最终实现完成了以下验证：

- Shell 语法检查通过；
- M4 Preview 定向契约测试：`25 passed`；
- `check:anti-drift` 通过；
- `tests/contract + tests/domain`：`1422 passed, 3 skipped`；
- GitHub PR body、Secret scan、依赖审计、前端、CodeQL 和后端门禁通过；
- 公司 LAN 自动选择：首页 `200`，一次最终观测约 `76 ms`；
- 强制 LAN 不可达后自动选择 Tailscale：首页 `200`，一次最终观测约
  `70 ms`；
- 本地 Portal 开发入口：`303` 跳转到本地 `/portal`。

时延只是 2026-07-25 在办公室网络中的单次观测。Tailscale 回退是在办公室
通过禁用 LAN 候选模拟的，不代表宿舍网络的长期性能基线。宿舍现场仍应以
实际输出和 HTTP 响应为准。

## 8. 故障排查

| 现象 | 判断 | 处理 |
| --- | --- | --- |
| `selected_route=lan` | 公司 LAN 路径正常 | 打开 `127.0.0.1:18010` |
| `selected_route=tailscale` | LAN 不可用，Tailscale 正常 | 可继续预览 |
| 两条路径都不可用 | M4、SSH、Docker 或 Tailscale 至少一项异常 | 检查 M4 电源、Tailscale 在线状态，再运行 `pnpm run m4:preview:status` |
| 本地 `18010` 被占用 | 已有隧道或其他进程 | 复用已有隧道，或用 `-- --local-port <port>` |
| 首页能开但登录报 `portal.email_not_configured` | 错用了正式邮箱登录 | 使用本地 `/portal/dev-entry` 完整地址 |
| 开发入口跳到公网域名 | 未提供本地 `origin` | 使用第 5.3 节的完整 URL |
| SSH 可连但页面超时 | 不能仅依据 TCP 判断 | 分别验证 M4 loopback 和隧道后的 `/health/live` |

## 9. 后续开发与 AI 执行规则

后续人或 AI 处理同类问题时：

1. 先确认当前操作机器和 M4 身份，不复用历史 PID 或未经核验的端口状态；
2. 保持开发机为源码/Git 真相，M4 只承担 Docker 运行和验证；
3. 个人预览默认使用 `pnpm run m4:preview:auto`；
4. 不将 M4 Preview 端口改为 LAN、Tailscale 或公网监听；
5. 不把源码中转服务器扩展成网页代理或第二控制面；
6. 诊断连接时必须验证 HTTP，不以 TCP 成功代替应用可用；
7. 不为 `portal-demo@example.com` 配置虚假邮箱链路，使用开发入口；
8. 只有修改应用、Compose、依赖或运行配置时才需要同步/部署 M4；修改本地
   隧道脚本或文档不要求重建 M4；
9. 保留原脏工作区，实施发布流程时使用干净、最新的独立 worktree；
10. 报告时区分代码完成、测试通过、PR 合并、M4 部署和真实地点验收。

## 10. 回滚

自动选路是本地操作辅助，不改变 M4 运行状态。需要回滚时：

1. 移除 `m4:preview:auto`；
2. 移除 `tunnel --auto` 的 LAN/Tailscale 选择逻辑；
3. 继续使用原命令：

```bash
pnpm run m4:preview:tunnel
```

回滚不需要停止、重建或迁移 M4 容器。

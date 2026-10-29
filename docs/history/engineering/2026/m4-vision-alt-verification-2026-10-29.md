# M4 视觉 ALT 接入修正（2026-10-29）

Status: development investigation and verification record。生产不在本次范围。

## 问题与原因

10 月 28 日 WordPress 生图导入的自动 ALT 返回 `unsupported_model`，能力快照为 `vision: unavailable / no_eligible_model`。当时将它概括为“没有可用视觉模型”，只停留在消费端症状，未继续核对宿主机模型和当前连接，是本次排障遗漏。

10 月 29 日通过 SSH 确认 M4 已安装 `qwen3-vl:2b`，同时声明 `completion` 与 `vision`。`vision.ai` 已绑定当前 `ollama-m4-embedding/qwen3-vl:2b` 实例；旧 `ollama-m4/qwen3-vl:2b` 有验证记录，当前实例没有。安装、旧身份验证和当前路由可执行是不同状态。

进一步检查发现，连接 ID 与 Provider ID 不同时，运行路由使用连接配置生成的标识，而后台能力验证、展示和用途保存仍使用 Provider ID。该不一致会造成错误复用旧缓存，或真实验证成功却无法准入。修复将既有运行路由的连接标识算法提取至目录仓库复用；保留同名连接的现有规则，不迁移或伪造历史证据。

## 防复发验证

新增回归覆盖：连接别名不能复用原 Provider 的验证缓存；真实模拟验证后运行路由、后台展示和用途保存均识别同一记录；重复验证复用当前缓存；修改连接端点使旧记录失效，重新验证后才恢复可路由。该用例在修复前因错误命中旧缓存失败。

操作规范已补入[开发生图手册](../../../development-image-api-runbook-v1.md#视觉能力不可用时的必查步骤)。先检查现有模型、连接、实例、验证指纹和用途，再刷新 WordPress 能力并执行真实 ALT，不以购买模型或手工改为 verified 代替排障。

## 现场验证与边界

现场执行结果在完成后补记；候选、CI、合并和 M4 accepted 分别记录，不能提前宣称通过。不改嵌入向量空间、重排研究、付费视觉路由、生产配置或 WordPress 最终写入权。

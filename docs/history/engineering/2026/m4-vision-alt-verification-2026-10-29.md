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

本地相关 API、路由和能力测试 249 项通过；仓库 `verify:local` 通过（其中 connector API 230 项），Ruff、定向 mypy、586/586 文档可达检查及 release-policy 门禁通过。

M4 候选的当前实例通过正式能力验证接口，HTTP 200、state=verified、cache_hit=false，墙钟约 9.29 秒；后台投影有当前视觉验证，实际 `vision.ai` 路由仅解析到 `ollama-m4-embedding/qwen3-vl:2b`。

本地 WordPress 强制刷新能力快照后 `vision` 为 configured。复用上一轮 Kolors 图片，通过官方 `ai/alt-text-generation` 与 Addon 上传路径执行，未重新生图：

- 临时附件 `282977`，提示上下文未预先描述图片主体；模型返回“窗台上放着一只蓝色马克杯和一本打开的书，窗外是绿树和阳光。”，墙钟约 9.13 秒。
- Cloud run `run_a202e6127b11477981eae9f47044f286` succeeded，profile=`vision.ai`、execution_kind=vision、实际模型为当前 Qwen3-VL 实例；Provider 调用一次、无重试、无回退，无付费视觉调用。
- Ability 返回建议后本地附件 ALT 未改变；临时附件和源文件已删除。未改已有文章或媒体，不把自动化调用当作人工采用。
- 单张图的描述与主体基本一致，只证明这条开发链路可用，不是模型准确率评测；使用者仍应复核 ALT。

以上是候选时期的实际消费证据。CI、合并和 M4 accepted 分别以对应 PR 与后续状态回执为准，不改嵌入向量空间、重排研究、付费视觉路由、生产配置或 WordPress 最终写入权。

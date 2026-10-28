# 本地开发生图与 WordPress 闭环验证（2026-10-28）

Status: local automated consumer evidence；候选验证记录，不是生产或自然人工采用证明。

## 范围与配置

操作者授权依次完成免费 Kolors 的 WordPress 联调与代码交付。Z-Image-Turbo 仅用于有实际配图需求的开发调用，本轮没有调用；生产模型由操作者另外指定。配置、预算与回退见[开发生图手册](../../../development-image-api-runbook-v1.md)。

Cloud 候选基于 `24dcc3cb34f005082ba74976da572cb5e2ac6dee`，只增加 SiliconFlow 的 Z-Image 原生参数映射；没有新增推理服务。M4 运行的适配器文件 SHA256 为 `bec36a12fb287988b86c35b6cfaadb89a7eb5ccf3ee56210e09ea13d44322094`，与本地候选一致。本地相关回归 127 项、M4 定向测试 17 项通过；后续 CI、合并、M4 accepted 必须单独核对。

Local WordPress `7.1.3`，开发站 `https://magick-ai.local`；Addon 经本机隧道连接 M4。只读能力刷新显示 image_generation configured，provider_call_performed=false；随后真实运行才提供执行证据。`wp-ai.image-generation` 仅解析到 Kolors，关闭回退和重试、超时 90 秒。未修改生产或既有文字用途。

## 媒体生成页 → 编辑器保存

使用本轮新建草稿 `282971`，输入固定的桌面、蓝色陶瓷杯与笔记本提示词。

| 检查 | 结果 |
| --- | --- |
| 官方 `ai/image-generation` | HTTP 200，浏览器可解码 1024×1024 图片 |
| 保存前写入边界 | 生成预览后新附件为 0，草稿正文摘要未变、特色图片为 0 |
| 显式媒体导入 | 点击 Save to Media Library 后，`ai/image-import` HTTP 200，新附件 `282972`，PNG、AI-generated 标记为 1 |
| 图片完整性 | 本地附件与 Cloud 产物均 1,528,711 字节，SHA256 `0bfbe68aa020c9a0fe0f8db9389d0123001f41b53e905a64efdcc2085e65995f` |
| 文章采用边界 | 编辑器选图后、保存前，数据库特色图片仍为 0；点击保存草稿后为 `282972`，状态仍 draft、正文摘要未变 |
| 重开编辑器 | 已保存状态和特色图片仍可见 |
| 清理 | 仅删除本轮草稿、附件及衍生文件；销毁本轮短期登录会话并删除认证文件；均核实不存在 |

对应 Cloud run 为 `run_b22c6e3a220048d0900d986676190308`：succeeded，实际 Provider `siliconflow`、模型 `siliconflow/Kwai-Kolors/Kolors`，Provider 调用 1 次、重试 0、无回退。产物 `art_10c6316aa39d4185a0d3f631f1a71bfa` available；下载已完成并 ACK，字节数与校验和验证均通过。用量记录包含 run=1、provider_calls=1；成本字段 0 不替代供应商账单或内部预算预留。

## 编辑器快捷入口与限制

“生成特色图片”先调用 `ai/image-prompt-generation`，该请求走 `wp-ai.short-text`，现场解析到付费文字模型。为保持免费测试，首次拦截该前置调用时显示可恢复错误，没有生成图片或改写草稿。后续使用浏览器固定提示词替身，仅生图、取图与导入走真实服务；这是混合验证，不能当成真实文字模型证据。

混合验证结果：临时草稿 `282974` 中，固定提示词后真实 Kolors run `run_5a84848594e84b6ea30877540188115e` succeeded，单次 Provider 调用、无重试/回退；产物 `art_aa8626b5a5f9421398694557079387af` 已下载并 ACK。自动导入附件 `282975`，1024×1024、1,516,714 字节，SHA256 `6b34e23da6be31eea4d7b078b28f1bf29fa676a730b3837f5c0bfa5c794f08cf` 与 Cloud 一致。编辑器未保存时 UI 已选该图但数据库 featured_media=0；显式保存后为 `282975`，正文摘要不变、仍是 draft，重开可见。没有让浏览器固定提示词替身到达 Cloud 文字 Provider。

该快捷入口验证的草稿、附件及衍生文件、短期会话和认证文件同样已清理，并分别核对不存在。两次均未发布文章；Cloud 真实运行、产物交付与用量记录作为测试证据保留。

媒体导入附带的自动 ALT 请求返回 unsupported_model：开发站未配置可用视觉模型。官方插件仍回退到原提示词并成功导入；测试中在本地媒体详情手动修改 ALT 后保存。没有开启视觉模型、改共享文字路由或为观察制造付费流量。

## 证据边界与后续

截图、字节校验和脱敏运行回执保存在本任务忽略目录 `.runtime/image-loop/`。浏览器自动点击是测试行为，不计入自然用户、人工采纳或 Phase 1 十次真实使用；没有伪造采纳反馈，也未发布文章。

免费手动提示词路径可用于开发；付费 Z-Image 的首次实际调用、真实快捷提示词模型、视觉 ALT、参考图编辑与自然人工使用均未由本记录验证。生产模型、密钥和预算仍由操作者上线时指定。本轮局部适配不改变已有服务或 WordPress 最终写入权。

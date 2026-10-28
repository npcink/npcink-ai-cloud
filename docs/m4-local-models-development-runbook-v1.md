# M4 本地模型与 SSH 生图开发手册

Status: active operator runbook。安装与实测基线为 **2026-10-28**；使用前重新检查进程、模型与接口，不把本记录当作实时健康状态。

当前选择：操作者决定本地/M4 开发生图使用第三方硅基流动，免费 Kolors 做测试、Z-Image-Turbo 做实际配图；生产模型另行指定，见
[开发生图 API 配置手册](development-image-api-runbook-v1.md)。Draw Things 保留为离线备用；
本会话未发布的 Cloud 适配候选已撤下，未添加 Draw Things Provider 或修改其主机服务。

## 1. 适用范围与接入状态

用于 M4 上的本地开发测试。机器为 Apple M4、16 GiB 统一内存、macOS 26.6.2。常规调用、取图和检查使用 SSH；Draw Things 的 HTTP API 已由操作者完成一次性图形界面设置。

| 模型 / 服务 | 独立调用证据 | Cloud 接入状态（本次未更改） |
| --- | --- | --- |
| Ollama `qwen3.5:9b`、`qwen3-vl:2b`、`qwen3-embedding:0.6b` | 原有模型 | 操作者截图中的“Ollama M4”保存了这三个 ID；截图本身不证明执行成功 |
| Ollama `laya:322m-multilingual-mlx-fp16` | `/v1/systemone` 中文请求分类成功 | 未接入 Cloud；专用分类模型，不是通用聊天替代品 |
| Ollama `npcink-qwen3-reranker:0.6b-int8` | `/api/generate` 官方提示模板，相关/无关中文文档分别得到 yes/no | 未接入 Site Knowledge；现有适配只支持 Jina，安装时 M4 重排开关关闭 |
| Draw Things：FLUX.2 [klein] 4B，6-bit 蒸馏版 | CLI 与 HTTP 均已生成有效 PNG | 未接入 Cloud Provider，不能直接添加到“Ollama M4”使用 |

“安装成功 → 账户目录返回 → 保存启用 → 用途选择 → Cloud 执行成功”是不同状态。
截图的“已启用 3”只表示保存了三个模型选择；“账户目录 0 / 目录未确认 3 / 仅保存模型 ID”表示当前目录预览没有相应记录，不等于模型不存在，也不等于已验证可调用。可先在后台读取该连接的账户目录，再核对能力与用途；目录刷新不会自动补齐专用协议适配。

当前代码依据：[Provider 注册](../app/adapters/providers/registry.py)、[OpenAI 兼容适配](../app/adapters/providers/openai.py)、[Site Knowledge 重排](../app/domain/site_knowledge/rerankers.py)。没有 Draw Things 或 Laya 专用执行适配。Draw Things 的 `/sdapi/v1/txt2img` 与现有 OpenAI 兼容 `/v1/images/generations` 协议不同，不能通过填写模型文件名或仅修改 base URL 接通。

这份手册不改变 Cloud/WordPress 责任边界，不启用暂停的产品入口，不代表 CI、M4 candidate/accepted、生产或 WordPress 采用验收。

## 2. 已安装配置

| 项目 | 配置 |
| --- | --- |
| Ollama | 0.40.12，M4 宿主机 `127.0.0.1:11434` |
| Draw Things 应用 | 26.1020.0，`/Applications/Draw Things.app` |
| Draw Things CLI | 26.1023.0，`$HOME/.local/opt/draw-things/v26.1023.0/draw-things-cli`；便捷链接 `$HOME/.local/bin/draw-things-cli` |
| 生图主模型 | `flux_2_klein_4b_q6p.ckpt`（蒸馏版，不是 Base） |
| 配套模型 | `qwen_3_4b_q8p.ckpt`、`flux_2_vae_f16.ckpt` |
| 共用模型目录 | `$HOME/Library/Containers/com.liuliu.draw-things/Data/Documents/Models`，合计约 7.3 GiB |
| 内置 API | HTTP，`127.0.0.1:7860`，桥接模式关闭，服务器在线后已通过 SSH 验证 |
| 开发参数 | 512×512、4 steps、guidance/CFG 1、seed 42、一次一张、并发 1 |

首次加载会将模型拆成 `.ckpt` 索引与 `-tensordata` 文件，必须一起保留。安装结束时磁盘余量约 11 GiB，不是持续保证。生图时避免并行加载大型 Ollama 模型；先检查 `/api/ps`，不要擅自卸载其他任务正在使用的模型。

Draw Things **应用需要保持运行**才能提供内置 HTTP API；关闭屏幕共享窗口不影响调用。应用/主机重启后的自动启动尚未验收，未安装新的常驻守护程序。CLI 本地生成是另一条已验证路径；CLI 的 `--remote` 使用 gRPC，不能指向这里的 HTTP 服务。

## 3. SSH 入口与只读检查

按 [M4 操作标准](m4-preview-ai-development-standard-v1.md)先探测并固定本次 SSH 路由。以下命令在开发机运行；将占位符替换为私有 SSH 配置中的 M4 别名或已确认目标，真实地址不写入 Git，也不要直接复用生产部署目标。

```bash
export NPCINK_CLOUD_M4_SSH_HOST='your-m4-ssh-alias'
ssh -o BatchMode=yes -o ConnectTimeout=8 "$NPCINK_CLOUD_M4_SSH_HOST" 'uname -m'
ssh "$NPCINK_CLOUD_M4_SSH_HOST" 'curl -fsS http://127.0.0.1:11434/api/tags'
ssh "$NPCINK_CLOUD_M4_SSH_HOST" 'curl -fsS http://127.0.0.1:11434/api/ps'
ssh "$NPCINK_CLOUD_M4_SSH_HOST" 'lsof -nP -iTCP:7860 -sTCP:LISTEN'
ssh "$NPCINK_CLOUD_M4_SSH_HOST" 'curl --max-time 10 -fsS http://127.0.0.1:7860/sdapi/v1/options'
ssh "$NPCINK_CLOUD_M4_SSH_HOST" '"$HOME/.local/bin/draw-things-cli" models list --offline --downloaded-only'
```

`options` 中的默认模型曾为 `null`，因此每次生成都显式指定模型和参数。连接拒绝时先检查应用和 API 服务是否运行；超时时检查是否有其他生成任务。不要为排障直接重启 Ollama、改监听地址或重装模型。

`127.0.0.1` 在上述 SSH 命令里指 **M4 宿主机**。开发机直接请求自己的 loopback，或 Cloud 容器请求容器内的 loopback，都不会访问到 M4 的该服务。后续接入 Cloud 时仍需单独验证容器可达性与协议适配；本次没有修改网络暴露方式。

## 4. SSH 调用 HTTP 生图并取图

在开发机仓库根目录保存请求。输出放在忽略的 `.runtime` 中，避免把大体积 base64 响应提交到 Git。

```bash
mkdir -p .runtime/drawthings-manual
cat > .runtime/drawthings-manual/request.json <<'JSON'
{
  "model": "flux_2_klein_4b_q6p.ckpt",
  "prompt": "A small white ceramic robot beside a green plant, warm morning light, no text, no watermark",
  "negative_prompt": "",
  "width": 512,
  "height": 512,
  "steps": 4,
  "guidance_scale": 1,
  "sampler": "Euler A Trailing",
  "seed": 42,
  "batch_size": 1,
  "batch_count": 1,
  "hires_fix": false,
  "restore_faces": false
}
JSON

ssh "$NPCINK_CLOUD_M4_SSH_HOST" \
  'curl --max-time 240 -fsS -H "Content-Type: application/json" --data-binary @- http://127.0.0.1:7860/sdapi/v1/txt2img' \
  < .runtime/drawthings-manual/request.json \
  > .runtime/drawthings-manual/response.json
```

确认上一步退出码为 0 后，在开发机解码返回的 `images[0]`：

```bash
python3 - <<'PY'
import base64
import json
from pathlib import Path

root = Path('.runtime/drawthings-manual')
payload = json.loads((root / 'response.json').read_text())
encoded = payload['images'][0]
if encoded.startswith('data:'):
    encoded = encoded.split(',', 1)[1]
png = base64.b64decode(encoded, validate=True)
if not png.startswith(b'\x89PNG\r\n\x1a\n'):
    raise SystemExit('Response is not a PNG')
output = root / 'image.png'
output.write_bytes(png)
print(output.resolve())
PY
```

API 超时不保证服务器已经停止生成；先检查任务状态，避免立即重试造成重复计算。不要把完整 base64 响应打印到聊天或日志。`img2img` 未实测，本手册只保证上述文生图路径的历史验证状态。

## 5. SSH 调用 CLI 备用路径

该路径已在 M4 离线本地生成成功；按顺序运行，不与 HTTP 生成并发。

```bash
ssh "$NPCINK_CLOUD_M4_SSH_HOST" '
  "$HOME/.local/bin/draw-things-cli" generate \
    --local --offline --no-download-missing \
    --model flux_2_klein_4b_q6p.ckpt \
    --prompt "A small white ceramic robot beside a green plant, warm morning light" \
    --width 512 --height 512 --steps 4 --cfg 1 --seed 42 \
    --disable-preview --output "$HOME/Desktop/klein4b-dev.png"
'
mkdir -p .runtime/drawthings-manual
ssh "$NPCINK_CLOUD_M4_SSH_HOST" 'cat "$HOME/Desktop/klein4b-dev.png"' \
  > .runtime/drawthings-manual/cli-image.png
```

SSH 生成、取图不需要控制图形界面。模型缺失时 `--no-download-missing` 会阻止自动补下载，应先核对文件，不默认重新安装。

## 6. Laya 与重排的使用边界

Laya 的最小探针使用 `/v1/systemone`，请求包含 `model`、`state.request` 与 `questions.task`（`type: choice`、`instructions`、`criteria`）。中文润色请求在 rewrite/image/search 三选一中返回 `answers.task.choice: rewrite`，概率约 0.99985。这个结果只证明单条分类可用，不证明可替换 `qwen3.5:9b`，也没有授权启用自适应路由。

Qwen3 Reranker 来自官方 `Qwen/Qwen3-Reranker-0.6B`，revision `e61197ed45024b0ed8a2d74b80b4d909f1255473`，经校验后由 Ollama 原生 `create --quantize int8` 导入。调用使用 `/api/generate`、`raw: true`、官方 Instruct/Query/Document 提示模板与 yes/no 输出，不是聊天模型或 Jina `/v1/rerank` 的直接替代接口。

两个中文候选分别得到 yes/no，只是最小行为检查。没有完成批量评分、排序稳定性或检索质量评估；缺少 yes/no 完整 logprobs 时不能编造归一化相关性分数。此前输出异常的社区 Q8_0 版本已移除，不应恢复为默认模型。

若以后接入，应单独完成所需适配、用途/开关配置与真实 Cloud run 验证，再声明项目可用；仅在 Admin 录入这些模型 ID 不会完成接入。本次保留现有嵌入模型及其向量空间，没有更换 embedding 或重建索引。

## 7. 来源、验证与证据位置

- GUI：[官方 26.1020.0 ZIP](https://static.drawthings.ai/DrawThings-26.1020.0-a424ad4b.zip)，SHA256 `a424ad4b656aea3865480db35541b530f83fa76340f37e2a56b3df70466b369e`；codesign 验证通过，spctl 为 accepted / Notarized Developer ID，Team ID `6HP3U6Z7P6`。
- CLI：[官方 26.1023.0 release](https://github.com/drawthingsai/draw-things-community/releases/tag/v26.1023.0)，SHA256 `5900f7a2f42e00b3b028c0fbcfcb799bd1da8905a2901b6b5bfbd32088c4a049`，与官方 digest 相符。模型由官方 CLI 下载并校验依赖。
- 选择独立生图工具的原因：Ollama 0.40.12 不支持该实验性生图路径；上游 [PR #16615](https://github.com/ollama/ollama/pull/16615) 撤下实验性代码。没有为生图降级或另起第二套 Ollama。
- CLI：512×512、4 steps，含模型加载引擎时间 35.67 秒，进程墙钟 38.68 秒；进程内存指标不等于 Metal/全机统一内存占用。
- HTTP：相同尺寸/步数，返回 HTTP 200，22.16 秒，一张 371,113 字节有效 PNG，已视觉检查。两条路径加载/缓存条件不同，不能据此宣称速度提升。
- 两次生成后开发环境 `/health/live` 均为 200，只证明当时存活接口可达。
- M4 原始证据：`$HOME/.cache/npcink-drawthings-install-20261028/`，含请求、响应、耗时、图片及报告；Laya/重排探针在 `$HOME/.cache/npcink-model-install-20261028/`。
- 原开发机工作区的忽略目录：`.runtime/drawthings-install-2026-10-28/` 与 `.runtime/model-install-2026-10-28/`。这些原始证据未纳入 Git，本手册保存可复用配置与结论；其他 checkout 不保证含有副本。

本次安装验证没有修改 Cloud Provider、同步/部署应用或操作生产。以上是独立 M4 模型调用证据，不是项目完整生图闭环证据。

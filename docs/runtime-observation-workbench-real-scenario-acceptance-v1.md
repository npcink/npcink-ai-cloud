# Runtime 观测工作台真实场景验收记录 v1

用途：在 M4 或其他共享预览环境中，验证 `/admin/troubleshooting` 与
`/admin/usage-statistics` 的真实数据结论。该记录不能用 mock 数据、DOM 结构
或接口 schema 检查替代。

## 记录元数据

- 观察时间：
- 环境与 revision：
- 时间窗口：
- 站点范围：
- 功能/插件范围：
- 操作者：

### 已收到的真实页面证据（初步）

- 页面：`/admin/usage-statistics?window=168&from=troubleshooting&group=functions&function=site-knowledge.managed`
- 观察结果：页面正常加载；近 7 天；运行数 259；站点数 2；运行成功率 99.2%；平均运行耗时 34.6 秒；运行样本 259；时区 Asia/Shanghai。
- 证据状态：证明 M4 页面和真实运行统计可访问；尚不能单独证明插件上报状态、Provider 错误证据或计量完整性。
- 来源：用户提供的 M4 页面截图。

## 场景 A：运行正常但没有插件上报

- 运行 ID：
- Troubleshooting 结论：
- Usage Statistics 结论：
- 插件观测状态：
- 是否被错误显示为运行失败：是 / 否
- 截图或页面证据：

通过条件：运行状态保持正常，插件观测缺失单独表达，两个页面没有互相矛盾的
结论。

## 场景 B：运行失败且存在 Provider 错误

- 运行 ID：
- 异常代码：
- Provider 错误证据：
- 影响站点/功能：
- 单次运行摘要是否可进入：是 / 否
- 下一步诊断入口：
- 返回 Usage Statistics 后是否保留范围：是 / 否

通过条件：异常可定位到受限的单次运行证据，页面不暴露 prompt、结果 payload
或凭据，并且跨页返回保留时间和对象范围。

### 已收到的真实页面证据

- 页面：`/admin/troubleshooting?window=168&from=usage-statistics`
- 时间范围：7d / 168h；运行数据更新时间：2026/9/12 00:00。
- 异常：供应商调用错误，影响范围为文本生成，次数为 1。
- 关联异常：运行任务失败，影响范围为文本生成，次数为 1。
- 同一页面还显示调用记录缺失 142 次，影响站点知识库、文本生成和 vision，且明确说明记录缺失不等于请求失败。
- 跨页上下文：从 Usage Statistics 返回后保留 `window=168` 与 `from=usage-statistics`。
- 证据状态：Provider 错误和运行失败均已在真实 M4 页面观察到；当前截图未展开具体 run ID，因此单次运行摘要下钻仍需在点击“查看”后补充确认。

#### 单次运行摘要补充证据

- 失败记录时间：2026/9/5 15:13
- 能力：`wp-ai.classification`
- 运行 ID：`run_081751b1ef394b1db76826506770e5e8`
- 诊断代码：`provider.invalid_request`
- 结论：已完成从异常到单次运行摘要的下钻；页面未暴露 prompt、结果 payload
  或凭据，并给出“修复后从原站点重新执行验证”的恢复建议。

## 场景 C：运行正常但 Provider Call 或计量记录不完整

- 运行 ID：
- 运行状态：
- Provider Call 记录状态：
- 计量事件状态：
- 证据完整性提示：
- 是否被错误显示为运行失败：是 / 否

通过条件：运行状态和证据完整性分开表达；缺失调用或计量记录不会被推断为
任务失败。

### 已收到的真实页面证据

- 页面：`/admin/troubleshooting?window=168&from=usage-statistics&focus=hosted_model.provider_call_gap`
- 诊断代码：`hosted_model.provider_call_gap`
- 受影响请求数：142
- 影响分组：站点知识库 107 次、文本生成 45 次、vision 22 次。
- 失败请求数：分别为 0、1、0；调用记录完整率分别为 11%、13%、60%。
- 页面明确说明：调用记录缺失不等于请求失败；返回结果为有限汇总，可能不包含全部功能。
- 单次运行证据：当前窗口没有可用的单次运行证据，页面正确显示为空，并给出按插件错误、供应商连接、站点知识库和运行配置继续排查的入口。
- 跨页上下文：保留 `window=168` 和 `from=usage-statistics`。
- 证据状态：场景 C 通过；该截图不足以证明场景 B 的 Provider 错误单次运行摘要。

## 结论

- 三个场景是否全部通过：是 / 否
- 发现的问题：
- 后续修复任务：
- 复验时间与 revision：

当前结论：场景 A、B、C 均已通过真实 M4 页面验收；场景 B 已完成从异常到单次
运行摘要的下钻，并记录具体运行 ID 与受限诊断码。

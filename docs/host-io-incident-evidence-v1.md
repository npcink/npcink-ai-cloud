# Linux 主机高读盘现场取证 v1

Status: bounded operator incident runbook. Source delivery does not authorize
installation or a persistent collector on production.

## 目的与事实边界

连接超时、worker 重启和持续读盘是不同层次的证据。连接重试只能提高恢复能力，
不能证明磁盘问题已解决。生产事故不能在根因未证实时按“已修复”收尾。

先把 ECS 物理磁盘、进程/cgroup、缺页/回收计数及外置 RDS 的时间对齐，再决定
调整哪个服务。不要把 RDS 的磁盘 IO 归到 ECS，不直接相加父子 cgroup IO、进程
RSS 或各服务在不同时刻的内存峰值。磁盘空间、IOPS、吞吐与延迟也不是同一指标。
核对实际数据量后再判断源码增长风险是否能解释本次事故。

已有 [runtime resource baseline](runtime-resource-baseline-v1.md) 用于有界 Docker
资源基线，服务身份变化时会停止。当前工具用于主机故障现场：只读 procfs/cgroup，
不依赖 Docker 健康，允许观察进程重启，不读取环境变量、命令参数、业务日志、
文件内容或凭据。不启动工作负载，不查询数据库，不发送网络请求或模型调用。

## 采集内容与限制

源码：`scripts/capture_host_io_evidence.py`；标准库，Linux Python 3.11+。

- 全局：时间、boot ID、可用内存、swap、major faults、直接/后台回收、文件页
  refault、CPU ticks、逐设备读扇区及耗时/队列计数。磁盘扇区单位为512字节；
  不把整盘和它的分区重复求和，计算延迟时须使用同设备的差值。
- 进程：PID、启动 ticks、进程名、cgroup、RSS页数、物理读字节和 major faults。
  PID复用、boot变化、计数倒退以及缺失计数均标为未知，不伪造零增量。RSS页数
  需按主机页大小换算。进程 IO 可能包含已回收子进程，不能求和作为整机磁盘量。
- cgroup v2：按存活进程定位，包括宿主机安全代理；保存总 IO、内存、OOM及
  refault/回收计数。同名 cgroup inode 变化时不跨生命周期计算增量。
  容器 cgroup 能记录采样间隔内已退出的健康检查子进程，前提是容器 cgroup仍在。
- 内部最多1024个有效进程、128个 cgroup；输出读取量前8与内存前8的并集，
  保留截断标记。短命进程和已消失 cgroup 仍可能漏采；采集不是原子快照。
  该工具不声称能识别具体打开的文件，未提供计数的设备/cgroup也不能自动归因。
- 每条记录最多64KiB；超限产生明确错误。写盘失败退出，不静默声称成功。
  采集耗时和自身峰值 RSS 一并保存，判断采集器是否带来压力。

## 两种运行方式

已授权的短时只读窗口可以经严格 SSH 把源码送到 Python stdin，使用
`--stdout --duration-seconds 20 --interval-seconds 5`，输出只保存在操作者本地。
这不会安装远端脚本或日志文件。正常期间的短样本不证明历史故障根因。

持续采样必须先取得针对目标主机、精确源码 SHA、落点和窗口的授权：

1. 使用独立 `/var/lib/npcink-incident-evidence/io-<run-id>/`，root拥有且目录0700，
   不覆盖应用源码、配置、镜像或发布清单。核对脚本SHA后安装为0600文件。
2. 用临时 systemd unit 启动 `/usr/bin/python3` 加该脚本，参数为
   `--output-dir <incident-root>/records --duration-seconds 172800 --interval-seconds 30`。
   使用 `RuntimeMaxSec=48h`、`TimeoutStopSec=5s`、`MemoryMax=48M`、`CPUQuota=3%`、
   `Nice=15`、`IOSchedulingClass=idle`、`UMask=0077`、`NoNewPrivileges=yes`、
   `PrivateNetwork=yes`、`ProtectSystem=strict`，只给该取证目录 ReadWritePaths。
   不设置开机启动或自动重启，不开放端口、不上传数据、不修改业务服务。
3. `samples.jsonl` 每文件最多8MiB，当前文件加3个备份，总计最多32MiB；目录0700，
   新文件及轮转文件0600。拒绝符号链接、硬链接、不私密的目录和过大的旧文件。
   这是滚动容量限制，**不保证保存完整48小时**；应先依据实测记录大小估算可回看
   时长。约12KiB/条、30秒间隔时约能回看一天，压力增大或记录变化时窗口会改变。
4. 启动后核对 unit 的实际限制、日志权限/大小、首条计数、两个样本时间差、采集
   耗时和无错误。短验证失败就停止，不靠重启业务验证取证器。
5. 停止仅需 `systemctl stop <exact-incident-unit>`；到期自动退出。先下载并封存
   证据再按具名授权处理取证目录，不删除业务数据或用清理日志代替事故分析。
   主机重启会终止临时 unit，但此前已写入的日志仍在；最近尚未落盘部分可能丢失。

源码检查和单元测试：

```bash
.venv/bin/python -m pytest -q tests/dev/test_host_io_evidence.py
.venv/bin/python -m ruff check scripts/capture_host_io_evidence.py tests/dev/test_host_io_evidence.py
```

## 复发时如何形成根因证据

1. 按云盘时间找到对应 boot 和同设备读增量，确认延迟/队列及吞吐限额；不要先重启。
2. 比较同段的进程/cgroup读增量，定位扫描服务、容器或宿主机；若进程已退出，
   用仍存活的容器/cgroup累计IO和生命周期缩小范围。
3. 检查 MemAvailable、pgscan/pgsteal、pgmajfault、workingset_refault_file 的同步变化。
   内存低且回收/refault随读盘上升，支持文件页反复回收假设；仅有读盘不支持该结论。
4. 再关联具名任务或文件访问，设计隔离环境对照实验；生产停服务、限速、扩容、
   修改安全代理或复现实验须单独授权。只有时间重合、当前恢复、源码缺陷或重启后
   读盘消失，均不足以单独证明根因。证据不足时保留未解决状态并明确缺哪一环。

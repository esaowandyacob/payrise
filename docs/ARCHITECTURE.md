# 架构

```text
src/core/earnings.js       纯函数计薪、日历与配置校验
electron/main.cjs         窗口、菜单栏、原子持久化、权威计时、IPC
electron/preload.cjs      白名单桥接，不暴露 Node.js
src/renderer/index.html   两种视图和设置表单
src/renderer/app.js       状态渲染与表单提交
src/renderer/themes.css   可替换主题变量
src/renderer/app.css      布局与组件样式
test/earnings.test.js     算法边界测试
scripts/smoke.cjs         隔离配置启动真实 Electron
```

主进程每秒计算一次快照，广播给窗口并更新 Tray title。渲染进程不自己累计金额。核心模块不依赖 Electron，可通过 Node 原生测试运行。

## IPC 契约

`window.payrise.getState()` → `{settings, snapshot, warning}`。

`window.payrise.saveSettings(settings)` → `{ok:true,state}` 或 `{ok:false,error}`。主进程再校验字段、范围、日期和休息区间；休息计时和加班记录字段不可由设置表单覆盖。

`window.payrise.overtime(command, payload)` → `{ok:true,state}` 或 `{ok:false,error}`；命令为 `start | stop | add | update | delete`。开始和补录的 ID 由主进程生成；开始/停止使用主进程时钟。补录传 `start/end/mode/hourly/multiplier`；更新只修改时间并保留费率；停止、更新、删除带 `id`。

`window.payrise.action(action)` 接受 `dashboard | widget | privacy | rest`。

`window.payrise.onState(callback)` 订阅每秒快照，返回取消订阅函数。

所有 IPC 都校验发起窗口和顶层本地文件地址。禁止任意 channel、文件路径或 shell 命令。

## 持久化

单个版本化 settings.json；原子写入；损坏文件备份。保存时采用字段白名单，未来新增字段需同时更新默认值、校验、表单和测试。

当前无数据库。配置版本 2 在同一文件存储加班账本（id、start、end、limit、day、rate、currency、mode），默认从旧版本迁移为空账本。`changeOvertime` 统一处理变更，`validateOvertimeRecords` 拒绝重叠及币种混用。

普通收入跨日期历史按当前配置推算；未来需要历史薪资时，应新增生效日期版本，而不是把现在的估算当成历史记录。

## 性能

计时频率 1 Hz，金额显示四位小数，无 60 FPS 后台循环。目标收入需要遍历目标起始日期后的班次，长时间跨度可能需要后续增加按月缓存。窗口关闭隐藏，退出时清理心跳。

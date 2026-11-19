# 产品参考与独立实现说明

2026-11-19 阅读了下列仓库的公开 README，参考功能思路。没有复制源码、配色资源、截图、图标或商标。许可证信息只记录本次观察；README 与实际 LICENSE 不一致时，以实际授权文件为准。

| 项目 | 参考功能 | 本项目处理 |
| --- | --- | --- |
| [PayDance](https://github.com/MrBaoboer/PayDance) | 月/日/时薪、午休、夜班、小窗、本地优先 | 重新实现纯 JavaScript 计薪与 Electron 小窗；仓库标注 AGPL，不复制代码 |
| [薪动](https://github.com/WizzenH/xindong) | 晚打开补算、日历调休、透明度、主题 | 使用墙钟重算和手动日期覆盖；不移植 Python 实现 |
| [RealtimeSalary](https://github.com/mereithhh/realtime-salary) | 每秒收入、多币种、大数字反馈 | 币种只作为显示单位；改用排班时间而非 24 小时均摊 |
| [Paytick](https://github.com/miniLV/Paytick) | macOS 菜单栏、隐私、愿望进度 | 使用 Electron Tray；独立实现目标估算。README 标注 MIT，但 API 识别为 Apache-2.0，因此不沿用其代码 |
| [Moyu](https://github.com/dingyiyi0226/moyu) | 休息收入视角与紧凑面板 | 首版手动休息计时；自动锁屏和空闲检测列入后续范围 |

此前还提到过 [NMDXT](https://github.com/FEFKNCQ/NMDXT)，其桌面反馈方向可作额外灵感；本次未依赖它的代码或授权。

依赖与安全实现依据：
- [Electron 安全建议](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Tray API](https://www.electronjs.org/docs/latest/api/tray)
- [Electron BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window)

MIT 仅覆盖本仓库原创部分；Node.js、Electron 与其他构建依赖保留各自许可证。

# Payrise 主题设计交接

先阅读仓库本地技能：`../.agents/skills/payrise-theme/SKILL.md`（仓库根目录路径 `.agents/skills/payrise-theme/SKILL.md`）。根据上传资源定制时，以该技能的处理与验收流程为准。

## 直接交给 Claude 的任务

你正在为 macOS 的实时收入伴侣 Payrise（薪光）设计多个独立视觉主题。请先阅读本文件和 `src/renderer/index.html`，保留现有功能和数据字段。技术栈是 Node.js + Electron + 原生 HTML/CSS/ES Modules，不需要 Rust 或 Swift。

请设计 3–5 套有明显差异的主题。可以探索克制的 macOS 原生感、温暖纸张、暗色仪表、轻松插画等方向，不必继承当前绿色配色。用户尚未确定最终主题，先交付可切换的方案及设计说明。

## 页面与状态

主窗口 1080×800（最小 800×640，可纵向滚动）：
- 收入主卡：班次日期、已赚金额（四位小数）、当前每秒收入、计薪区间单价、状态、进度、下班倒计时。
- 本月累计、班次目标、愿望目标、手动休息收入。
- 加班：开始/结束、无偿/有偿计时、普通与加班收入、折算时薪、历史补录、时间修正、删除和校验错误。
- 可折叠设置：薪资、币种、排班、无薪休息、调休、目标、置顶与透明度。
- 无效表单、配置损坏提示、隐私状态。

悬浮窗 340×230：
- 可拖拽头部、打开主窗口与隐藏按钮。
- 收入、当前每秒值、工作状态、隐私开关。

必须覆盖：班前、工作中、无薪休息、班后、休息日、隐私模式、超长目标名、大金额、跨午夜班次、有偿加班、无偿加班、达到计时上限、补录与编辑状态。

## 设计接口

`src/renderer/themes.css` 是色彩与质感入口，`body[data-theme]` 选择主题。

保留变量：`--bg`、`--surface`、`--ink`、`--muted`、`--accent`、`--accent-ink`、`--line`、`--hero`、`--hero-ink`、`--shadow`、`--radius`、`--font`、`--number-font`。

可以调整 `app.css` 的布局和视觉表达。如需修改 HTML，保留元素 ID、表单 name、按钮语义、label 关系和 `app.js` 的契约。新增主题 ID 时同步 `src/core/earnings.js` 的主题白名单与设置选项。

数据不由主题计算。禁止为了动画另建收入计时器；金额只能使用主进程快照。当前刷新频率 1 Hz，动画是可选视觉效果，必须尊重 `prefers-reduced-motion`。

## 交付要求

- 每个主题的 HTML/CSS 实现，以及主窗口、悬浮窗、隐私状态的预览。
- 使用系统字体或合法本地字体，不加载远程字体/CDN，不嵌入网络图片与追踪脚本。
- 图形原创或明确授权，无水印；说明资源来源。
- 金额使用等宽数字，避免跳动引起布局变化。
- 文本对比度、键盘焦点、按钮可访问名称清晰。色彩不是状态的唯一提示。
- `-webkit-app-region: drag` 仅用于窗口拖拽区；交互按钮保留 `no-drag`。
- 隐私模式不要泄漏金额到小字、进度提示、tooltip 或辅助技术文本。
- 不改计薪算法、IPC 白名单、权限策略和本地数据路径。

## 示例快照（设计数据，不是真实工资）

```json
{
  "day": "2026-11-19", "status": "earning", "today": 236.1234,
  "activeRate": 0.0198, "perSecond": 0.0198,
  "monthEarned": 8236.12, "dailyTarget": 571.43,
  "progress": 0.41, "remainingSeconds": 12600,
  "goalEarned": 1650, "goalProgress": 0.55,
  "restSeconds": 480, "restEarned": 9.50
}
```

# 接入位置与验收契约

本表反映当前实现，实际源码优先；不要凭文档猜测已被修改的符号。

## 文件入口

| 文件 | 主题相关职责 |
| --- | --- |
| `src/renderer/themes.css` | `[data-theme]` 的颜色、字体和材质变量 |
| `src/renderer/app.css` | 公共布局、主题专属布局、小窗、隐私与响应式 |
| `src/renderer/index.html` | `#quick-theme` 和 `select[name=theme]` 两处主题选项 |
| `src/renderer/app.js` | `render`、`renderOvertime`、`money`、`fitAmounts`、`changeTheme` |
| `src/core/earnings.js` | `validateSettings` 的主题 ID 白名单；只扩展此处主题列表，不改计薪 |
| `electron/main.cjs` | `runSmoke` 内主题循环：真实控件同步与截图循环，新增主题须加入两处 |
| `test/earnings.test.js` | 保持主题迁移测试，新增主题与基础主题快照一致性断言 |
| `assets/themes/<id>/` | 本地资源与 `SOURCES.md` |
| `docs/CLAUDE_UI_BRIEF.md`、`README.md` | 更新新增主题说明和示例图 |

## 变量

完整设置或继承：`--bg`、`--surface`、`--ink`、`--muted`、`--accent`、`--accent-ink`、`--line`、`--hero`、`--hero-ink`、`--shadow`、`--radius`、`--font`、`--number-font`、`--button`、`--widget-radius`。同时设置合适的 `color-scheme`。系统字体无需下载；数字用 `font-variant-numeric: tabular-nums`。

```css
[data-theme="forest"] {
  color-scheme: light;
  --bg: #edf1e8;
  --surface: #fafbf7;
  --ink: #1e2b22;
  --muted: #4b5c50;
  --accent: #2d6941;
  --accent-ink: #fff;
  --line: rgba(30,43,34,.18);
  --hero: transparent;
  --hero-ink: var(--ink);
  --button: #fafbf7;
}
```

示例仅演示结构；最终配色应来自用户素材并实际检查对比度。

## 保留的交互

- 主金额、菜单栏和小窗金额来自同一主进程快照；不得硬编码演示工资。
- 快速主题切换保存成功后同步两窗和磁盘；未提交的薪资/补录输入保持不变。
- `#settings-form` 保留所有字段；默认加班方式为 `overtimeMode`，自定义时薪 `overtimeHourly`，倍率 `overtimeMultiplier`。
- `#overtime-toggle` 开始/结束；`#overtime-form` 补录/编辑；`#overtime-history` 编辑/删除；`#overtime-message` 显示成功或错误。
- 加班快照：`regularEarned`、`overtimeEarned`、`overtimeSeconds`、`monthOvertimeEarned`、`effectiveHourly`、`overtimeActive`、`overtimeRunningSeconds`。`today`/`monthEarned` 已包括加班，不能再相加。
- `body[data-status]`：`before`、`earning`、`break`、`after`、`off`、`overtime-paid`、`overtime-unpaid`、`overtime-limit`。
- `body[data-private=true]`：`money()` 返回圆点；设置与加班详情区隐藏。不得在 tooltip、图表轴、aria-label、图片或新小字中额外显示金额。时长和日期可显示。
- 班次进度条仅代表普通工时，不把无偿加班画成额外收入。
- 编辑记录的费用字段禁用，因为修改时间保留原费率；样式须让禁用状态清晰。

## 视觉检查矩阵

| 范围 | 必查项目 |
| --- | --- |
| 主窗口 1080×800 / 800×640 | 无横向溢出，可纵向滚动，设置和历史均可访问 |
| 悬浮窗 340×230 | 头部可拖动、按钮可点、金额完整、加班状态与时间可读 |
| 8 种状态 | 状态文本不被截断，不能只靠颜色区分 |
| 隐私 | 主窗/小窗/菜单栏金额遮罩；设置与加班历史不暴露费用 |
| 加班表单 | 空列表、补录、时间修正、禁用费率、重复工时错误、删除 |
| 极端文本 | 60 字目标名、一亿元金额、1000 条记录区域可滚动 |
| 键盘与动画 | 可见焦点、合理 Tab 顺序、减少动态效果偏好 |
| 资产 | 离线完整加载、无水印、无外部请求、无隐私数据 |

如现有 smoke 未覆盖新主题或新状态，先补该项验证，不能用其他主题的通过结果替代。

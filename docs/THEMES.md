# 主题开发约定

[返回首页](../README.md) · [主题 Skill](../.agents/skills/payrise-theme/SKILL.md)

现有主题：`lumen` 窗光、`folio` 纸页、`wick` 夜灯。主窗口与悬浮窗使用同一主题，顶部选择器立即保存且保留其他未提交输入。

## 实现入口

- `src/renderer/themes.css`：颜色、字体与材质变量。
- `src/renderer/app.css`：主题范围内的布局与响应式样式。
- `src/renderer/index.html`：保留所有 ID、表单 name、label 和按钮语义。
- `src/core/earnings.js`：仅扩展主题白名单，不修改计薪逻辑。
- `electron/main.cjs`：主题控件与截图测试列表。

完整修改清单见 [Skill 接口表](../.agents/skills/payrise-theme/references/integration.md)。

## 界面契约

主窗口默认 1080×800，最小 800×640，可纵向滚动；悬浮窗 340×230。保持金额、状态、月累计、目标、休息计时、加班开始/结束、历史补录/编辑/删除及设置可用。

覆盖班前、计薪中、午休、班后、休息日、有偿/无偿加班、计时封顶、隐私、长文本和大金额。金额只能由主进程快照提供，不添加独立计薪定时器。隐私开启时不得从小字、tooltip、图片或辅助技术文本泄漏金额。

素材保持本地，无水印；记录来源和授权，不引入远程字体/CDN或放宽 CSP。图标与窗口交互需保留可见焦点、可访问名称及正确的拖拽区。动画尊重减少动态效果偏好。

## 验证

按 [贡献指南](../CONTRIBUTING.md) 运行测试并检查真实 Electron 截图。使用示例薪资，确认主窗口、小窗、隐私、加班记录和旧主题均正常。

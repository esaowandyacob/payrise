# 开发约定

- 先使用 `conda activate payrise`，不存在时明确说明；Node 是产品主运行时。
- 所有新函数上方写中文注释，解释目的和边界。
- 保留 `src/core` 与 Electron/界面的分层；主题不能自己计算收入。
- 修改计薪必须运行 `npm test`，修改桌面集成运行 `npm run smoke`。
- 不提交用户工资配置、Token、环境文件、node_modules 或安装包。
- 不控制 Edge；Chrome 页面调试优先使用可用的 chromeDevtools MCP。
- 根据上传资源定制主题时，先阅读 `.agents/skills/payrise-theme/SKILL.md`，按其中流程接入、截图验收。
- 加班账本只能通过专用接口修改，保持费率快照与隐私遮罩。
- UI 设计以 `docs/THEMES.md` 为接口约定。
- 仅原创实现或授权兼容的代码可纳入 MIT 仓库。

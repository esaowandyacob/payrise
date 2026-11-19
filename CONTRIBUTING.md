# Contributing · 参与贡献

感谢你帮助改善薪光。欢迎修复问题、完善文档和制作主题。
Thank you for helping improve Payrise. Bug fixes, documentation, and new themes are welcome.

## 开发 / Development

需要 macOS、Node.js 22+ 和 npm。先阅读 [AGENTS.md](AGENTS.md)。
Requires macOS, Node.js 22+, and npm. Read [AGENTS.md](AGENTS.md) before making changes.

```sh
npm ci
npm start
npm test
npm run check
npm run smoke
```

`smoke` 使用隔离配置，不读取真实工资。输出截图时也只使用示例数据：
The smoke test uses an isolated profile and sample data:

```sh
PAYRISE_SMOKE_OUTPUT="$PWD/.tmp/screenshots" npm run smoke
```

## 提交 / Pull requests

- 说明问题、变化和验证结果。Describe the problem, behavior change, and validation.
- 保留 core、桌面层、界面的分层。Keep calculations separate from Electron and rendering.
- 新函数上方写中文注释。Add a Chinese comment above each new function.
- 计薪改动补充边界测试，界面改动附脱敏截图。Add meaningful calculation tests and redacted UI screenshots.
- 不提交配置、凭据、依赖目录或安装包。Do not commit private settings, secrets, dependencies, or app bundles.
- 主题遵循 [Theme Skill](.agents/skills/payrise-theme/SKILL.md)，不改变计薪或权限。Themes must preserve calculations and security boundaries.

## 本地打包 / Local packaging

```sh
npm run pack:mac       # 当前架构的 .app / .app for the current architecture
npm run dist:mac       # Apple Silicon DMG + ZIP
npm run dist:mac:intel # Intel DMG + ZIP; requires hardware validation
```

产物在 `dist/`，不纳入 Git。当前配置不做 Apple 签名与公证；正式发布前需要配置签名、公证并完成目标硬件验证。
Outputs go to the ignored `dist/` directory. Builds are currently unsigned and unnotarized. Public distribution requires signing, notarization, and validation on the target hardware.

本地宣传素材放入 `promo/`，该目录被 Git 忽略。不要使用真实工资截图。
Keep local promotional material in the ignored `promo/` directory. Use sample data only.

## 许可 / License

提交内容需兼容项目的 [MIT 许可证](LICENSE)。注明第三方资源的来源和授权。
Contributions must be compatible with [MIT](LICENSE). Document the source and permission for third-party assets.

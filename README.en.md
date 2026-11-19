<div align="center">
  <img src="assets/icon.png" width="80" alt="Payrise icon">
  <h1>Payrise · 薪光</h1>
  <p>Make every second of effort visible.</p>
  <p>A local-first, real-time earnings companion for macOS.</p>
  <p><a href="README.md">简体中文</a> · <strong>English</strong></p>
  <p>macOS · Node.js + Electron · MIT</p>
</div>

![Payrise dashboard with sample data](docs/images/dashboard.png)

Payrise turns your salary and work schedule into a live earnings display. Keep it in the menu bar or in a small floating window, and watch your progress through the day.

## Features

- **Live earnings** — Updates estimated shift income, earning rate, and monthly totals every second. Supports monthly, daily, and hourly pay.
- **Menu bar & floating window** — Compact app icon, draggable window, always-on-top mode, and adjustable opacity.
- **Flexible schedules** — Weekly schedules, unpaid breaks, manual workday overrides, and overnight shifts.
- **Overtime records** — Start and stop a session, add past records, edit times, or delete entries. Supports unpaid overtime, custom hourly rates, and multipliers, with a saved rate per record.
- **Goals & breaks** — Track progress toward a small goal and view earnings during a manually timed break.
- **Three themes** — Lumen, Folio, and Wick, synchronized across both windows.
- **Local privacy** — No account, no salary uploads, and one-click amount masking across the dashboard, widget, and menu bar.
- **AI-assisted themes** — A repository-local Skill helps coding agents turn uploaded images or mockups into working themes.

<img src="docs/images/widget.png" width="340" alt="Payrise floating window with sample data">

## Quick start

Requires macOS, Node.js 22+, and npm. The app UI is currently in Simplified Chinese; this English README does not imply an English UI.

```sh
git clone https://github.com/esaowandyacob/payrise.git
cd payrise
npm ci
npm start
```

Open the salary, schedule, and appearance settings, enter your details, and save. Use the top selector to switch themes and the floating-window button to show the widget. Closing a window keeps the app in the menu bar; press `⌘Q` to quit.

The documented installation method is running from source. Verified on an Apple Silicon Mac. Local builds are not Apple-signed or notarized, and Intel hardware has not been verified. See [Contributing](CONTRIBUTING.md) for development and packaging commands.

## Themes

| Theme | Style |
| --- | --- |
| Lumen · 窗光 | Bright, restrained layout with left-aligned numbers |
| Folio · 纸页 | Warm paper, serif headings, and ledger-like rows |
| Wick · 夜灯 | Dark background, centered numbers, and warm accents |

To create a theme from your own assets, give an AI coding agent the repository and your images, then ask:

> Read `.agents/skills/payrise-theme/SKILL.md`. Add a theme based on my uploaded assets, preserve the existing themes, and verify the dashboard, widget, overtime, and privacy states.

[Theme Skill](.agents/skills/payrise-theme/SKILL.md) · [Theme integration guide](docs/THEMES.md) (Chinese)

## How estimates work

Regular earnings are estimated from your schedule and system time, including scheduled time before you opened the app. Unpaid breaks pause regular earnings; completed shifts are capped. Overtime is recorded separately and must be started manually or entered afterward.

- Monthly pay can use actual scheduled workdays or a fixed divisor. Overnight shifts belong to their start date.
- Paid overtime contributes to totals. Unpaid overtime adds time and changes the effective hourly estimate.
- Changing salary or schedule recalculates regular estimates. Overtime records retain their saved rates.
- Overtime cannot overlap regular paid periods or another entry. A session stops accruing at the next regular paid segment or after 24 hours, and must then be confirmed as ended.
- These are motivational estimates, not payroll, attendance records, or bank balances. Taxes and bonuses are not included.

See the [user guide](docs/USER_GUIDE.md) (Chinese) for detailed calculation and date rules.

## Data & privacy

The app works offline, with no account system or analytics SDK. Settings normally live in `~/Library/Application Support/Payrise/settings.json` as plaintext. Privacy mode masks displayed amounts; it does not encrypt local files. Quit the app before backing up or deleting its data.

## Contributing

Issues, usability feedback, and pull requests are welcome. Include your macOS version, reproduction steps, and redacted screenshots when reporting a problem. Do not upload your salary configuration.

[Contributing](CONTRIBUTING.md) · [Architecture](docs/ARCHITECTURE.md) · [Inspiration](docs/REFERENCES.md)

## License

[MIT](LICENSE). Dependencies retain their respective licenses.

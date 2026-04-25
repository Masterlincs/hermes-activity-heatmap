# Activity Heatmap for Hermes

A GitHub-style contribution heatmap for the [Hermes Agent](https://github.com/NousResearch/hermes-agent) dashboard. See your agent usage at a glance — sessions, tokens, tool calls, and cost — bucketed by day with click-through to per-day session lists, an inline session message viewer, and streak tracking.

Embedded directly into the **Analytics** page and available as a compact **header strip** widget below the top nav.

## Features

- **4 period views** — Year (53 weeks), Month (calendar grid), Week (7-day strip), Day (24-hour bar chart)
- **6 metrics** — Sessions, Total Tokens, Input Tokens, Output Tokens, Tool Calls, Cost
- **Per-platform filter** — Filter heatmap by source: CLI, Telegram, Discord, Slack, etc.
- **Click any cell** — opens a slide-in panel with that day's sessions, hour breakdown, and models used
- **Inline session viewer** — click a session card to view its messages inline, or resume in Chat
- **Streak tracking** — current streak + all-time best
- **Header strip widget** — compact 12-week mini heatmap in the top nav bar, clickable to scroll to the full heatmap
- **Theme-aware** — heatmap inherits your active dashboard theme's colors via CSS variables
- **CSV export** — download raw activity data as CSV
- **PNG export** — export the year-view heatmap as a high-resolution PNG
- **Animated reveal** — cells fade in column-by-column on first load
- **Today indicator** — pulsing outline on today's cell
- **Loading shimmer** — placeholder grid while data loads
- **Empty state** — shows when no sessions exist yet

## Install

```bash
git clone https://github.com/Masterlincs/hermes-activity-heatmap ~/.hermes/plugins/activity-heatmap
```

Then restart `hermes dashboard` or trigger a rescan:

```bash
curl http://127.0.0.1:9119/api/dashboard/plugins/rescan
```

The heatmap appears as a card at the bottom of the **Analytics** page. A compact mini heatmap also appears in the header strip below the top nav.

## How it works

The plugin reads from Hermes' `SessionDB` and aggregates sessions by day/hour on the backend using a FastAPI router. The frontend renders an inline SVG grid (no charting library — ~370 `<rect>` elements for a year view) and reads CSS variables from the active dashboard theme, so switching themes restyles the heatmap automatically.

All code is isolated to `~/.hermes/plugins/activity-heatmap/` — zero modifications to the core Hermes codebase.

## License

MIT

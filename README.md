# Activity Heatmap for Hermes

A GitHub-style contribution heatmap for the [Hermes Agent](https://github.com/NousResearch/hermes-agent) dashboard. See your agent usage at a glance: sessions, tokens, tool calls, and cost — all bucketed by day, with click-through to per-day session lists and a streak counter to keep you honest.

## Features

- **Year + month views** — 53 weeks at a glance, or zoom into a single month with day-level numbers
- **6 metrics** — Sessions, Total Tokens, Input Tokens, Output Tokens, Tool Calls, Estimated Cost
- **Click any cell** — opens a slide-in panel with that day's sessions, hour breakdown, and models used
- **Streak tracking** — current streak + all-time best, displayed next to the heatmap
- **Header strip widget** — compact 12-week heatmap below the nav for at-a-glance daily checking
- **Theme-aware** — heatmap inherits your active theme's primary colour automatically via CSS variables
- **Keyboard navigation** — arrow keys move between cells, Enter to drill in, Escape to close
- **Animated reveal** — cells fade in column-by-column on first load
- **Today indicator** — pulsing outline on today's cell
- **Loading shimmer** — placeholder grid while data loads
- **Empty state** — friendly prompt when no sessions exist yet

## Install

```bash
git clone https://github.com/Masterlincs/hermes-activity-heatmap ~/.hermes/plugins/activity-heatmap
```

Then either restart `hermes dashboard` or trigger a rescan:

```bash
curl http://127.0.0.1:9119/api/dashboard/plugins/rescan
```

The **Activity** tab appears after Analytics in the nav.

## How it works

The plugin reads from Hermes' `SessionDB` and aggregates sessions by day on the backend using a FastAPI router. The frontend renders an inline SVG grid (no charting library needed — ~370 `<rect>` elements for a year) and reads CSS variables from the active theme, so switching themes restyles the heatmap automatically.

## License

MIT

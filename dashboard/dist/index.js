(function () {
  "use strict";

  const SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK) return;
  const { React } = SDK;
  const { useState, useEffect, useMemo, useCallback, useRef } = SDK.hooks;
  const { Card, CardHeader, CardTitle, CardContent, Badge, Button } = SDK.components;

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  const CELL_SIZE = 12;
  const CELL_GAP = 2;
  const CELL_PITCH = CELL_SIZE + CELL_GAP;
  const ROWS = 7;
  const COLS = 53;
  const PADDING_LEFT = 28;
  const PADDING_TOP = 20;
  const SVG_WIDTH = PADDING_LEFT + COLS * CELL_PITCH;
  const SVG_HEIGHT = PADDING_TOP + ROWS * CELL_PITCH;

  const MONTH_CELL_SIZE = 52;
  const MONTH_CELL_GAP = 4;
  const MONTH_CELL_PITCH = MONTH_CELL_SIZE + MONTH_CELL_GAP;

  const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const SHORT_MONTH = MONTH_NAMES;

  const METRICS = [
    { key: "sessions",     label: "Sessions",    icon: "💬", format: (v) => String(v) },
    { key: "tokens",       label: "Tokens",      icon: "🔤", format: (v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v) },
    { key: "tool_calls",   label: "Tool Calls",  icon: "🔧", format: (v) => String(v) },
    { key: "cost",         label: "Cost",        icon: "💰", format: (v) => `$${Number(v).toFixed(2)}` },
    { key: "input_tokens", label: "Input Tok",   icon: "📥", format: (v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v) },
    { key: "output_tokens",label: "Output Tok",  icon: "📤", format: (v) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v) },
  ];

  function metricFmt(key, v) {
    const m = METRICS.find(m => m.key === key);
    return m ? m.format(v) : String(v);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function cellFill(value, buckets) {
    if (!value || value <= 0) return "var(--color-muted)";
    const idx = buckets.findIndex((b, i) => i < buckets.length - 1 && value <= buckets[i + 1]);
    const bucket = idx === -1 ? 4 : idx + 1;
    const intensity = Math.round((Math.min(bucket, 4) / 4) * 100);
    return `color-mix(in srgb, var(--color-primary) ${intensity}%, var(--color-card))`;
  }

  function formatLongDate(dateStr) {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  function formatShortDate(dateStr) {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function formatTime(isoStr) {
    const d = new Date(isoStr);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  // ---------------------------------------------------------------------------
  // HeatmapGrid — year view
  // ---------------------------------------------------------------------------

  function YearGrid({ cells, buckets, onCellClick, focusedIdx, setFocusedIdx, metric }) {
    const today = todayISO();
    const [tooltip, setTooltip] = useState(null);
    const svgRef = useRef(null);

    // Month labels
    const monthLabels = useMemo(() => {
      const labels = [];
      let lastMonth = -1;
      cells.forEach((cell, i) => {
        if (i % 7 !== 0) return;
        const m = new Date(cell.date + "T12:00:00").getMonth();
        if (m !== lastMonth) {
          labels.push({ x: PADDING_LEFT + (i / 7) * CELL_PITCH, text: SHORT_MONTH[m] });
          lastMonth = m;
        }
      });
      return labels;
    }, [cells]);

    function cellPosition(idx) {
      const col = Math.floor(idx / 7);
      const row = idx % 7;
      return { x: PADDING_LEFT + col * CELL_PITCH, y: PADDING_TOP + row * CELL_PITCH };
    }

    return React.createElement("div", { style: { position: "relative", overflowX: "auto" } },
      React.createElement("svg", {
        ref: svgRef,
        className: "heatmap-svg",
        width: SVG_WIDTH,
        height: SVG_HEIGHT,
        style: { display: "block" },
        tabIndex: 0,
        onKeyDown: (e) => {
          if (focusedIdx === null) return;
          let next = focusedIdx;
          switch (e.key) {
            case "ArrowRight": next += 7; break;
            case "ArrowLeft":  next -= 7; break;
            case "ArrowDown":  next += 1; break;
            case "ArrowUp":    next -= 1; break;
            case "Enter":      onCellClick(cells[focusedIdx].date); return;
            case "Escape":     onCellClick(null); return;
            default: return;
          }
          e.preventDefault();
          setFocusedIdx(Math.max(0, Math.min(cells.length - 1, next)));
        },
      },
        // Day-of-week labels (M, W, F only to avoid clutter)
        [0, 2, 4].map(row =>
          React.createElement("text", {
            key: row,
            x: PADDING_LEFT - 4,
            y: PADDING_TOP + row * CELL_PITCH + CELL_SIZE - 2,
            textAnchor: "end",
            fontSize: 9,
            fill: "var(--color-muted-foreground)",
          }, DOW_LABELS[row].slice(0, 1))
        ),

        // Month labels
        monthLabels.map((l, i) =>
          React.createElement("text", {
            key: i, x: l.x, y: 13,
            fontSize: 10,
            fill: "var(--color-muted-foreground)",
          }, l.text)
        ),

        // Cells
        cells.map((cell, idx) => {
          const { x, y } = cellPosition(idx);
          const isToday = cell.date === today;
          const isFocused = focusedIdx === idx;
          const col = Math.floor(idx / 7);
          return React.createElement("rect", {
            key: cell.date,
            x, y,
            width: CELL_SIZE,
            height: CELL_SIZE,
            rx: 2,
            fill: cellFill(cell.value, buckets),
            className: "heatmap-cell" + (isToday ? " heatmap-cell-today" : ""),
            style: {
              animationDelay: `${col * 8}ms`,
              cursor: "pointer",
              stroke: isFocused ? "var(--color-foreground)" : isToday ? "var(--color-foreground)" : "none",
              strokeWidth: isFocused ? 1.5 : isToday ? 1.5 : 0,
            },
            onMouseEnter: (e) => {
              const rect = svgRef.current.getBoundingClientRect();
              setTooltip({ cell, x: e.clientX - rect.left, y: e.clientY - rect.top });
              setFocusedIdx(idx);
            },
            onMouseLeave: () => setTooltip(null),
            onClick: () => onCellClick(cell.date),
          });
        }),

        // Legend
        React.createElement(HeatmapLegend, { buckets, y: SVG_HEIGHT - 2 }),
      ),

      // Tooltip
      tooltip && React.createElement(HeatmapTooltip, {
        cell: tooltip.cell,
        mouseX: tooltip.x,
        mouseY: tooltip.y,
        metric,
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // HeatmapGrid — month view
  // ---------------------------------------------------------------------------

  function MonthGrid({ cells, buckets, onCellClick, metric }) {
    const today = todayISO();
    // Build a 7-col calendar
    // Find the weekday of the first day (Mon=0)
    const firstDate = new Date(cells[0].date + "T12:00:00");
    const firstDow = (firstDate.getDay() + 6) % 7; // Mon=0

    const allSlots = [];
    for (let i = 0; i < firstDow; i++) allSlots.push(null);
    cells.forEach(c => allSlots.push(c));

    const weeks = [];
    for (let i = 0; i < allSlots.length; i += 7) {
      weeks.push(allSlots.slice(i, i + 7));
    }

    return React.createElement("div", { style: { overflowX: "auto" } },
      React.createElement("div", { style: { display: "inline-block" } },
        // Day-of-week headers
        React.createElement("div", { style: { display: "grid", gridTemplateColumns: `repeat(7, ${MONTH_CELL_SIZE}px)`, gap: MONTH_CELL_GAP, marginBottom: 4 } },
          DOW_LABELS.map(d => React.createElement("div", {
            key: d,
            style: { textAlign: "center", fontSize: 11, color: "var(--color-muted-foreground)", fontWeight: 500 },
          }, d))
        ),
        // Weeks
        weeks.map((week, wi) =>
          React.createElement("div", {
            key: wi,
            style: { display: "grid", gridTemplateColumns: `repeat(7, ${MONTH_CELL_SIZE}px)`, gap: MONTH_CELL_GAP, marginBottom: MONTH_CELL_GAP },
          },
            week.map((cell, di) => {
              if (!cell) return React.createElement("div", { key: di, style: { width: MONTH_CELL_SIZE, height: MONTH_CELL_SIZE } });
              const isToday = cell.date === today;
              const dayNum = new Date(cell.date + "T12:00:00").getDate();
              return React.createElement("div", {
                key: cell.date,
                style: {
                  width: MONTH_CELL_SIZE,
                  height: MONTH_CELL_SIZE,
                  background: cellFill(cell.value, buckets),
                  borderRadius: 4,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  border: isToday ? "1.5px solid var(--color-foreground)" : "1px solid var(--color-border)",
                  fontSize: 12,
                  fontWeight: isToday ? 700 : 400,
                  color: cell.value > 0 ? "var(--color-card)" : "var(--color-muted-foreground)",
                  gap: 2,
                },
                onClick: () => onCellClick(cell.date),
              },
                React.createElement("span", null, dayNum),
                cell.value > 0 && React.createElement("span", { style: { fontSize: 10, opacity: 0.9 } }, metricFmt(metric, cell.value)),
              );
            })
          )
        )
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Legend
  // ---------------------------------------------------------------------------

  function HeatmapLegend({ buckets, y }) {
    const fills = [0, 1, 2, 3, 4].map(i =>
      i === 0 ? "var(--color-muted)" : `color-mix(in srgb, var(--color-primary) ${i * 25}%, var(--color-card))`
    );
    const startX = SVG_WIDTH - 5 * (CELL_SIZE + 2) - 38;
    return React.createElement(React.Fragment, null,
      React.createElement("text", { x: startX - 2, y, fontSize: 9, fill: "var(--color-muted-foreground)", textAnchor: "end" }, "Less"),
      fills.map((fill, i) =>
        React.createElement("rect", {
          key: i,
          x: startX + i * (CELL_SIZE + 2),
          y: y - CELL_SIZE,
          width: CELL_SIZE, height: CELL_SIZE, rx: 2,
          fill,
        })
      ),
      React.createElement("text", { x: startX + 5 * (CELL_SIZE + 2) + 2, y, fontSize: 9, fill: "var(--color-muted-foreground)" }, "More"),
    );
  }

  // ---------------------------------------------------------------------------
  // Tooltip
  // ---------------------------------------------------------------------------

  function HeatmapTooltip({ cell, mouseX, mouseY, metric }) {
    if (!cell) return null;
    return React.createElement("div", {
      className: "heatmap-tooltip",
      style: { left: mouseX + 14, top: mouseY - 42, pointerEvents: "none" },
    },
      React.createElement("div", { className: "tt-date" }, formatShortDate(cell.date)),
      React.createElement("div", { className: "tt-value" },
        `${cell.sessions} session${cell.sessions !== 1 ? "s" : ""}`
      ),
      (cell.tokens > 0 || cell.cost > 0) && React.createElement("div", { className: "tt-meta" },
        `${metricFmt("tokens", cell.tokens)} tokens · $${Number(cell.cost || 0).toFixed(3)}`
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // SummaryRow
  // ---------------------------------------------------------------------------

  function SummaryRow({ data, metric }) {
    if (!data) return null;
    const m = METRICS.find(m => m.key === metric) || METRICS[0];
    const items = [
      { label: "Total", value: m.format(data.total) },
      { label: "Daily avg", value: m.format(Math.round(data.daily_avg * 100) / 100) },
      { label: "Active days", value: String(data.active_days) },
      { label: "Busiest", value: data.max != null ? m.format(data.max) : "—" },
    ];
    return React.createElement("div", { className: "summary-row" },
      items.map(item =>
        React.createElement("div", { key: item.label, className: "summary-stat" },
          React.createElement("div", { className: "summary-stat-value" }, item.value),
          React.createElement("div", { className: "summary-stat-label" }, item.label),
        )
      )
    );
  }

  // ---------------------------------------------------------------------------
  // StreakBadge
  // ---------------------------------------------------------------------------

  function StreakBadge({ streaks }) {
    if (!streaks) return null;
    const cur = streaks.current;
    const best = streaks.best;
    let icon = cur.length > 0 ? "🔥" : "😴";
    let label = cur.length > 0 ? `${cur.length}-day streak` : "No streak";
    if (cur.length > 0 && cur.length >= best.length) {
      label += cur.length === best.length ? " (tied for best!)" : " (new record!)";
    }
    let tooltipText = cur.length === 0
      ? "Start a session today to begin a new streak!"
      : best.length > 0 && best.started
        ? `Best ever: ${best.length} days (${best.started} – ${best.ended || "ongoing"})`
        : "";

    return React.createElement("span", {
      className: "streak-badge",
      title: tooltipText,
    }, `${icon} ${label}`);
  }

  // ---------------------------------------------------------------------------
  // HeaderBar
  // ---------------------------------------------------------------------------

  function HeaderBar({ metric, setMetric, period, setPeriod, anchor, setAnchor, streaks }) {
    const anchorDate = new Date(anchor + "T12:00:00");
    const year = anchorDate.getFullYear();
    const today = todayISO();
    const isCurrentYear = anchor === today || anchor.startsWith(String(new Date().getFullYear()));
    const isThisYear = anchor >= (new Date().getFullYear() + "-01-01") && anchor <= today;

    function shiftYear(delta) {
      const d = new Date(anchor + "T12:00:00");
      d.setFullYear(d.getFullYear() + delta);
      const newDate = d.toISOString().slice(0, 10);
      setAnchor(newDate > today ? today : newDate);
    }

    return React.createElement("div", { className: "activity-header-bar" },
      // Period toggle
      React.createElement("div", { className: "period-toggle" },
        ["year", "month"].map(p =>
          React.createElement("button", {
            key: p,
            className: "period-btn" + (period === p ? " active" : ""),
            onClick: () => setPeriod(p),
          }, p.charAt(0).toUpperCase() + p.slice(1))
        )
      ),

      // Metric picker
      React.createElement("div", { className: "metric-picker" },
        METRICS.map(m =>
          React.createElement("button", {
            key: m.key,
            className: "metric-btn" + (metric === m.key ? " active" : ""),
            onClick: () => setMetric(m.key),
            title: m.label,
          }, `${m.icon} ${m.label}`)
        )
      ),

      // Year navigator (year view only)
      period === "year" && React.createElement("div", { className: "year-nav" },
        React.createElement("button", { className: "year-nav-btn", onClick: () => shiftYear(-1) }, "◀"),
        React.createElement("span", { className: "year-nav-label" }, year),
        React.createElement("button", {
          className: "year-nav-btn",
          onClick: () => shiftYear(1),
          disabled: isThisYear,
        }, "▶"),
        !isThisYear && React.createElement("button", {
          className: "year-nav-back",
          onClick: () => setAnchor(today),
        }, "Back to today"),
      ),

      // Streak badge
      React.createElement(StreakBadge, { streaks }),
    );
  }

  // ---------------------------------------------------------------------------
  // DayPanel
  // ---------------------------------------------------------------------------

  function HourBar({ breakdown }) {
    const max = Math.max(...breakdown.map(h => h.sessions), 1);
    return React.createElement("div", { className: "hour-bar-chart" },
      breakdown.map(h =>
        React.createElement("div", { key: h.hour, className: "hour-bar-col", title: `${h.hour}:00 — ${h.sessions} sessions` },
          React.createElement("div", {
            className: "hour-bar",
            style: { height: `${Math.round((h.sessions / max) * 40)}px` },
          }),
          h.hour % 6 === 0 && React.createElement("span", { className: "hour-bar-label" }, h.hour),
        )
      )
    );
  }

  function DayPanel({ date, onClose }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      let cancelled = false;
      setLoading(true);
      SDK.fetchJSON(`/api/plugins/activity-heatmap/day/${date}`)
        .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
        .catch(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }, [date]);

    useEffect(() => {
      function onKey(e) { if (e.key === "Escape") onClose(); }
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }, [onClose]);

    return React.createElement(React.Fragment, null,
      React.createElement("div", { className: "day-panel-backdrop", onClick: onClose }),
      React.createElement("div", { className: "day-panel open" },
        // Header
        React.createElement("div", { className: "day-panel-header" },
          React.createElement("span", { className: "day-panel-title" }, formatLongDate(date)),
          React.createElement("button", { className: "day-panel-close", onClick: onClose }, "×"),
        ),

        loading && React.createElement("div", { className: "day-panel-loading" }, "Loading…"),

        !loading && data && data.summary.sessions === 0 &&
          React.createElement("div", { className: "day-panel-empty" },
            React.createElement("div", { className: "day-panel-empty-icon" }, "📅"),
            React.createElement("p", null, "No activity on this day."),
            React.createElement("p", { className: "text-muted" }, "Try clicking a brighter cell."),
          ),

        !loading && data && data.summary.sessions > 0 &&
          React.createElement("div", { className: "day-panel-body" },
            // Summary stats
            React.createElement("div", { className: "day-summary-stats" },
              [
                { label: "Sessions", value: data.summary.sessions },
                { label: "Tokens", value: metricFmt("tokens", data.summary.tokens) },
                { label: "Tool Calls", value: data.summary.tool_calls },
                { label: "Cost", value: `$${Number(data.summary.cost).toFixed(3)}` },
              ].map(s =>
                React.createElement("div", { key: s.label, className: "day-stat" },
                  React.createElement("div", { className: "day-stat-value" }, String(s.value)),
                  React.createElement("div", { className: "day-stat-label" }, s.label),
                )
              )
            ),

            // Hour breakdown
            React.createElement("h4", { className: "day-section-title" }, "By hour"),
            React.createElement(HourBar, { breakdown: data.hour_breakdown }),

            // Models
            data.models_used.length > 0 && React.createElement(React.Fragment, null,
              React.createElement("h4", { className: "day-section-title" }, "Models"),
              React.createElement("div", { className: "day-models" },
                data.models_used.map(m =>
                  React.createElement("span", { key: m.name, className: "day-model-badge" },
                    `${m.name} ×${m.sessions}`
                  )
                )
              ),
            ),

            // Session list
            React.createElement("h4", { className: "day-section-title" }, `Sessions (${data.sessions.length})`),
            React.createElement("div", { className: "day-session-list" },
              data.sessions.map(s =>
                React.createElement("div", {
                  key: s.id,
                  className: "day-session-card",
                  onClick: () => { window.location.hash = `/sessions/${s.id}`; onClose(); },
                },
                  React.createElement("div", { className: "session-title" }, s.title),
                  React.createElement("div", { className: "session-meta" },
                    React.createElement("span", { className: "session-model-chip" }, s.model),
                    React.createElement("span", null, formatTime(s.started_at)),
                    React.createElement("span", null, `${s.message_count} msgs`),
                    React.createElement("span", null, metricFmt("tokens", s.tokens) + " tok"),
                  ),
                )
              )
            ),
          ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // ActivityPage (main)
  // ---------------------------------------------------------------------------

  function ActivityPage() {
    const [metric, setMetric] = useState("sessions");
    const [period, setPeriod] = useState("year");
    const [anchor, setAnchor] = useState(todayISO());
    const [data, setData] = useState(null);
    const [streaks, setStreaks] = useState(null);
    const [selectedDate, setSelectedDate] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [focusedIdx, setFocusedIdx] = useState(null);

    useEffect(() => {
      let cancelled = false;
      setLoading(true);
      setError(null);
      Promise.all([
        SDK.fetchJSON(`/api/plugins/activity-heatmap/data?metric=${metric}&period=${period}&date=${anchor}`),
        SDK.fetchJSON("/api/plugins/activity-heatmap/streaks"),
      ]).then(([d, s]) => {
        if (!cancelled) { setData(d); setStreaks(s); setLoading(false); }
      }).catch((e) => {
        if (!cancelled) { setError(String(e)); setLoading(false); }
      });
      return () => { cancelled = true; };
    }, [metric, period, anchor]);

    const cells = data ? data.cells : [];
    const buckets = data ? data.buckets : [0, 1, 2, 3, 4];
    const hasNoData = !loading && data && data.total === 0 && data.active_days === 0;

    return React.createElement("div", { className: "activity-heatmap-page space-y-4" },
      // Header bar
      React.createElement(HeaderBar, { metric, setMetric, period, setPeriod, anchor, setAnchor, streaks }),

      // Summary row
      React.createElement(SummaryRow, { data, metric }),

      // Error banner
      error && React.createElement("div", { className: "activity-error-banner" },
        `Failed to load data: ${error}`
      ),

      // Heatmap card
      React.createElement(Card, null,
        React.createElement(CardContent, { style: { paddingTop: "1rem" } },
          // Empty state
          hasNoData && React.createElement("div", { className: "activity-empty-state" },
            React.createElement("div", { className: "empty-icon" }, "📊"),
            React.createElement("h3", null, "No activity yet"),
            React.createElement("p", { className: "text-muted" },
              "Once you start using Hermes, your sessions will appear here as a heatmap."
            ),
          ),

          // Loading shimmer
          loading && React.createElement("div", { className: "heatmap-loading" },
            React.createElement("svg", { width: SVG_WIDTH, height: SVG_HEIGHT },
              Array.from({ length: COLS }).flatMap((_, col) =>
                Array.from({ length: ROWS }).map((_, row) =>
                  React.createElement("rect", {
                    key: `${col}-${row}`,
                    x: PADDING_LEFT + col * CELL_PITCH,
                    y: PADDING_TOP + row * CELL_PITCH,
                    width: CELL_SIZE, height: CELL_SIZE, rx: 2,
                    fill: "var(--color-muted)",
                  })
                )
              )
            )
          ),

          // Real grid
          !loading && !hasNoData && cells.length > 0 && (
            period === "year"
              ? React.createElement(YearGrid, { cells, buckets, onCellClick: setSelectedDate, focusedIdx, setFocusedIdx, metric })
              : React.createElement(MonthGrid, { cells, buckets, onCellClick: setSelectedDate, metric })
          ),
        ),
      ),

      // Day panel
      selectedDate && React.createElement(DayPanel, {
        date: selectedDate,
        onClose: () => setSelectedDate(null),
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // HeaderStripWidget
  // ---------------------------------------------------------------------------

  function HeaderStripWidget() {
    const [data, setData] = useState(null);

    useEffect(() => {
      SDK.fetchJSON("/api/plugins/activity-heatmap/header-strip").then(setData).catch(() => {});
    }, []);

    if (!data) return null;

    const STRIP_CELL = 6;
    const STRIP_GAP = 1;
    const STRIP_PITCH = STRIP_CELL + STRIP_GAP;

    return React.createElement("div", {
      className: "header-strip-widget",
      onClick: () => { window.location.hash = "/activity"; },
      title: "View activity heatmap",
    },
      React.createElement("span", { className: "hsw-label" }, "Last 12 weeks"),
      React.createElement("svg", {
        width: data.cells.length * STRIP_PITCH,
        height: STRIP_CELL + 2,
        style: { display: "inline-block", verticalAlign: "middle", margin: "0 8px" },
      },
        data.cells.map((c, i) =>
          React.createElement("rect", {
            key: c.date,
            x: i * STRIP_PITCH, y: 1,
            width: STRIP_CELL, height: STRIP_CELL,
            fill: cellFill(c.value, data.buckets),
            rx: 1,
          })
        )
      ),
      React.createElement("span", { className: "hsw-streak" },
        data.current_streak > 0 ? `🔥 ${data.current_streak}d` : ""
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Register
  // ---------------------------------------------------------------------------

  window.__HERMES_PLUGINS__.register("activity-heatmap", ActivityPage);
  window.__HERMES_PLUGINS__.registerSlot("activity-heatmap", "header-banner", HeaderStripWidget);

})();

(function () {
  "use strict";

  var SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK) return;
  var React = SDK.React;
  var useState = SDK.hooks.useState;
  var useEffect = SDK.hooks.useEffect;
  var useMemo = SDK.hooks.useMemo;
  var useCallback = SDK.hooks.useCallback;
  var useRef = SDK.hooks.useRef;
  var Card = SDK.components.Card;
  var CardContent = SDK.components.CardContent;
  var Badge = SDK.components.Badge;
  var Button = SDK.components.Button;

  // -------------------------------------------------------------------------
  // Constants
  // -------------------------------------------------------------------------

  var METRICS = [
    { key: "sessions",     label: "Sessions",    format: function(v) { return String(v); } },
    { key: "tokens",       label: "Tokens",      format: function(v) { return v >= 1e6 ? (v/1e6).toFixed(1)+"M" : v >= 1e3 ? (v/1e3).toFixed(1)+"K" : String(v); } },
    { key: "input_tokens", label: "Input",       format: function(v) { return v >= 1e6 ? (v/1e6).toFixed(1)+"M" : v >= 1e3 ? (v/1e3).toFixed(1)+"K" : String(v); } },
    { key: "output_tokens",label: "Output",      format: function(v) { return v >= 1e6 ? (v/1e6).toFixed(1)+"M" : v >= 1e3 ? (v/1e3).toFixed(1)+"K" : String(v); } },
    { key: "tool_calls",   label: "Tool calls",  format: function(v) { return String(v); } },
    { key: "cost",         label: "Cost",        format: function(v) { return "$"+Number(v).toFixed(2); } },
  ];

  var PERIODS = ["year", "month", "week", "day"];

  var DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var DOW_SHORT = ["M", "T", "W", "T", "F", "S", "S"];
  var SHORT_MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // Standardised slot — every view fits in this fixed-height area
  var SLOT_HEIGHT = 180;

  // Year-grid SVG geometry
  var YEAR_GAP = 3;
  var YEAR_PAD_LEFT = 22;
  var YEAR_PAD_TOP = 14;
  var YEAR_MIN_CELL = 8;
  var YEAR_MAX_CELL = 22;

  function todayISO() {
    var d = new Date();
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  }

  function metricFmt(key, v) {
    for (var i = 0; i < METRICS.length; i++) {
      if (METRICS[i].key === key) return METRICS[i].format(v);
    }
    return String(v);
  }

  function metricLabel(key) {
    for (var i = 0; i < METRICS.length; i++) {
      if (METRICS[i].key === key) return METRICS[i].label;
    }
    return key;
  }

  function cellFill(value, buckets) {
    if (!value || value <= 0) return "var(--color-muted)";
    var idx = -1;
    for (var i = 0; i < buckets.length - 1; i++) {
      if (value <= buckets[i + 1]) { idx = i; break; }
    }
    var bucket = idx === -1 ? 4 : idx + 1;
    var intensity = Math.round((Math.min(bucket, 4) / 4) * 100);
    return "color-mix(in srgb, var(--color-primary) " + intensity + "%, var(--color-card))";
  }

  function formatLongDate(dateStr) {
    var d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  function formatShortDate(dateStr) {
    var d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function formatTime(isoStr) {
    var d = new Date(isoStr);
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  // -------------------------------------------------------------------------
  // Year cell-size hook — picks the smaller of width-driven and height-driven,
  // so the SVG always fits the 180px slot AND the available width.
  // -------------------------------------------------------------------------

  function useYearCellSize() {
    var _useState = useState(14);
    var size = _useState[0];
    var setSize = _useState[1];

    var roRef = useRef(null);
    var COLS = 53;
    var ROWS = 7;
    var heightCellMax = Math.floor((SLOT_HEIGHT - YEAR_PAD_TOP - (ROWS - 1) * YEAR_GAP) / ROWS);

    var callbackRef = useCallback(function (el) {
      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }
      if (!el) return;
      function measure(w) {
        var avail = w - YEAR_PAD_LEFT - 4;
        var widthCell = Math.floor((avail - YEAR_GAP * (COLS - 1)) / COLS);
        var s = Math.min(widthCell, heightCellMax, YEAR_MAX_CELL);
        setSize(Math.max(YEAR_MIN_CELL, s));
      }
      measure(el.getBoundingClientRect().width);
      roRef.current = new ResizeObserver(function (entries) {
        measure(entries[0].contentRect.width);
      });
      roRef.current.observe(el);
    }, [heightCellMax]);

    useEffect(function () {
      return function () {
        if (roRef.current) roRef.current.disconnect();
      };
    }, []);

    return { cellSize: size, ref: callbackRef };
  }

  // -------------------------------------------------------------------------
  // Year grid (53 x 7 SVG)
  // -------------------------------------------------------------------------

  function YearGrid(props) {
    var cells = props.cells;
    var buckets = props.buckets;
    var onCellClick = props.onCellClick;
    var onCellHover = props.onCellHover;
    var onCellUnhover = props.onCellUnhover;
    var cellSize = props.cellSize;

    var today = todayISO();
    var pitch = cellSize + YEAR_GAP;
    var cols = 53;
    var svgWidth = YEAR_PAD_LEFT + cols * pitch;
    var svgHeight = YEAR_PAD_TOP + 7 * pitch;

    var monthLabels = useMemo(function () {
      var labels = [];
      var lastMonth = -1;
      for (var i = 0; i < cells.length; i++) {
        if (i % 7 !== 0) continue;
        var m = new Date(cells[i].date + "T12:00:00").getMonth();
        if (m !== lastMonth) {
          labels.push({ x: YEAR_PAD_LEFT + (i / 7) * pitch, text: SHORT_MONTH[m] });
          lastMonth = m;
        }
      }
      return labels;
    }, [cells, pitch]);

    function pos(idx) {
      var col = Math.floor(idx / 7);
      var row = idx % 7;
      return { x: YEAR_PAD_LEFT + col * pitch, y: YEAR_PAD_TOP + row * pitch };
    }

    var dayLabels = useMemo(function () {
      return [0, 2, 4].map(function (row) {
        return React.createElement("text", {
          key: row,
          x: YEAR_PAD_LEFT - 4,
          y: YEAR_PAD_TOP + row * pitch + cellSize - 1,
          textAnchor: "end",
          className: "hm-text-meta",
        }, DOW_LABELS[row].slice(0, 1));
      });
    }, [pitch, cellSize]);

    var monthLabelEls = useMemo(function () {
      return monthLabels.map(function (l, i) {
        return React.createElement("text", { key: i, x: l.x, y: 10, className: "hm-text-meta" }, l.text);
      });
    }, [monthLabels]);

    var rects = useMemo(function () {
      return cells.map(function (cell, idx) {
        var p = pos(idx);
        var isToday = cell.date === today;
        var col = Math.floor(idx / 7);
        return React.createElement("rect", {
          key: cell.date,
          x: p.x, y: p.y,
          width: cellSize, height: cellSize, rx: 2,
          fill: cellFill(cell.value, buckets),
          className: "hm-cell" + (isToday ? " hm-cell-today" : ""),
          style: { animationDelay: col * 6 + "ms", cursor: "pointer" },
          onClick: function () { onCellClick(cell.date); },
          onMouseEnter: function (e) { onCellHover && onCellHover(cell, e); },
          onMouseMove: function (e) { onCellHover && onCellHover(cell, e); },
          onMouseLeave: function () { onCellUnhover && onCellUnhover(); },
        });
      });
    }, [cells, buckets, cellSize, today, onCellClick, onCellHover, onCellUnhover]);

    return React.createElement("svg", { className: "hm-svg", width: svgWidth, height: svgHeight, viewBox: "0 0 " + svgWidth + " " + svgHeight },
      dayLabels,
      monthLabelEls,
      rects,
    );
  }

  // -------------------------------------------------------------------------
  // Month grid — true calendar, fills the 180px slot
  // -------------------------------------------------------------------------

  function MonthGrid(props) {
    var cells = props.cells;
    var buckets = props.buckets;
    var onCellClick = props.onCellClick;
    var onCellHover = props.onCellHover;
    var onCellUnhover = props.onCellUnhover;
    var metric = props.metric;

    var today = todayISO();

    var grid = useMemo(function () {
      if (!cells || cells.length === 0) return { weeks: [] };
      var firstDate = new Date(cells[0].date + "T12:00:00");
      var firstDow = (firstDate.getDay() + 6) % 7;
      var slots = [];
      for (var i = 0; i < firstDow; i++) slots.push(null);
      for (var i = 0; i < cells.length; i++) slots.push(cells[i]);
      while (slots.length % 7 !== 0) slots.push(null);
      var weeks = [];
      for (var i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));
      return { weeks: weeks };
    }, [cells]);

    return React.createElement("div", { className: "hm-month-grid" },
      React.createElement("div", { className: "hm-month-header" },
        DOW_LABELS.map(function (d) {
          return React.createElement("div", { key: d, className: "hm-month-dow" }, d.slice(0, 3));
        }),
      ),
      React.createElement("div", { className: "hm-month-body" },
        grid.weeks.map(function (week, wi) {
          return week.map(function (cell, di) {
            if (!cell) {
              return React.createElement("div", {
                key: wi + "-" + di,
                className: "hm-month-cell hm-month-cell-empty",
              });
            }
            var isToday = cell.date === today;
            var dayNum = new Date(cell.date + "T12:00:00").getDate();
            return React.createElement("div", {
              key: cell.date,
              className: "hm-month-cell" + (isToday ? " hm-month-cell-today" : ""),
              style: {
                background: cellFill(cell.value, buckets),
                animationDelay: (wi * 30) + "ms",
              },
              onClick: function () { onCellClick(cell.date); },
              onMouseEnter: function (e) { onCellHover && onCellHover(cell, e); },
              onMouseLeave: function () { onCellUnhover && onCellUnhover(); },
            },
              React.createElement("span", { className: "hm-month-daynum" }, dayNum),
              cell.value > 0 && React.createElement("span", { className: "hm-month-val" }, metricFmt(metric, cell.value)),
            );
          });
        }),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Week grid — 7 columns: dow / coloured block / value, fills slot
  // -------------------------------------------------------------------------

  function WeekGrid(props) {
    var cells = props.cells;
    var buckets = props.buckets;
    var onCellClick = props.onCellClick;
    var onCellHover = props.onCellHover;
    var onCellUnhover = props.onCellUnhover;
    var metric = props.metric;

    var today = todayISO();
    if (!cells) return null;

    return React.createElement("div", { className: "hm-week-grid" },
      cells.map(function (cell, i) {
        var d = new Date(cell.date + "T12:00:00");
        var dow = d.toLocaleDateString(undefined, { weekday: "short" });
        var isToday = cell.date === today;
        var hasValue = cell.value > 0;
        return React.createElement("div", { key: cell.date, className: "hm-week-col" },
          React.createElement("div", { className: "hm-week-dow" }, dow),
          React.createElement("div", {
            className: "hm-week-cell" + (isToday ? " hm-week-cell-today" : ""),
            style: {
              background: cellFill(cell.value, buckets),
              animationDelay: (i * 40) + "ms",
            },
            onClick: function () { onCellClick(cell.date); },
            onMouseEnter: function (e) { onCellHover && onCellHover(cell, e); },
            onMouseMove: function (e) { onCellHover && onCellHover(cell, e); },
            onMouseLeave: function () { onCellUnhover && onCellUnhover(); },
          }),
          React.createElement("div", {
            className: "hm-week-val" + (hasValue ? "" : " hm-week-val-empty"),
          }, hasValue ? metricFmt(metric, cell.value) : "·"),
        );
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Day bars — 24 vertical bars filling the slot
  // -------------------------------------------------------------------------

  function DayBars(props) {
    var cells = props.cells;
    var onCellClick = props.onCellClick;
    var onCellHover = props.onCellHover;
    var onCellUnhover = props.onCellUnhover;
    var anchor = props.anchor;

    var maxVal = 1;
    if (cells) {
      for (var i = 0; i < cells.length; i++) {
        if (cells[i].value > maxVal) maxVal = cells[i].value;
      }
    }

    if (!cells) return null;

    return React.createElement("div", { className: "hm-day-grid" },
      React.createElement("div", { className: "hm-day-bars" },
        cells.map(function (c, i) {
          var pct = c.value > 0 ? Math.max(2, Math.round((c.value / maxVal) * 100)) : 1;
          var isActive = c.value > 0;
          var tooltipCell = { date: anchor, hour: c.hour, sessions: c.sessions || 0, tokens: c.tokens || 0, cost: c.cost || 0 };
          return React.createElement("div", { key: c.hour, className: "hm-day-bar-col",
            onClick: function () { onCellClick(anchor); },
            onMouseEnter: function (e) { onCellHover && onCellHover(tooltipCell, e); },
            onMouseMove: function (e) { onCellHover && onCellHover(tooltipCell, e); },
            onMouseLeave: function () { onCellUnhover && onCellUnhover(); },
          },
            React.createElement("div", {
              className: "hm-day-bar" + (isActive ? " hm-day-bar-active" : ""),
              style: { height: pct + "%" },
            }),
          );
        }),
      ),
      React.createElement("div", { className: "hm-day-axis" },
        Array.from({ length: 24 }).map(function (_, h) {
          return React.createElement("div", { key: h, className: "hm-day-tick" },
            h % 6 === 0 ? String(h) : "",
          );
        }),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Legend — used in footer for all views
  // -------------------------------------------------------------------------

  function LegendBar() {
    var fills = [0, 1, 2, 3, 4].map(function (i) {
      return i === 0 ? "var(--color-muted)" : "color-mix(in srgb, var(--color-primary) " + (i * 25) + "%, var(--color-card))";
    });
    return React.createElement("div", { className: "hm-legend" },
      React.createElement("span", { className: "hm-legend-label" }, "Less"),
      fills.map(function (fill, i) {
        return React.createElement("div", { key: i, className: "hm-legend-swatch", style: { background: fill } });
      }),
      React.createElement("span", { className: "hm-legend-label" }, "More"),
    );
  }

  // -------------------------------------------------------------------------
  // Summary row — same shape, refined styling lives in CSS
  // -------------------------------------------------------------------------

  function SummaryRow(props) {
    var data = props.data;
    var metric = props.metric;
    if (!data) return null;
    var m = null;
    for (var i = 0; i < METRICS.length; i++) {
      if (METRICS[i].key === metric) { m = METRICS[i]; break; }
    }
    if (!m) return null;
    var items = [
      { label: "Total", value: m.format(data.total) },
      { label: "Daily avg", value: m.format(Math.round(data.daily_avg * 100) / 100) },
      { label: "Active days", value: String(data.active_days) },
      { label: "Busiest", value: data.max != null ? m.format(data.max) : "—" },
    ];
    return React.createElement("div", { className: "hm-summary-row" },
      items.map(function (item) {
        return React.createElement("div", { key: item.label, className: "hm-summary-stat" },
          React.createElement("div", { className: "hm-summary-val" }, item.value),
          React.createElement("div", { className: "hm-summary-lbl" }, item.label),
        );
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Streak badge
  // -------------------------------------------------------------------------

  function StreakBadge(props) {
    var streaks = props.streaks;
    if (!streaks) return null;
    var cur = streaks.current;
    var best = streaks.best;
    var label;
    var title;
    if (cur.length > 0) {
      label = cur.length + "-day streak";
      if (cur.length >= best.length) {
        label += cur.length === best.length ? " (tied)" : " (record)";
      }
      title = best.length > 0 && best.started
        ? "Best: " + best.length + " days (" + best.started + " — " + (best.ended || "ongoing") + ")"
        : "";
    } else {
      label = "No streak";
      title = "Start a session today to begin a new streak";
    }
    return React.createElement(Badge, { variant: "secondary", className: "hm-streak", title: title }, label);
  }

  // -------------------------------------------------------------------------
  // Metric selector — inline button group
  // -------------------------------------------------------------------------

  function MetricSelect(props) {
    var value = props.value;
    var onChange = props.onChange;
    return React.createElement("div", { className: "hm-metric-group" },
      METRICS.map(function (m) {
        return React.createElement("button", {
          key: m.key,
          className: "hm-metric-btn" + (value === m.key ? " hm-active" : ""),
          onClick: function () { onChange(m.key); },
        }, m.label);
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Platform filter — inline button group
  // -------------------------------------------------------------------------

  function PlatformFilter(props) {
    var platforms = props.platforms;
    var value = props.value;
    var onChange = props.onChange;

    if (!platforms || platforms.length <= 1) return null;

    return React.createElement("div", { className: "hm-platform-group" },
      React.createElement("button", {
        className: "hm-platform-btn" + ((!value || value === "all") ? " hm-active" : ""),
        onClick: function () { onChange("all"); },
      }, "All"),
      platforms.map(function (p) {
        return React.createElement("button", {
          key: p,
          className: "hm-platform-btn" + (value === p ? " hm-active" : ""),
          onClick: function () { onChange(p); },
        }, p.charAt(0).toUpperCase() + p.slice(1));
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Session viewer (inline in DayPanel)
  // -------------------------------------------------------------------------

  function SessionViewer(props) {
    var session = props.session;
    var onClose = props.onClose;

    var _useState2 = useState(null);
    var messages = _useState2[0];
    var setMessages = _useState2[1];
    var _useState3 = useState(true);
    var loading = _useState3[0];
    var setLoading = _useState3[1];
    var _useState4 = useState(null);
    var error = _useState4[0];
    var setError = _useState4[1];

    useEffect(function () {
      var cancelled = false;
      setLoading(true);
      setError(null);
      SDK.fetchJSON("/api/sessions/" + session.id + "/messages")
        .then(function (resp) {
          if (!cancelled) { setMessages(resp ? resp.messages : []); setLoading(false); }
        })
        .catch(function (e) {
          if (!cancelled) { setError(String(e)); setLoading(false); }
        });
      return function () { cancelled = true; };
    }, [session.id]);

    return React.createElement("div", { className: "hm-session-viewer" },
      React.createElement("div", { className: "hm-sv-header" },
        React.createElement("span", { className: "hm-sv-title" }, session.title),
        React.createElement("button", { className: "hm-sv-back", onClick: onClose }, "Back"),
      ),
      React.createElement("div", { className: "hm-sv-meta" },
        React.createElement("span", null, session.model),
        React.createElement("span", null, session.message_count + " msgs"),
        React.createElement("span", null, metricFmt("tokens", session.tokens) + " tok"),
        React.createElement("span", null, "$" + Number(session.cost || 0).toFixed(3)),
      ),
      loading && React.createElement("div", { className: "hm-sv-loading" }, "Loading messages..."),
      error && React.createElement("div", { className: "hm-sv-error" }, error),
      messages && messages.length === 0 && !loading &&
        React.createElement("div", { className: "hm-sv-empty" }, "No messages in this session."),
      messages && messages.length > 0 &&
        React.createElement("div", { className: "hm-sv-messages" },
          messages.map(function (msg, i) {
            return React.createElement("div", { key: i, className: "hm-msg hm-msg-" + msg.role },
              React.createElement("div", { className: "hm-msg-label" },
                msg.tool_name ? msg.role + ": " + msg.tool_name : msg.role
              ),
              msg.content && React.createElement("div", { className: "hm-msg-content" },
                msg.content.length > 500 ? msg.content.slice(0, 500) + "..." : msg.content
              ),
            );
          }),
        ),
    );
  }

  // -------------------------------------------------------------------------
  // Day panel (slide-in)
  // -------------------------------------------------------------------------

  function DayPanel(props) {
    var date = props.date;
    var onClose = props.onClose;

    var _useState5 = useState(null);
    var data = _useState5[0];
    var setData = _useState5[1];
    var _useState6 = useState(true);
    var loading = _useState6[0];
    var setLoading = _useState6[1];

    var _useState7 = useState(null);
    var activeSession = _useState7[0];
    var setActiveSession = _useState7[1];

    useEffect(function () {
      var cancelled = false;
      setLoading(true);
      setActiveSession(null);
      SDK.fetchJSON("/api/plugins/activity-heatmap/day/" + date)
        .then(function (d) { if (!cancelled) { setData(d); setLoading(false); } })
        .catch(function () { if (!cancelled) setLoading(false); });
      return function () { cancelled = true; };
    }, [date]);

    useEffect(function () {
      function onKey(e) { if (e.key === "Escape") { if (activeSession) setActiveSession(null); else onClose(); } }
      document.addEventListener("keydown", onKey);
      return function () { document.removeEventListener("keydown", onKey); };
    }, [onClose, activeSession]);

    if (activeSession) {
      return React.createElement(React.Fragment, null,
        React.createElement("div", { className: "hm-dp-backdrop", onClick: function () { setActiveSession(null); } }),
        React.createElement("div", { className: "hm-dp hm-dp-open" },
          React.createElement(SessionViewer, { session: activeSession, onClose: function () { setActiveSession(null); } }),
        ),
      );
    }

    return React.createElement(React.Fragment, null,
      React.createElement("div", { className: "hm-dp-backdrop", onClick: onClose }),
      React.createElement("div", { className: "hm-dp hm-dp-open" },
        React.createElement("div", { className: "hm-dp-header" },
          React.createElement("span", { className: "hm-dp-title" }, formatLongDate(date)),
          React.createElement("button", { className: "hm-dp-close", onClick: onClose }, "×"),
        ),

        loading && React.createElement("div", { className: "hm-dp-loading" }, "Loading..."),

        !loading && data && data.summary.sessions === 0 &&
          React.createElement("div", { className: "hm-dp-empty" },
            React.createElement("p", null, "No activity on this day."),
            React.createElement("p", { className: "hm-text-muted" }, "Try clicking a brighter cell."),
          ),

        !loading && data && data.summary.sessions > 0 &&
          React.createElement("div", { className: "hm-dp-body" },
            React.createElement("div", { className: "hm-dp-stats" },
              [
                { label: "Sessions", value: data.summary.sessions },
                { label: "Tokens", value: metricFmt("tokens", data.summary.tokens) },
                { label: "Tool calls", value: data.summary.tool_calls },
                { label: "Cost", value: "$" + Number(data.summary.cost).toFixed(3) },
              ].map(function (s) {
                return React.createElement("div", { key: s.label, className: "hm-dp-stat" },
                  React.createElement("div", { className: "hm-dp-stat-val" }, String(s.value)),
                  React.createElement("div", { className: "hm-dp-stat-lbl" }, s.label),
                );
              }),
            ),

            React.createElement("h4", { className: "hm-dp-section-title" }, "By hour"),
            React.createElement("div", { className: "hm-dp-hour-wrap" },
              (function () {
                var maxH = 1;
                for (var i = 0; i < data.hour_breakdown.length; i++) {
                  if (data.hour_breakdown[i].sessions > maxH) maxH = data.hour_breakdown[i].sessions;
                }
                return data.hour_breakdown.map(function (h) {
                  var barH = h.sessions > 0 ? Math.round((h.sessions / maxH) * 32) : 1;
                  return React.createElement("div", { key: h.hour, className: "hm-dp-hour-col", title: h.hour + ":00 - " + h.sessions + " sessions" },
                    React.createElement("div", { className: "hm-dp-hour-bar" + (h.sessions > 0 ? " hm-dp-hour-active" : ""), style: { height: barH + "px" } }),
                    h.hour % 6 === 0 && React.createElement("span", { className: "hm-dp-hour-label" }, h.hour),
                  );
                });
              })(),
            ),

            data.models_used.length > 0 && React.createElement(React.Fragment, null,
              React.createElement("h4", { className: "hm-dp-section-title" }, "Models"),
              React.createElement("div", { className: "hm-dp-models" },
                data.models_used.map(function (m) {
                  return React.createElement("span", { key: m.name, className: "hm-dp-model-chip" },
                    m.name + " ×" + m.sessions
                  );
                }),
              ),
            ),

            React.createElement("h4", { className: "hm-dp-section-title" }, "Sessions (" + data.sessions.length + ")"),
            React.createElement("div", { className: "hm-dp-session-list" },
              data.sessions.map(function (s) {
                return React.createElement("div", {
                  key: s.id,
                  className: "hm-dp-session-card",
                  onClick: function () { setActiveSession(s); },
                },
                  React.createElement("div", { className: "hm-dp-session-title" }, s.title),
                  React.createElement("div", { className: "hm-dp-session-meta" },
                    React.createElement("span", { className: "hm-dp-session-model" }, s.model),
                    React.createElement("span", { className: "hm-dp-session-time" }, formatTime(s.started_at)),
                    React.createElement("span", null, s.message_count + " msgs"),
                    React.createElement("span", null, metricFmt("tokens", s.tokens) + " tok"),
                  ),
                );
              }),
            ),
          ),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Tooltip
  // -------------------------------------------------------------------------

  function HeatmapTooltip(props) {
    var cell = props.cell;
    var mouseX = props.mouseX;
    var mouseY = props.mouseY;
    var metric = props.metric;
    if (!cell) return null;

    var header = cell.hour != null
      ? cell.hour + ":00"
      : formatShortDate(cell.date);

    var valText = cell.sessions + " session" + (cell.sessions !== 1 ? "s" : "");

    return React.createElement("div", {
      className: "hm-tooltip",
      style: { left: mouseX + 14 + "px", top: mouseY - 42 + "px", pointerEvents: "none" },
    },
      React.createElement("div", { className: "hm-tt-date" }, header),
      React.createElement("div", { className: "hm-tt-val" }, valText),
      (cell.tokens > 0 || cell.cost > 0) && React.createElement("div", { className: "hm-tt-meta" },
        metricFmt("tokens", cell.tokens) + " tokens · $" + Number(cell.cost || 0).toFixed(3),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Header bar — single row: title + metric, period segmented control on right
  // -------------------------------------------------------------------------

  function HeaderBar(props) {
    var metric = props.metric;
    var setMetric = props.setMetric;
    var period = props.period;
    var setPeriod = props.setPeriod;
    var anchor = props.anchor;
    var platforms = props.platforms;
    var platformVal = props.platformVal;
    var setPlatformVal = props.setPlatformVal;

    return React.createElement("div", { className: "hm-header" },
      React.createElement("div", { className: "hm-header-top" },
        React.createElement("div", { className: "hm-title" }, "Activity"),
        React.createElement("div", { className: "hm-period-group" },
          PERIODS.map(function (p) {
            return React.createElement("button", {
              key: p,
              className: "hm-period-btn" + (period === p ? " hm-active" : ""),
              onClick: function () { setPeriod(p); },
            }, p.charAt(0).toUpperCase() + p.slice(1));
          }),
        ),
      ),
      React.createElement("div", { className: "hm-header-filters" },
        React.createElement(MetricSelect, { value: metric, onChange: setMetric }),
        React.createElement(PlatformFilter, { platforms: platforms, value: platformVal, onChange: setPlatformVal }),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Footer bar — year nav, streak, legend, exports
  // -------------------------------------------------------------------------

  function FooterBar(props) {
    var anchor = props.anchor;
    var setAnchor = props.setAnchor;
    var streaks = props.streaks;
    var onExportCSV = props.onExportCSV;
    var onExportPNG = props.onExportPNG;
    var period = props.period;

    var today = todayISO();
    var anchorDate = new Date(anchor + "T12:00:00");
    var anchorYear = anchorDate.getFullYear();
    var thisYear = new Date().getFullYear();
    var isCurrentPeriod = false;

    var navLabel = "";
    var shiftFn = null;

    if (period === "year") {
      isCurrentPeriod = anchor >= String(thisYear) + "-01-01" && anchor <= today;
      navLabel = String(anchorYear);
      shiftFn = function (delta) {
        var d = new Date(anchor + "T12:00:00");
        d.setFullYear(d.getFullYear() + delta);
        var nd = d.toISOString().slice(0, 10);
        setAnchor(nd > today ? today : nd);
      };
    } else if (period === "month") {
      var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      navLabel = monthNames[anchorDate.getMonth()] + " " + anchorYear;
      var thisMonth = new Date().getMonth();
      var thisMonthYear = new Date().getFullYear();
      isCurrentPeriod = anchorYear === thisMonthYear && anchorDate.getMonth() === thisMonth;
      shiftFn = function (delta) {
        var d = new Date(anchor + "T12:00:00");
        d.setMonth(d.getMonth() + delta);
        var nd = d.toISOString().slice(0, 10);
        setAnchor(nd > today ? today : nd);
      };
    } else if (period === "week") {
      var weekStart = new Date(anchor + "T12:00:00");
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      var weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      var startStr = weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      var endStr = weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      navLabel = startStr + " – " + endStr;
      isCurrentPeriod = anchor >= today && anchor <= today;
      shiftFn = function (delta) {
        var d = new Date(anchor + "T12:00:00");
        d.setDate(d.getDate() + delta * 7);
        var nd = d.toISOString().slice(0, 10);
        setAnchor(nd > today ? today : nd);
      };
    } else if (period === "day") {
      navLabel = anchorDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      isCurrentPeriod = anchor === today;
      shiftFn = function (delta) {
        var d = new Date(anchor + "T12:00:00");
        d.setDate(d.getDate() + delta);
        var nd = d.toISOString().slice(0, 10);
        setAnchor(nd > today ? today : nd);
      };
    }

    return React.createElement("div", { className: "hm-footer" },
      React.createElement("div", { className: "hm-year-nav" },
        React.createElement("button", {
          className: "hm-year-btn",
          onClick: function () { shiftFn(-1); },
          "aria-label": "Previous " + period,
        }, "◀"),
        React.createElement("span", { className: "hm-year-label" }, navLabel),
        React.createElement("button", {
          className: "hm-year-btn",
          onClick: function () { shiftFn(1); },
          disabled: isCurrentPeriod,
          "aria-label": "Next " + period,
        }, "▶"),
        !isCurrentPeriod && React.createElement("button", {
          className: "hm-year-back",
          onClick: function () { setAnchor(today); },
        }, "Today"),
      ),

      React.createElement(StreakBadge, { streaks: streaks }),

      React.createElement(LegendBar, null),

      React.createElement("div", { className: "hm-export-group" },
        React.createElement(Button, { variant: "outline", size: "sm", className: "hm-export-btn", onClick: onExportCSV }, "CSV"),
        period === "year" && React.createElement(Button, { variant: "outline", size: "sm", className: "hm-export-btn", onClick: onExportPNG }, "PNG"),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Loading skeleton — fills the slot
  // -------------------------------------------------------------------------

  function LoadingSkeleton(props) {
    var period = props.period;

    if (period === "day" || period === "week") {
      return React.createElement("div", { className: "hm-loading", style: { display: "grid", gridTemplateColumns: period === "day" ? "repeat(24, 1fr)" : "repeat(7, 1fr)", gap: period === "day" ? 2 : 8, alignItems: "end" } },
        Array.from({ length: period === "day" ? 24 : 7 }).map(function (_, i) {
          var h = 30 + ((i * 17) % 60);
          return React.createElement("div", {
            key: i,
            className: "hm-shimmer-block",
            style: { height: h + "%", borderRadius: 4 },
          });
        }),
      );
    }

    if (period === "month") {
      return React.createElement("div", { className: "hm-loading", style: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: "1fr", gap: 4, height: "100%" } },
        Array.from({ length: 35 }).map(function (_, i) {
          return React.createElement("div", { key: i, className: "hm-shimmer-block" });
        }),
      );
    }

    // year
    return React.createElement("div", { className: "hm-loading", style: { display: "grid", gridTemplateColumns: "repeat(53, 1fr)", gridAutoRows: "1fr", gap: 3, height: "100%", padding: "10px 0" } },
      Array.from({ length: 53 * 7 }).map(function (_, i) {
        return React.createElement("div", { key: i, className: "hm-shimmer-block", style: { borderRadius: 2 } });
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  function EmptyState() {
    return React.createElement("div", { className: "hm-empty" },
      React.createElement("div", { className: "hm-empty-icon" }, "📊"),
      React.createElement("h3", null, "No activity yet"),
      React.createElement("p", { className: "hm-text-muted" },
        "Once you start using Hermes, your sessions will appear here as a heatmap."
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Grid slot — fixed-height container for any view
  // -------------------------------------------------------------------------

  function GridSlot(props) {
    return React.createElement("div", { className: "hm-grid-slot", ref: props.containerRef },
      React.createElement("div", { className: "hm-grid-slot-inner" }, props.children),
    );
  }

  // -------------------------------------------------------------------------
  // Main heatmap card (registered in analytics:top slot)
  // -------------------------------------------------------------------------

  function HeatmapCard() {
    var _useState8 = useState("sessions");
    var metric = _useState8[0];
    var setMetric = _useState8[1];
    var _useState9 = useState("year");
    var period = _useState9[0];
    var setPeriod = _useState9[1];
    var _useState10 = useState(todayISO());
    var anchor = _useState10[0];
    var setAnchor = _useState10[1];
    var _useState11 = useState(null);
    var data = _useState11[0];
    var setData = _useState11[1];
    var _useState12 = useState(null);
    var streaks = _useState12[0];
    var setStreaks = _useState12[1];
    var _useState13 = useState(null);
    var selectedDate = _useState13[0];
    var setSelectedDate = _useState13[1];
    var _useState14 = useState(true);
    var loading = _useState14[0];
    var setLoading = _useState14[1];
    var _useState15 = useState(null);
    var error = _useState15[0];
    var setError = _useState15[1];
    var _useState16 = useState(null);
    var platforms = _useState16[0];
    var setPlatforms = _useState16[1];
    var _useState17 = useState("all");
    var platformVal = _useState17[0];
    var setPlatformVal = _useState17[1];

    var _useState18 = useState(null);
    var tooltip = _useState18[0];
    var setTooltip = _useState18[1];

    var _useYearCellSize = useYearCellSize();
    var yearCellSize = _useYearCellSize.cellSize;
    var yearGridRef = _useYearCellSize.ref;

    var tooltipTimeout = useRef(null);

    // Fetch data
    useEffect(function () {
      var cancelled = false;
      setLoading(true);
      setError(null);
      setTooltip(null);

      var params = "metric=" + encodeURIComponent(metric) + "&period=" + encodeURIComponent(period) + "&date=" + encodeURIComponent(anchor);
      if (platformVal && platformVal !== "all") params += "&source=" + encodeURIComponent(platformVal);

      var streaksParams = platformVal && platformVal !== "all" ? "?source=" + encodeURIComponent(platformVal) : "";

      Promise.all([
        SDK.fetchJSON("/api/plugins/activity-heatmap/data?" + params),
        SDK.fetchJSON("/api/plugins/activity-heatmap/streaks" + streaksParams),
      ]).then(function (results) {
        if (!cancelled) { setData(results[0]); setStreaks(results[1]); setLoading(false); }
      }).catch(function (e) {
        if (!cancelled) { setError(String(e)); setLoading(false); }
      });
      return function () { cancelled = true; };
    }, [metric, period, anchor, platformVal]);

    // Fetch platforms on mount
    useEffect(function () {
      SDK.fetchJSON("/api/plugins/activity-heatmap/platforms")
        .then(function (d) { setPlatforms(d.platforms); })
        .catch(function () {});
    }, []);

    var hasNoData = !loading && data && data.total === 0 && data.active_days === 0;

    function onCellClick(date) { setSelectedDate(date); }
    function onCellHover(cell, e) {
      if (tooltipTimeout.current) { clearTimeout(tooltipTimeout.current); tooltipTimeout.current = null; }
      setTooltip({ cell: cell, x: e.clientX, y: e.clientY });
    }
    function onCellUnhover() {
      tooltipTimeout.current = setTimeout(function () { setTooltip(null); }, 80);
    }

    // Export CSV
    function onExportCSV() {
      var params = "metric=" + encodeURIComponent(metric) + "&period=" + encodeURIComponent(period) + "&date=" + encodeURIComponent(anchor);
      if (platformVal && platformVal !== "all") params += "&source=" + encodeURIComponent(platformVal);
      var url = "/api/plugins/activity-heatmap/export/csv?" + params;
      var a = document.createElement("a");
      a.href = url;
      a.download = "hermes-activity-" + period + "-" + anchor + ".csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    // Export PNG (year view only — the SVG is the year grid)
    function onExportPNG() {
      var svg = document.querySelector(".hm-svg");
      if (!svg) return;
      var xml = new XMLSerializer().serializeToString(svg);
      var blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onerror = function () { URL.revokeObjectURL(url); };
      img.onload = function () {
        var canvas = document.createElement("canvas");
        canvas.width = svg.clientWidth * 2;
        canvas.height = svg.clientHeight * 2;
        var ctx = canvas.getContext("2d");
        ctx.scale(2, 2);
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-card");
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(function (b) {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(b);
          a.download = "hermes-activity-" + todayISO() + ".png";
          a.click();
          URL.revokeObjectURL(a.href);
        });
        URL.revokeObjectURL(url);
      };
      img.src = url;
    }

    function renderView() {
      if (loading) return React.createElement(LoadingSkeleton, { period: period });
      if (hasNoData) return React.createElement(EmptyState, null);
      if (!data || !data.cells || data.cells.length === 0) return null;

      var cells = data.cells;
      var buckets = data.buckets;

      if (period === "year") {
        return React.createElement("div", { className: "hm-year-wrap" },
          React.createElement(YearGrid, {
            cells: cells, buckets: buckets, cellSize: yearCellSize,
            onCellClick: onCellClick, onCellHover: onCellHover, onCellUnhover: onCellUnhover,
          }),
        );
      }
      if (period === "month") {
        return React.createElement(MonthGrid, {
          cells: cells, buckets: buckets, metric: metric,
          onCellClick: onCellClick, onCellHover: onCellHover, onCellUnhover: onCellUnhover,
        });
      }
      if (period === "week") {
        return React.createElement(WeekGrid, {
          cells: cells, buckets: buckets, metric: metric,
          onCellClick: onCellClick, onCellHover: onCellHover, onCellUnhover: onCellUnhover,
        });
      }
      if (period === "day") {
        return React.createElement(DayBars, { cells: cells, onCellClick: onCellClick, onCellHover: onCellHover, onCellUnhover: onCellUnhover, anchor: anchor });
      }
      return null;
    }

    return React.createElement(Card, { className: "hm-card" },
      React.createElement(CardContent, { className: "hm-card-content" },
        React.createElement(HeaderBar, {
          metric: metric, setMetric: setMetric,
          period: period, setPeriod: setPeriod,
          anchor: anchor,
          platforms: platforms,
          platformVal: platformVal, setPlatformVal: setPlatformVal,
        }),

        React.createElement(SummaryRow, { data: data, metric: metric }),

        error && React.createElement("div", { className: "hm-error" }, "Failed to load data: " + error),

        React.createElement(GridSlot, { containerRef: period === "year" ? yearGridRef : null },
          renderView(),
        ),

        React.createElement(FooterBar, {
          anchor: anchor, setAnchor: setAnchor,
          streaks: streaks,
          onExportCSV: onExportCSV, onExportPNG: onExportPNG,
          period: period,
        }),

        tooltip && React.createElement(HeatmapTooltip, {
          cell: tooltip.cell,
          mouseX: tooltip.x,
          mouseY: tooltip.y,
        }),

        selectedDate && React.createElement(DayPanel, {
          date: selectedDate,
          onClose: function () { setSelectedDate(null); },
        }),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Header strip widget (registered in header-banner slot)
  // -------------------------------------------------------------------------

  function HeaderStripWidget() {
    var _useState19 = useState(null);
    var data = _useState19[0];
    var setData = _useState19[1];

    useEffect(function () {
      SDK.fetchJSON("/api/plugins/activity-heatmap/header-strip")
        .then(setData)
        .catch(function () {});
    }, []);

    if (!data) return null;

    var STRIP_CELL = 9;
    var STRIP_GAP = 2;
    var STRIP_PITCH = STRIP_CELL + STRIP_GAP;

    return React.createElement("div", {
      className: "hm-header-strip",
      onClick: function () {
        var el = document.querySelector(".hm-card");
        if (el) el.scrollIntoView({ behavior: "smooth" });
      },
      title: "View activity heatmap",
    },
      React.createElement("span", { className: "hm-hs-label" }, "Activity"),
      React.createElement("svg", {
        width: data.cells.length * STRIP_PITCH,
        height: STRIP_CELL + 2,
        className: "hm-hs-svg",
      },
        data.cells.map(function (c, i) {
          return React.createElement("rect", {
            key: c.date,
            x: i * STRIP_PITCH, y: 1,
            width: STRIP_CELL, height: STRIP_CELL, rx: 2,
            fill: cellFill(c.value, data.buckets),
          });
        }),
      ),
      data.current_streak > 0 && React.createElement("span", { className: "hm-hs-streak" },
        data.current_streak + "d"
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Register
  // -------------------------------------------------------------------------

  window.__HERMES_PLUGINS__.register("activity-heatmap", HeatmapCard);
  window.__HERMES_PLUGINS__.registerSlot("activity-heatmap", "analytics:top", HeatmapCard);
  window.__HERMES_PLUGINS__.registerSlot("activity-heatmap", "header-banner", HeaderStripWidget);

})();

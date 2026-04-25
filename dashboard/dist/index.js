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
  var Select = SDK.components.Select;
  var SelectOption = SDK.components.SelectOption;

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
  var SHORT_MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  var CELL_GAP = 2;
  var PADDING_LEFT = 28;
  var PADDING_TOP = 20;
  var MIN_CELL = 10;
  var MAX_CELL = 18;

  function todayISO() {
    var d = new Date();
    return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  }

  function monthStart(anchor) {
    return anchor.slice(0, 7) + "-01";
  }

  function metricFmt(key, v) {
    for (var i = 0; i < METRICS.length; i++) {
      if (METRICS[i].key === key) return METRICS[i].format(v);
    }
    return String(v);
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
  // Responsive cell size hook — returns { cellSize, ref }
  // ref is a callback ref that attaches ResizeObserver on mount
  // -------------------------------------------------------------------------

  function useCellSize(cols) {
    var _useState = useState(14);
    var size = _useState[0];
    var setSize = _useState[1];

    var roRef = useRef(null);

    var callbackRef = useCallback(function (el) {
      if (roRef.current) {
        roRef.current.disconnect();
        roRef.current = null;
      }
      if (!el) return;
      function measure(w) {
        var avail = w - PADDING_LEFT - 16;
        var s = Math.floor((avail - CELL_GAP * (cols - 1)) / cols);
        setSize(Math.max(MIN_CELL, Math.min(MAX_CELL, s)));
      }
      measure(el.getBoundingClientRect().width);
      roRef.current = new ResizeObserver(function (entries) {
        measure(entries[0].contentRect.width);
      });
      roRef.current.observe(el);
    }, [cols]);

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
    var metric = props.metric;
    var cellSize = props.cellSize;

    var today = todayISO();
    var pitch = cellSize + CELL_GAP;
    var cols = 53;
    var svgWidth = PADDING_LEFT + cols * pitch;
    var svgHeight = PADDING_TOP + 7 * pitch;

    var monthLabels = useMemo(function () {
      var labels = [];
      var lastMonth = -1;
      for (var i = 0; i < cells.length; i++) {
        if (i % 7 !== 0) continue;
        var m = new Date(cells[i].date + "T12:00:00").getMonth();
        if (m !== lastMonth) {
          labels.push({ x: PADDING_LEFT + (i / 7) * pitch, text: SHORT_MONTH[m] });
          lastMonth = m;
        }
      }
      return labels;
    }, [cells, pitch]);

    function pos(idx) {
      var col = Math.floor(idx / 7);
      var row = idx % 7;
      return { x: PADDING_LEFT + col * pitch, y: PADDING_TOP + row * pitch };
    }

    var dayLabels = useMemo(function () {
      return [0, 2, 4].map(function (row) {
        return React.createElement("text", {
          key: row,
          x: PADDING_LEFT - 4,
          y: PADDING_TOP + row * pitch + cellSize - 2,
          textAnchor: "end",
          className: "hm-text-meta",
        }, DOW_LABELS[row].slice(0, 1));
      });
    }, [pitch, cellSize]);

    var monthLabelEls = useMemo(function () {
      return monthLabels.map(function (l, i) {
        return React.createElement("text", { key: i, x: l.x, y: 13, className: "hm-text-meta" }, l.text);
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
          style: { animationDelay: col * 8 + "ms", cursor: "pointer" },
          onClick: function () { onCellClick(cell.date); },
          onMouseEnter: function (e) { onCellHover && onCellHover(cell, e); },
          onMouseMove: function (e) { onCellHover && onCellHover(cell, e); },
          onMouseLeave: function () { onCellUnhover && onCellUnhover(); },
        });
      });
    }, [cells, buckets, cellSize, today, onCellClick, onCellHover, onCellUnhover]);

    var legend = useMemo(function () {
      var fills = [0, 1, 2, 3, 4].map(function (i) {
        return i === 0 ? "var(--color-muted)" : "color-mix(in srgb, var(--color-primary) " + (i * 25) + "%, var(--color-card))";
      });
      var startX = svgWidth - 5 * (cellSize + 2) - 50;
      return React.createElement(React.Fragment, null,
        React.createElement("text", { x: startX - 2, y: svgHeight - 2, className: "hm-text-legend" }, "Less"),
        fills.map(function (fill, i) {
          return React.createElement("rect", {
            key: i,
            x: startX + i * (cellSize + 2), y: svgHeight - 2 - cellSize,
            width: cellSize, height: cellSize, rx: 2, fill: fill,
          });
        }),
        React.createElement("text", { x: startX + 5 * (cellSize + 2) + 2, y: svgHeight - 2, className: "hm-text-legend" }, "More"),
      );
    }, [svgWidth, svgHeight, cellSize]);

    return React.createElement("svg", { className: "hm-svg", width: svgWidth, height: svgHeight },
        dayLabels,
        monthLabelEls,
        rects,
        legend,
      );
  }

  // -------------------------------------------------------------------------
  // Month grid (calendar grid)
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
      if (!cells || cells.length === 0) return { weeks: [], dayLabels: DOW_LABELS };
      var firstDate = new Date(cells[0].date + "T12:00:00");
      var firstDow = (firstDate.getDay() + 6) % 7;
      var slots = [];
      for (var i = 0; i < firstDow; i++) slots.push(null);
      for (var i = 0; i < cells.length; i++) slots.push(cells[i]);
      var weeks = [];
      for (var i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));
      return { weeks: weeks, dayLabels: DOW_LABELS };
    }, [cells]);

    return React.createElement("div", { className: "hm-month-grid" },
      React.createElement("div", { className: "hm-month-header" },
        grid.dayLabels.map(function (d) {
          return React.createElement("div", { key: d, className: "hm-month-dow" }, d);
        }),
      ),
      grid.weeks.map(function (week, wi) {
        return React.createElement("div", { key: wi, className: "hm-month-week" },
          week.map(function (cell, di) {
            if (!cell) return React.createElement("div", { key: di, className: "hm-month-cell hm-month-cell-empty" });
            var isToday = cell.date === today;
            var dayNum = new Date(cell.date + "T12:00:00").getDate();
            return React.createElement("div", {
              key: cell.date,
              className: "hm-month-cell" + (isToday ? " hm-month-cell-today" : ""),
              style: { background: cellFill(cell.value, buckets) },
              onClick: function () { onCellClick(cell.date); },
              onMouseEnter: function (e) { onCellHover && onCellHover(cell, e); },
              onMouseLeave: function () { onCellUnhover && onCellUnhover(); },
            },
              React.createElement("span", { className: "hm-month-daynum" }, dayNum),
              cell.value > 0 && React.createElement("span", { className: "hm-month-val" }, metricFmt(metric, cell.value)),
            );
          }),
        );
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Week strip (7-day horizontal)
  // -------------------------------------------------------------------------

  function WeekGrid(props) {
    var cells = props.cells;
    var buckets = props.buckets;
    var onCellClick = props.onCellClick;
    var onCellHover = props.onCellHover;
    var onCellUnhover = props.onCellUnhover;
    var metric = props.metric;
    var cellSize = props.cellSize;

    var today = todayISO();
    var pitch = cellSize + CELL_GAP;

    var rects = useMemo(function () {
      if (!cells) return null;
      return cells.map(function (cell, i) {
        var isToday = cell.date === today;
        return React.createElement("rect", {
          key: cell.date,
          x: i * pitch, y: 0,
          width: cellSize, height: cellSize, rx: 2,
          fill: cellFill(cell.value, buckets),
          className: "hm-cell" + (isToday ? " hm-cell-today" : ""),
          style: { cursor: "pointer" },
          onClick: function () { onCellClick(cell.date); },
          onMouseEnter: function (e) { onCellHover && onCellHover(cell, e); },
          onMouseMove: function (e) { onCellHover && onCellHover(cell, e); },
          onMouseLeave: function () { onCellUnhover && onCellUnhover(); },
        });
      });
    }, [cells, buckets, cellSize, pitch, today, onCellClick, onCellHover, onCellUnhover]);

    var labels = useMemo(function () {
      if (!cells) return null;
      return cells.map(function (cell, i) {
        var d = new Date(cell.date + "T12:00:00");
        return React.createElement("text", {
          key: cell.date,
          x: i * pitch + cellSize / 2, y: cellSize + 12,
          textAnchor: "middle",
          className: "hm-text-meta",
          style: { fontSize: 8 },
        }, d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2));
      });
    }, [cells, cellSize, pitch]);

    return React.createElement("svg", {
      className: "hm-week-svg",
      width: cells ? cells.length * pitch : 100,
      height: cellSize + 16,
    }, rects, labels);
  }

  // -------------------------------------------------------------------------
  // Day bars (24-hour)
  // -------------------------------------------------------------------------

  function DayBars(props) {
    var cells = props.cells;
    var onCellClick = props.onCellClick;
    var cellSize = props.cellSize;

    var maxVal = 1;
    if (cells) {
      for (var i = 0; i < cells.length; i++) {
        if (cells[i].value > maxVal) maxVal = cells[i].value;
      }
    }

    if (!cells) return null;

    return React.createElement("div", { className: "hm-day-bars" },
      cells.map(function (c) {
        var h = c.value > 0 ? Math.round((c.value / maxVal) * 80) : 1;
        var isActive = c.value > 0;
        return React.createElement("div", { key: c.hour, className: "hm-day-bar-col", title: c.hour + ":00  - " + c.value + " sessions" },
          React.createElement("div", {
            className: "hm-day-bar" + (isActive ? " hm-day-bar-active" : ""),
            style: { height: h + "px" },
          }),
          React.createElement("span", { className: "hm-day-bar-label" },
            c.hour === 0 ? "0" : c.hour === 12 ? "12" : c.hour % 6 === 0 ? String(c.hour) : ""
          ),
        );
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Legend (for week/day views — compact)
  // -------------------------------------------------------------------------

  function CompactLegend(props) {
    var buckets = props.buckets;
    var fills = [0, 1, 2, 3, 4].map(function (i) {
      return i === 0 ? "var(--color-muted)" : "color-mix(in srgb, var(--color-primary) " + (i * 25) + "%, var(--color-card))";
    });
    return React.createElement("div", { className: "hm-compact-legend" },
      React.createElement("span", { className: "hm-legend-label" }, "Less"),
      fills.map(function (fill, i) {
        return React.createElement("div", { key: i, className: "hm-legend-swatch", style: { background: fill } });
      }),
      React.createElement("span", { className: "hm-legend-label" }, "More"),
    );
  }

  // -------------------------------------------------------------------------
  // Summary row
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
        label += cur.length === best.length ? " (tied for best)" : " (new record)";
      }
      title = best.length > 0 && best.started
        ? "Best: " + best.length + " days (" + best.started + "  - " + (best.ended || "ongoing") + ")"
        : "";
    } else {
      label = "No streak";
      title = "Start a session today to begin a new streak";
    }
    return React.createElement(Badge, { variant: "secondary", className: "hm-streak", title: title }, label);
  }

  // -------------------------------------------------------------------------
  // Platform filter
  // -------------------------------------------------------------------------

  function PlatformFilter(props) {
    var platforms = props.platforms;
    var value = props.value;
    var onChange = props.onChange;

    if (!platforms || platforms.length <= 1) return null;

    var opts = [React.createElement(SelectOption, { key: "", value: "all" }, "All platforms")];
    for (var i = 0; i < platforms.length; i++) {
      opts.push(React.createElement(SelectOption, { key: platforms[i], value: platforms[i] },
        platforms[i].charAt(0).toUpperCase() + platforms[i].slice(1)
      ));
    }

    return React.createElement("div", { className: "hm-platform-filter" },
      React.createElement(Select, {
        value: value || "all",
        onValueChange: onChange,
        className: "hm-platform-select",
      }, opts),
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
      React.createElement("div", { className: "hm-sv-actions" },
        React.createElement(Button, {
          variant: "outline",
          size: "sm",
          className: "hm-sv-chat-btn",
          onClick: function () { window.location.hash = "/chat?resume=" + encodeURIComponent(session.id); },
        }, "Resume in Chat"),
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
          React.createElement("button", { className: "hm-dp-close", onClick: onClose }, "\u00D7"),
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
                    m.name + " \u00D7" + m.sessions
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
    if (!cell) return null;
    return React.createElement("div", {
      className: "hm-tooltip",
      style: { left: mouseX + 14 + "px", top: mouseY - 42 + "px", pointerEvents: "none" },
    },
      React.createElement("div", { className: "hm-tt-date" }, formatShortDate(cell.date)),
      React.createElement("div", { className: "hm-tt-val" },
        cell.sessions + " session" + (cell.sessions !== 1 ? "s" : ""),
      ),
      (cell.tokens > 0 || cell.cost > 0) && React.createElement("div", { className: "hm-tt-meta" },
        metricFmt("tokens", cell.tokens) + " tokens  \u00B7 $" + Number(cell.cost || 0).toFixed(3),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Header bar
  // -------------------------------------------------------------------------

  function HeaderBar(props) {
    var metric = props.metric;
    var setMetric = props.setMetric;
    var period = props.period;
    var setPeriod = props.setPeriod;
    var anchor = props.anchor;
    var setAnchor = props.setAnchor;
    var streaks = props.streaks;
    var platforms = props.platforms;
    var platformVal = props.platformVal;
    var setPlatformVal = props.setPlatformVal;
    var onExportCSV = props.onExportCSV;
    var onExportPNG = props.onExportPNG;

    var today = todayISO();
    var anchorYear = new Date(anchor + "T12:00:00").getFullYear();
    var thisYear = new Date().getFullYear();
    var isThisYear = anchor >= String(thisYear) + "-01-01" && anchor <= today;

    function shiftYear(delta) {
      var d = new Date(anchor + "T12:00:00");
      d.setFullYear(d.getFullYear() + delta);
      var nd = d.toISOString().slice(0, 10);
      setAnchor(nd > today ? today : nd);
    }

    return React.createElement("div", { className: "hm-header" },
      React.createElement("div", { className: "hm-header-row" },
        React.createElement("div", { className: "hm-period-group" },
          PERIODS.map(function (p) {
            return React.createElement("button", {
              key: p,
              className: "hm-period-btn" + (period === p ? " hm-active" : ""),
              onClick: function () { setPeriod(p); },
            }, p.charAt(0).toUpperCase() + p.slice(1));
          }),
        ),

        React.createElement("div", { className: "hm-metric-group" },
          METRICS.map(function (m) {
            return React.createElement("button", {
              key: m.key,
              className: "hm-metric-btn" + (metric === m.key ? " hm-active" : ""),
              onClick: function () { setMetric(m.key); },
            }, m.label);
          }),
        ),

        React.createElement(PlatformFilter, { platforms: platforms, value: platformVal, onChange: setPlatformVal }),
      ),

      React.createElement("div", { className: "hm-header-row hm-header-nav" },
        React.createElement("div", { className: "hm-year-nav" },
          React.createElement("button", {
            className: "hm-year-btn",
            onClick: function () { shiftYear(-1); },
          }, "◀"),
          React.createElement("span", { className: "hm-year-label" }, String(anchorYear)),
          React.createElement("button", {
            className: "hm-year-btn",
            onClick: function () { shiftYear(1); },
            disabled: isThisYear,
          }, "▶"),
          !isThisYear && React.createElement("button", {
            className: "hm-year-back",
            onClick: function () { setAnchor(today); },
          }, "Back to today"),
        ),

        React.createElement(StreakBadge, { streaks: streaks }),

        React.createElement("div", { className: "hm-header-spacer" }),

        React.createElement("div", { className: "hm-export-group" },
          React.createElement(Button, { variant: "outline", size: "sm", className: "hm-export-btn", onClick: onExportCSV }, "CSV"),
          React.createElement(Button, { variant: "outline", size: "sm", className: "hm-export-btn", onClick: onExportPNG }, "PNG"),
        ),
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Loading skeleton
  // -------------------------------------------------------------------------

  function LoadingSkeleton(props) {
    var cellSize = props.cellSize || 14;
    var period = props.period;
    var pitch = cellSize + CELL_GAP;

    if (period === "day") {
      return React.createElement("div", { className: "hm-loading hm-day-loading" },
        React.createElement("div", { className: "hm-shimmer-bar" }),
        React.createElement("div", { className: "hm-shimmer-bar", style: { width: "60%" } }),
        React.createElement("div", { className: "hm-shimmer-bar", style: { width: "80%" } }),
      );
    }

    if (period === "week") {
      return React.createElement("svg", { width: 7 * pitch, height: cellSize + 16, className: "hm-loading" },
        Array.from({ length: 7 }).map(function (_, i) {
          return React.createElement("rect", {
            key: i,
            x: i * pitch, y: 0,
            width: cellSize, height: cellSize, rx: 2,
            className: "hm-shimmer-rect",
          });
        }),
      );
    }

    var cols = period === "year" ? 53 : 7;
    var rows = period === "year" ? 7 : 6;
    return React.createElement("svg", {
      width: PADDING_LEFT + cols * pitch,
      height: PADDING_TOP + rows * pitch,
      className: "hm-loading",
    },
      Array.from({ length: cols }).flatMap(function (_, col) {
        return Array.from({ length: rows }).map(function (_, row) {
          return React.createElement("rect", {
            key: col + "-" + row,
            x: PADDING_LEFT + col * pitch,
            y: PADDING_TOP + row * pitch,
            width: cellSize, height: cellSize, rx: 2,
            className: "hm-shimmer-rect",
          });
        });
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  function EmptyState() {
    return React.createElement("div", { className: "hm-empty" },
      React.createElement("div", { className: "hm-empty-icon" }, "\uD83D\uDCCA"),
      React.createElement("h3", null, "No activity yet"),
      React.createElement("p", { className: "hm-text-muted" },
        "Once you start using Hermes, your sessions will appear here as a heatmap."
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Grid selector
  // -------------------------------------------------------------------------

  function HeatmapGrid(props) {
    var data = props.data;
    var period = props.period;
    var onCellClick = props.onCellClick;
    var onCellHover = props.onCellHover;
    var onCellUnhover = props.onCellUnhover;
    var metric = props.metric;
    var cellSize = props.cellSize;
    var containerRef = props.containerRef;

    if (!data || !data.cells || data.cells.length === 0) return null;

    var cells = data.cells;
    var buckets = data.buckets;

    if (period === "year") {
      return React.createElement(YearGrid, { cells: cells, buckets: buckets, onCellClick: onCellClick, onCellHover: onCellHover, onCellUnhover: onCellUnhover, metric: metric, cellSize: cellSize, containerRef: containerRef });
    }
    if (period === "month") {
      return React.createElement(MonthGrid, { cells: cells, buckets: buckets, onCellClick: onCellClick, onCellHover: onCellHover, onCellUnhover: onCellUnhover, metric: metric, cellSize: cellSize });
    }
    if (period === "week") {
      return React.createElement(WeekGrid, { cells: cells, buckets: buckets, onCellClick: onCellClick, onCellHover: onCellHover, onCellUnhover: onCellUnhover, metric: metric, cellSize: cellSize });
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Main heatmap card (registered in analytics:bottom slot)
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

    var cols = period === "year" ? 53 : period === "month" ? 7 : period === "week" ? 7 : 24;
    var _useCellSize = useCellSize(cols);
    var cellSize = _useCellSize.cellSize;
    var gridRef = _useCellSize.ref;

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

    function onCellClick(date) {
      setSelectedDate(date);
    }

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

    // Export PNG
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

    var cells = data ? data.cells : [];
    var buckets = data ? data.buckets : [0, 1, 2, 3, 4];

    return React.createElement(Card, { className: "hm-card" },
      React.createElement(CardContent, { className: "hm-card-content" },
        React.createElement(HeaderBar, {
          metric: metric, setMetric: setMetric,
          period: period, setPeriod: setPeriod,
          anchor: anchor, setAnchor: setAnchor,
          streaks: streaks,
          platforms: platforms,
          platformVal: platformVal, setPlatformVal: setPlatformVal,
          onExportCSV: onExportCSV, onExportPNG: onExportPNG,
        }),

        React.createElement(SummaryRow, { data: data, metric: metric }),

        error && React.createElement("div", { className: "hm-error" }, "Failed to load data: " + error),

        loading && React.createElement(LoadingSkeleton, { cellSize: cellSize, period: period }),

        hasNoData && React.createElement(EmptyState, null),

        !loading && !hasNoData && data && data.cells && data.cells.length > 0 && (
          period === "day"
            ? React.createElement("div", { ref: gridRef, className: "hm-grid-wrap" },
                React.createElement(DayBars, { cells: data.cells, cellSize: cellSize }),
                React.createElement(CompactLegend, { buckets: buckets }),
              )
            : React.createElement("div", { ref: gridRef, className: "hm-grid-wrap" },
                React.createElement(HeatmapGrid, {
                  data: data,
                  period: period,
                  onCellClick: onCellClick,
                  onCellHover: onCellHover,
                  onCellUnhover: onCellUnhover,
                  metric: metric,
                  cellSize: cellSize,
                }),
              )
        ),

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

    var STRIP_CELL = 8;
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
        height: STRIP_CELL + 4,
        className: "hm-hs-svg",
      },
        data.cells.map(function (c, i) {
          return React.createElement("rect", {
            key: c.date,
            x: i * STRIP_PITCH, y: 2,
            width: STRIP_CELL, height: STRIP_CELL, rx: 1,
            fill: cellFill(c.value, data.buckets),
          });
        }),
      ),
      data.current_streak > 0 && React.createElement("span", { className: "hm-hs-streak" },
        data.current_streak + "d streak"
      ),
    );
  }

  // -------------------------------------------------------------------------
  // Register
  // -------------------------------------------------------------------------

  window.__HERMES_PLUGINS__.register("activity-heatmap", HeatmapCard);
  window.__HERMES_PLUGINS__.registerSlot("activity-heatmap", "analytics:bottom", HeatmapCard);
  window.__HERMES_PLUGINS__.registerSlot("activity-heatmap", "header-banner", HeaderStripWidget);

})();

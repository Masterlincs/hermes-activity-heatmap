from fastapi import APIRouter, HTTPException
from datetime import datetime, timedelta, date
from collections import defaultdict
from typing import Literal
import statistics
import time

router = APIRouter()

# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

_CACHE: dict[tuple, tuple[float, list]] = {}
_TTL_SECONDS = 30


def cached_cells(start: date, end: date) -> list[dict]:
    key = (start.isoformat(), end.isoformat())
    now = time.time()
    if key in _CACHE:
        cached_at, value = _CACHE[key]
        if now - cached_at < _TTL_SECONDS:
            return value
    value = compute_cells(start, end)
    _CACHE[key] = (now, value)
    return value


# ---------------------------------------------------------------------------
# Core aggregation
# ---------------------------------------------------------------------------

def compute_cells(start: date, end: date) -> list[dict]:
    """Walk every session in [start, end] and aggregate by day."""
    try:
        from hermes_state import SessionDB
    except ImportError:
        # Return empty cells if hermes_state not available
        cells = []
        cur = start
        while cur <= end:
            cells.append({
                "date": cur.isoformat(),
                "sessions": 0, "tokens": 0, "input_tokens": 0,
                "output_tokens": 0, "tool_calls": 0, "cost": 0.0,
            })
            cur += timedelta(days=1)
        return cells

    db = SessionDB()
    try:
        sessions = db.search_sessions(limit=99999)
        cells_by_date = defaultdict(lambda: {
            "sessions": 0, "tokens": 0, "input_tokens": 0,
            "output_tokens": 0, "tool_calls": 0, "cost": 0.0,
        })

        for s in sessions:
            ts_raw = s.get("started_at")
            if ts_raw is None:
                continue
            try:
                # started_at is stored as a Unix REAL (seconds since epoch)
                ts = datetime.fromtimestamp(float(ts_raw))
                d = ts.date()
            except (ValueError, OSError, OverflowError):
                continue
            if not (start <= d <= end):
                continue
            cell = cells_by_date[d]
            cell["sessions"] += 1
            input_t = s.get("input_tokens", 0) or 0
            output_t = s.get("output_tokens", 0) or 0
            cell["tokens"] += input_t + output_t
            cell["input_tokens"] += input_t
            cell["output_tokens"] += output_t
            cell["tool_calls"] += s.get("tool_call_count", 0) or 0
            cell["cost"] += s.get("estimated_cost_usd", 0.0) or 0.0

        # Fill gaps with zero cells
        cells = []
        cur = start
        while cur <= end:
            entry = cells_by_date.get(cur, {
                "sessions": 0, "tokens": 0, "input_tokens": 0,
                "output_tokens": 0, "tool_calls": 0, "cost": 0.0,
            })
            cells.append({"date": cur.isoformat(), **entry})
            cur += timedelta(days=1)
        return cells
    finally:
        db.close()


def quantile_buckets(values: list[float]) -> list[float]:
    """5-bucket quantile cutoffs from non-zero values."""
    nonzero = [v for v in values if v > 0]
    if not nonzero:
        return [0, 1, 2, 3, 4]
    if len(nonzero) < 4:
        m = max(nonzero)
        return [0, m * 0.25, m * 0.5, m * 0.75, m]
    qs = statistics.quantiles(nonzero, n=4)
    return [0, qs[0], qs[1], qs[2], max(nonzero)]


# ---------------------------------------------------------------------------
# Streak helpers
# ---------------------------------------------------------------------------

def compute_streaks() -> dict:
    today = datetime.utcnow().date()
    start = today - timedelta(days=730)  # 2-year lookback for best-ever
    cells = cached_cells(start, today)
    active_dates = {c["date"] for c in cells if c["sessions"] > 0}

    # Current streak: walk back from today
    current_len = 0
    cur = today
    # Allow today to be empty (give user the day)
    if today.isoformat() not in active_dates:
        cur = today - timedelta(days=1)
    while cur.isoformat() in active_dates:
        current_len += 1
        cur -= timedelta(days=1)

    current_start = (cur + timedelta(days=1)).isoformat() if current_len > 0 else today.isoformat()
    active_today = today.isoformat() in active_dates

    # Best streak
    sorted_dates = sorted(active_dates)
    best_len = 0
    best_start = None
    best_end = None
    if sorted_dates:
        run_len = 1
        run_start = sorted_dates[0]
        for i in range(1, len(sorted_dates)):
            prev = datetime.strptime(sorted_dates[i - 1], "%Y-%m-%d").date()
            curr = datetime.strptime(sorted_dates[i], "%Y-%m-%d").date()
            if (curr - prev).days == 1:
                run_len += 1
            else:
                if run_len > best_len:
                    best_len = run_len
                    best_start = run_start
                    best_end = sorted_dates[i - 1]
                run_len = 1
                run_start = sorted_dates[i]
        if run_len > best_len:
            best_len = run_len
            best_start = run_start
            best_end = sorted_dates[-1]

    return {
        "current": {
            "length": current_len,
            "started": current_start,
            "active_today": active_today,
        },
        "best": {
            "length": best_len,
            "started": best_start,
            "ended": best_end,
        },
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

METRIC_FIELDS = {
    "sessions": "sessions",
    "tokens": "tokens",
    "input_tokens": "input_tokens",
    "output_tokens": "output_tokens",
    "tool_calls": "tool_calls",
    "cost": "cost",
}


@router.get("/ping")
async def ping():
    return {"ok": True}


@router.get("/data")
async def get_data(
    metric: str = "sessions",
    period: Literal["year", "month"] = "year",
    date: str | None = None,
):
    if metric not in METRIC_FIELDS:
        raise HTTPException(400, f"Unknown metric: {metric}")
    try:
        anchor = (
            datetime.strptime(date, "%Y-%m-%d").date()
            if date else datetime.utcnow().date()
        )
    except ValueError:
        raise HTTPException(400, f"Invalid date: {date}")

    if period == "year":
        end = anchor
        # Walk back to the nearest Monday
        start = end - timedelta(days=52 * 7 + anchor.weekday())
    else:
        start = anchor.replace(day=1)
        next_month = start.replace(day=28) + timedelta(days=4)
        end = next_month - timedelta(days=next_month.day)

    cells = cached_cells(start, end)
    field = METRIC_FIELDS[metric]
    values = [c[field] for c in cells]
    for c in cells:
        c["value"] = c[field]

    return {
        "metric": metric,
        "period": period,
        "anchor": anchor.isoformat(),
        "range_start": start.isoformat(),
        "range_end": end.isoformat(),
        "cells": cells,
        "max": max(values) if values else 0,
        "total": sum(values),
        "daily_avg": round(sum(values) / max(len(values), 1), 2),
        "active_days": sum(1 for v in values if v > 0),
        "buckets": quantile_buckets(values),
    }


@router.get("/day/{date_str}")
async def get_day(date_str: str):
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, f"Invalid date: {date_str}")

    cells = cached_cells(d, d)
    cell = cells[0] if cells else {
        "sessions": 0, "tokens": 0, "input_tokens": 0,
        "output_tokens": 0, "tool_calls": 0, "cost": 0.0,
    }

    # Get session list for the day
    sessions_list = []
    hour_counts = defaultdict(int)
    models: dict[str, dict] = {}

    try:
        from hermes_state import SessionDB
        db = SessionDB()
        try:
            all_sessions = db.search_sessions(limit=99999)
            for s in all_sessions:
                ts_raw = s.get("started_at")
                if ts_raw is None:
                    continue
                try:
                    ts = datetime.fromtimestamp(float(ts_raw))
                except (ValueError, OSError, OverflowError):
                    continue
                if ts.date() != d:
                    continue
                hour_counts[ts.hour] += 1
                model_name = s.get("model", "unknown") or "unknown"
                if model_name not in models:
                    models[model_name] = {"name": model_name, "sessions": 0, "tokens": 0}
                models[model_name]["sessions"] += 1
                input_t = s.get("input_tokens", 0) or 0
                output_t = s.get("output_tokens", 0) or 0
                models[model_name]["tokens"] += input_t + output_t

                sessions_list.append({
                    "id": s.get("id", ""),
                    "title": s.get("title") or s.get("summary") or "Untitled session",
                    "model": model_name,
                    "started_at": ts.isoformat() + "Z",
                    "message_count": s.get("message_count", 0) or 0,
                    "tokens": input_t + output_t,
                    "cost": s.get("estimated_cost_usd", 0.0) or 0.0,
                    "platform": s.get("source", "cli") or "cli",
                })
        finally:
            db.close()
    except ImportError:
        pass

    sessions_list.sort(key=lambda x: x["started_at"])
    hour_breakdown = [{"hour": h, "sessions": hour_counts[h]} for h in range(24)]

    return {
        "date": date_str,
        "summary": {
            "sessions": cell["sessions"],
            "tokens": cell["tokens"],
            "input_tokens": cell["input_tokens"],
            "output_tokens": cell["output_tokens"],
            "tool_calls": cell["tool_calls"],
            "cost": cell["cost"],
        },
        "hour_breakdown": hour_breakdown,
        "models_used": list(models.values()),
        "sessions": sessions_list,
    }


@router.get("/streaks")
async def get_streaks():
    return compute_streaks()


@router.get("/summary")
async def get_summary():
    today = datetime.utcnow().date()
    start = today - timedelta(days=730)
    cells = cached_cells(start, today)
    values = [c["sessions"] for c in cells]
    active = [(c["date"], c["sessions"]) for c in cells if c["sessions"] > 0]

    busiest = max(active, key=lambda x: x[1]) if active else (today.isoformat(), 0)
    streaks = compute_streaks()
    first_date = active[0][0] if active else today.isoformat()
    first = datetime.strptime(first_date, "%Y-%m-%d").date()

    return {
        "total_sessions": sum(values),
        "active_days": len(active),
        "longest_streak": streaks["best"]["length"],
        "current_streak": streaks["current"]["length"],
        "busiest_day": {"date": busiest[0], "value": busiest[1]},
        "first_session": first_date,
        "days_since_first": (today - first).days,
    }


@router.get("/header-strip")
async def get_header_strip():
    today = datetime.utcnow().date()
    # 84 cells = 12 weeks, ending today, aligned to Monday
    end = today
    start = end - timedelta(days=83)
    cells = cached_cells(start, end)
    # Keep only date + value for compactness
    values = [c["sessions"] for c in cells]
    stripped = [{"date": c["date"], "value": c["sessions"]} for c in cells]
    streaks = compute_streaks()

    return {
        "cells": stripped,
        "buckets": quantile_buckets(values),
        "current_streak": streaks["current"]["length"],
    }

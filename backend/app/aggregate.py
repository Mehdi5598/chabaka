import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .isp import CANONICAL_ISPS, OTHER
from .models import Measurement, Report

# Tuning knobs (override via env). The defaults are deliberately conservative
# so a handful of reports never trips a false "outage".
WINDOW_MIN = int(os.getenv("WINDOW_MIN", "15"))
BASELINE_HOURS = int(os.getenv("BASELINE_HOURS", "24"))
MIN_REPORTS = int(os.getenv("MIN_REPORTS", "3"))
OUTAGE_RATIO = float(os.getenv("OUTAGE_RATIO", "3.0"))
DEGRADED_RATIO = float(os.getenv("DEGRADED_RATIO", "1.8"))
OUTAGE_ABS = int(os.getenv("OUTAGE_ABS", "10"))
DEGRADED_ABS = int(os.getenv("DEGRADED_ABS", "4"))
MIN_MEAS = int(os.getenv("MIN_MEAS", "4"))

_SEVERITY = {"no_data": -1, "operational": 0, "degraded": 1, "outage": 2}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _median(xs):
    s = sorted(xs)
    n = len(s)
    if n == 0:
        return None
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2


def _report_status(now_count: int, baseline: float) -> str:
    if now_count < MIN_REPORTS:
        return "operational"
    if baseline < 1:  # not enough history -> use absolute counts
        if now_count >= OUTAGE_ABS:
            return "outage"
        if now_count >= DEGRADED_ABS:
            return "degraded"
        return "operational"
    ratio = now_count / baseline
    if ratio >= OUTAGE_RATIO:
        return "outage"
    if ratio >= DEGRADED_RATIO:
        return "degraded"
    return "operational"


def _meas_status(reach_rate: float, dns_rate: float, n: int):
    if n < MIN_MEAS:
        return None
    if reach_rate < 0.40:
        return "outage"
    if reach_rate < 0.75 or dns_rate < 0.60:
        return "degraded"
    return "operational"


def _worst(*statuses) -> str:
    valid = [s for s in statuses if s]
    if not valid:
        return "operational"
    return max(valid, key=lambda s: _SEVERITY.get(s, 0))


def isp_status(db: Session) -> dict:
    now = _now()
    win_start = now - timedelta(minutes=WINDOW_MIN)
    base_start = now - timedelta(hours=BASELINE_HOURS)
    n_windows = max((BASELINE_HOURS * 60) / WINDOW_MIN - 1, 1)

    recent = dict(
        db.execute(
            select(Report.isp, func.count())
            .where(Report.created_at >= win_start)
            .group_by(Report.isp)
        ).all()
    )
    baseline = dict(
        db.execute(
            select(Report.isp, func.count())
            .where(Report.created_at >= base_start, Report.created_at < win_start)
            .group_by(Report.isp)
        ).all()
    )

    meas_rows = db.execute(
        select(Measurement.isp, Measurement.latency_ms, Measurement.dns_ok, Measurement.reachable)
        .where(Measurement.created_at >= win_start)
    ).all()
    by_isp: dict[str, dict] = {}
    for isp, lat, dns, reach in meas_rows:
        bucket = by_isp.setdefault(isp, {"lat": [], "dns": [], "reach": []})
        if lat is not None:
            bucket["lat"].append(lat)
        bucket["dns"].append(1 if dns else 0)
        bucket["reach"].append(1 if reach else 0)

    out = []
    for isp in [*CANONICAL_ISPS, OTHER]:
        now_count = int(recent.get(isp, 0))
        base_per_window = baseline.get(isp, 0) / n_windows
        m = by_isp.get(isp, {"lat": [], "dns": [], "reach": []})
        n_meas = len(m["reach"])
        reach_rate = sum(m["reach"]) / n_meas if n_meas else None
        dns_rate = sum(m["dns"]) / n_meas if n_meas else None
        lat_med = _median(m["lat"])

        rs = _report_status(now_count, base_per_window)
        ms = (
            _meas_status(reach_rate or 0.0, dns_rate if dns_rate is not None else 1.0, n_meas)
            if n_meas
            else None
        )
        status = _worst(rs, ms)
        if now_count == 0 and n_meas == 0:
            status = "no_data"

        out.append(
            {
                "isp": isp,
                "status": status,
                "reports_recent": now_count,
                "baseline_per_window": round(base_per_window, 2),
                "latency_ms_median": round(lat_med, 1) if lat_med is not None else None,
                "reachable_rate": round(reach_rate, 2) if reach_rate is not None else None,
                "measurements_recent": n_meas,
            }
        )

    return {"window_minutes": WINDOW_MIN, "updated_at": now.isoformat(), "isps": out}


def wilaya_status(db: Session) -> dict:
    now = _now()
    win_start = now - timedelta(minutes=WINDOW_MIN)

    reports = dict(
        db.execute(
            select(Report.wilaya, func.count())
            .where(Report.created_at >= win_start, Report.wilaya.isnot(None))
            .group_by(Report.wilaya)
        ).all()
    )
    reach_rows = db.execute(
        select(Measurement.wilaya, Measurement.reachable)
        .where(Measurement.created_at >= win_start, Measurement.wilaya.isnot(None))
    ).all()
    reach: dict[str, list[int]] = {}
    for w, r in reach_rows:
        reach.setdefault(w, []).append(1 if r else 0)

    out: dict[str, dict] = {}
    for w, count in reports.items():
        count = int(count)
        rr = reach.get(w)
        reach_rate = sum(rr) / len(rr) if rr else None
        level = "high" if count >= 8 else "medium" if count >= 4 else "low"
        if reach_rate is not None and reach_rate < 0.40 and len(rr) >= 3:
            level = "high"
        out[w] = {
            "level": level,
            "reports": count,
            "reachable_rate": round(reach_rate, 2) if reach_rate is not None else None,
        }

    # Wilayas with only failing measurements (no manual reports yet).
    for w, rr in reach.items():
        if w in out or len(rr) < 3:
            continue
        reach_rate = sum(rr) / len(rr)
        if reach_rate < 0.50:
            out[w] = {
                "level": "medium" if reach_rate < 0.75 else "low",
                "reports": 0,
                "reachable_rate": round(reach_rate, 2),
            }

    return {"window_minutes": WINDOW_MIN, "updated_at": now.isoformat(), "wilayas": out}


def timeline(db: Session, hours: int = 24) -> dict:
    now = _now()
    start = now - timedelta(hours=hours)
    rows = db.execute(select(Report.created_at).where(Report.created_at >= start)).all()
    buckets = [0] * hours
    for (ts,) in rows:
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        idx = int((ts - start).total_seconds() // 3600)
        if 0 <= idx < hours:
            buckets[idx] += 1
    return {"hours": hours, "start": start.isoformat(), "buckets": buckets}

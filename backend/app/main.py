import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import aggregate, ratelimit
from .db import get_db, init_db
from .isp import VALID_ISPS, client_ip, hash_ip, lookup_ip
from .models import Measurement, Report
from .schemas import IspInfo, MeasurementIn, ReportIn

REPORTS_PER_HOUR = int(os.getenv("REPORTS_PER_HOUR", "20"))
MEAS_PER_HOUR = int(os.getenv("MEAS_PER_HOUR", "60"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Algeria Internet Outage Map API", version="0.1.0", lifespan=lifespan)

_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _resolve_isp(payload_isp, ip):
    if payload_isp and payload_isp in VALID_ISPS:
        return payload_isp, None
    info = lookup_ip(ip)
    return info["isp"], info.get("asn")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/ip-info", response_model=IspInfo)
def ip_info(request: Request):
    info = lookup_ip(client_ip(request))
    return IspInfo(isp=info["isp"], asn=info.get("asn"), wilaya_guess=info.get("wilaya_guess"))


@app.post("/api/report")
def create_report(payload: ReportIn, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    h = hash_ip(ip)
    if not ratelimit.allow(f"r:{h}", REPORTS_PER_HOUR):
        return {"ok": False, "error": "rate_limited"}
    isp, asn = _resolve_isp(payload.isp, ip)
    signature = (h, isp, payload.wilaya, payload.issue_type)
    if ratelimit.is_duplicate(signature):
        return {"ok": True, "isp": isp, "deduped": True}
    db.add(Report(isp=isp, wilaya=payload.wilaya, issue_type=payload.issue_type, asn=asn, ip_hash=h))
    db.commit()
    return {"ok": True, "isp": isp}


@app.post("/api/measurement")
def create_measurement(payload: MeasurementIn, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    h = hash_ip(ip)
    if not ratelimit.allow(f"m:{h}", MEAS_PER_HOUR):
        return {"ok": False, "error": "rate_limited"}
    isp, asn = _resolve_isp(payload.isp, ip)
    db.add(
        Measurement(
            isp=isp,
            wilaya=payload.wilaya,
            latency_ms=payload.latency_ms,
            dns_ok=payload.dns_ok,
            reachable=payload.reachable,
            asn=asn,
            ip_hash=h,
        )
    )
    db.commit()
    return {"ok": True, "isp": isp}


@app.get("/api/status")
def status(db: Session = Depends(get_db)):
    return aggregate.isp_status(db)


@app.get("/api/status/wilayas")
def status_wilayas(db: Session = Depends(get_db)):
    return aggregate.wilaya_status(db)


@app.get("/api/timeline")
def timeline(hours: int = 24, db: Session = Depends(get_db)):
    return aggregate.timeline(db, max(1, min(hours, 72)))

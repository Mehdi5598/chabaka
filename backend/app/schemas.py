from typing import Literal, Optional

from pydantic import BaseModel, Field

IssueType = Literal["no_internet", "slow", "dns", "intermittent"]


class ReportIn(BaseModel):
    isp: Optional[str] = None  # if omitted, detected from the caller's IP
    wilaya: Optional[str] = None
    issue_type: IssueType


class MeasurementIn(BaseModel):
    isp: Optional[str] = None
    wilaya: Optional[str] = None
    latency_ms: Optional[float] = Field(default=None, ge=0, le=60000)
    dns_ok: bool = True
    reachable: bool = True


class IspInfo(BaseModel):
    isp: str
    asn: Optional[int] = None
    wilaya_guess: Optional[str] = None

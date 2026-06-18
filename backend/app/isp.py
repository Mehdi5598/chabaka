import hashlib
import os
import time
from typing import Optional

import httpx

from .wilayas import WILAYA_NAMES

# The four operators we track explicitly. Everything else -> "Other".
CANONICAL_ISPS = ["Algérie Télécom", "Mobilis", "Djezzy", "Ooredoo"]
OTHER = "Other"
VALID_ISPS = set(CANONICAL_ISPS) | {OTHER}

# Known ASN -> canonical ISP. Algérie Télécom's main ASN is well documented;
# add the mobile operators' ASNs here as you confirm them (e.g. via bgp.he.net)
# for more precise matching. The keyword map below is the robust fallback.
ASN_OVERRIDES = {
    36947: "Algérie Télécom",  # Telecom Algeria / Djaweb
}

# Substring -> canonical ISP, matched case-insensitively against the org string.
KEYWORD_MAP = [
    (("algerie telecom", "algérie télécom", "telecom algeria", "djaweb", "idoom"), "Algérie Télécom"),
    (("mobilis", "atm mobilis"), "Mobilis"),
    (("optimum", "djezzy", "orascom"), "Djezzy"),
    (("ooredoo", "wataniya", "nedjma"), "Ooredoo"),
]

IP_SALT = os.getenv("IP_SALT", "change-me-please")
_LOOKUP_TTL = 3600
_lookup_cache: dict[str, tuple[float, dict]] = {}


def hash_ip(ip: str) -> str:
    return hashlib.sha256(f"{IP_SALT}|{ip}".encode()).hexdigest()[:32]


def client_ip(request) -> str:
    """Real client IP, honouring the reverse proxy's forwarding headers."""
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    xri = request.headers.get("x-real-ip")
    if xri:
        return xri.strip()
    return request.client.host if request.client else "0.0.0.0"


def _is_private(ip: str) -> bool:
    return (
        ip.startswith(("10.", "192.168.", "127.", "172.16."))
        or ip in ("0.0.0.0", "::1", "")
    )


def normalize_isp(asn: Optional[int], org: str, country_code: str) -> str:
    if asn is not None and asn in ASN_OVERRIDES:
        return ASN_OVERRIDES[asn]
    low = (org or "").lower()
    for keys, name in KEYWORD_MAP:
        if any(k in low for k in keys):
            return name
    return OTHER


def _match_wilaya(*candidates: str) -> Optional[str]:
    for cand in candidates:
        if not cand:
            continue
        c = cand.strip().lower()
        for name in WILAYA_NAMES:
            if name.lower() == c:
                return name
    return None


def lookup_ip(ip: str) -> dict:
    """Best-effort {asn, org, isp, wilaya_guess} for an IP. Never raises."""
    if _is_private(ip):
        return {"asn": None, "org": "", "isp": OTHER, "wilaya_guess": None}

    now = time.time()
    cached = _lookup_cache.get(ip)
    if cached and now - cached[0] < _LOOKUP_TTL:
        return cached[1]

    result = {"asn": None, "org": "", "isp": OTHER, "wilaya_guess": None}
    try:
        # ip-api.com: free, no key, ~45 req/min. "as" looks like "AS36947 Telecom Algeria".
        resp = httpx.get(
            f"http://ip-api.com/json/{ip}",
            params={"fields": "status,countryCode,regionName,city,isp,org,as,asname"},
            timeout=4.0,
        )
        data = resp.json()
        if data.get("status") == "success":
            as_field = data.get("as", "") or ""
            asn = None
            if as_field.upper().startswith("AS"):
                num = as_field[2:].split(" ")[0]
                asn = int(num) if num.isdigit() else None
            org = " ".join(
                x for x in (data.get("isp", ""), data.get("org", ""), data.get("asname", ""), as_field) if x
            )
            result = {
                "asn": asn,
                "org": org,
                "isp": normalize_isp(asn, org, data.get("countryCode", "")),
                "wilaya_guess": _match_wilaya(data.get("regionName", ""), data.get("city", "")),
            }
    except Exception:
        pass  # network/DNS hiccup -> fall back to "Other"

    _lookup_cache[ip] = (now, result)
    return result

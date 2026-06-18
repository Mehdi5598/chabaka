# Chabaka  Algeria internet status

A crowdsourced, real-time map of internet outages and slowdowns across Algeria's
four main operators (**Algérie Télécom, Mobilis, Djezzy, Ooredoo**), broken down
by the 58 wilayas.

It does two things at once, and that's the point:

1. **Self-reports** — anyone can tap "no internet / slow / DNS / keeps dropping".
   Volume of reports is the DownDetector-style signal.
2. **Active measurement** — every visitor's browser quietly runs DNS-over-HTTPS
   and reachability probes against neutral endpoints. Real latency / DNS / reach
   numbers, not just opinions.

When reports **and** failed probes spike together for one operator, that operator
flips to *degraded* or *outage*. The visitor's operator is auto-detected from their
public IP's ASN, so reports are attributed cleanly without anyone picking from a list.

---
## screenshots

<img width="1794" height="1430" alt="image" src="https://github.com/user-attachments/assets/acabde62-b8db-4e61-96d8-878e00975e9b" />



## Quickstart

```bash
cp .env.example .env        # then edit IP_SALT
docker compose up --build
```

- App: **http://localhost:8080**
- API + interactive docs: **http://localhost:8000/docs**

That's the whole stack: Postgres + FastAPI backend + React/Leaflet frontend.

## Dev mode (hot reload)

```bash
# backend
cd backend
pip install -r requirements.txt
export DATABASE_URL=postgresql+psycopg://outage:outage@localhost:5432/outage  # or run just the db service
uvicorn app.main:app --reload --port 8000

# frontend (separate terminal)
cd frontend
npm install
npm run dev        # http://localhost:5173, proxies /api -> :8000
```

---

## Architecture

```
 Browser ──► nginx (frontend) ──► FastAPI (backend) ──► Postgres
   │              static SPA          /api/*               reports
   │                                                       measurements
   └─ in-browser probes (DoH + reachability) ──► POST /api/measurement
```

**Backend** (`backend/app/`)
- `main.py` — routes
- `isp.py` — client-IP extraction, salted IP hashing, IP→ASN/org lookup
  (via ip-api.com, free, no key), normalization to a canonical operator
- `aggregate.py` — spike detection (recent rate vs 24h baseline) + per-wilaya
  map levels + 24h timeline
- `ratelimit.py` — in-memory per-IP rate limiting + duplicate suppression
- `models.py` / `db.py` — SQLAlchemy 2.0

**Frontend** (`frontend/src/`)
- `App.jsx` — orchestration + 30s auto-refresh
- `connectivity.js` — the in-browser DoH/reachability check
- `components/AlgeriaMap.jsx` — Leaflet choropleth (tooltips show Tifinagh names)
- `components/StatusBar.jsx`, `ReportPanel.jsx`, `ConnectivityCard.jsx`

### API

| Method | Path                  | Purpose                              |
|-------:|-----------------------|--------------------------------------|
| GET    | `/api/health`         | liveness                             |
| GET    | `/api/ip-info`        | caller's detected operator + wilaya  |
| POST   | `/api/report`         | submit a problem report              |
| POST   | `/api/measurement`    | submit an in-browser probe result    |
| GET    | `/api/status`         | per-operator status                  |
| GET    | `/api/status/wilayas` | per-wilaya map levels                |
| GET    | `/api/timeline`       | hourly report counts (last N hours)  |

---

## Tuning the spike detector

All knobs are env vars (see `.env.example` / `aggregate.py`). Defaults are
deliberately conservative so a handful of reports never fakes an outage:

| Var             | Default | Meaning                                              |
|-----------------|--------:|------------------------------------------------------|
| `WINDOW_MIN`    | 15      | "right now" window in minutes                        |
| `OUTAGE_RATIO`  | 3.0     | reports/baseline ratio that means outage             |
| `DEGRADED_RATIO`| 1.8     | ratio that means degraded                            |
| `OUTAGE_ABS`    | 10      | absolute reports = outage (when no baseline yet)     |
| `DEGRADED_ABS`  | 4       | absolute reports = degraded                          |
| `MIN_MEAS`      | 4       | min probes before measurement status counts          |

---

## Privacy

Raw IPs are **never** stored. They're used in-memory only to look up the operator
ASN, then salted-and-hashed (`IP_SALT`) for rate-limiting and dedup. Set a strong,
secret `IP_SALT`.

---


Map data: [fr33dz/Algeria-geojson](https://github.com/fr33dz/Algeria-geojson),
simplified. Operator detection via ip-api.com.

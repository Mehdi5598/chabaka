import { useEffect, useRef, useState, useCallback } from 'react';
import { STATUS_META, SEVERITY } from './constants';
import { getStatus, getWilayaStatus, getTimeline, getIpInfo, postReport, postMeasurement } from './api';
import { runConnectivityCheck } from './connectivity';
import Sparkline from './components/Sparkline';
import StatusBar from './components/StatusBar';
import AlgeriaMap from './components/AlgeriaMap';
import ReportPanel from './components/ReportPanel';
import ConnectivityCard from './components/ConnectivityCard';

function Glyph() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" className="brand__glyph" aria-hidden="true">
      <circle cx="15" cy="20.5" r="3" fill="#1ea672" />
      <path d="M9.5 17a7 7 0 0 1 11 0" stroke="#1ea672" strokeWidth="2.1" strokeLinecap="round" opacity="0.85" />
      <path d="M6.5 13.5a11 11 0 0 1 17 0" stroke="#1ea672" strokeWidth="2.1" strokeLinecap="round" opacity="0.5" />
      <path d="M3.5 10a15 15 0 0 1 23 0" stroke="#1ea672" strokeWidth="2.1" strokeLinecap="round" opacity="0.28" />
    </svg>
  );
}

function worstStatus(isps) {
  if (!isps || !isps.length) return { label: 'Awaiting data', color: 'var(--nodata)' };
  let w = 'no_data';
  for (const r of isps) if ((SEVERITY[r.status] ?? -1) > (SEVERITY[w] ?? -1)) w = r.status;
  if (w === 'no_data') return { label: 'Awaiting data', color: 'var(--nodata)' };
  return STATUS_META[w];
}

const byStatus = (isps, target) => (isps || []).filter((r) => r.status === target).map((r) => r.isp);

function joinNames(names) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

function topWilaya(ws) {
  if (!ws) return null;
  let best = null;
  let max = 0;
  for (const [name, v] of Object.entries(ws)) {
    if ((v.reports || 0) > max) {
      max = v.reports;
      best = name;
    }
  }
  return best;
}

const LEGEND = [
  { c: '#16241d', label: 'Quiet' },
  { c: '#e6a92b', o: 0.3, label: 'A few reports' },
  { c: '#e6a92b', label: 'Several issues' },
  { c: '#e5533c', label: 'Outage' },
];

export default function App() {
  const [status, setStatus] = useState(null);
  const [wilayaStatus, setWilayaStatus] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [ipInfo, setIpInfo] = useState(null);

  const [isp, setIsp] = useState('Algérie Télécom');
  const [wilaya, setWilaya] = useState('');
  const wilayaRef = useRef('');
  wilayaRef.current = wilaya;

  const [conn, setConn] = useState(null);
  const [connState, setConnState] = useState('idle');
  const [reportBusy, setReportBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [nowTick, setNowTick] = useState(Date.now());

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const refresh = useCallback(async () => {
    const [s, w, t] = await Promise.allSettled([getStatus(), getWilayaStatus(), getTimeline(24)]);
    if (s.status === 'fulfilled') setStatus(s.value);
    if (w.status === 'fulfilled') setWilayaStatus(w.value);
    if (t.status === 'fulfilled') setTimeline(t.value);
    setLastUpdated(Date.now());
  }, []);

  const runCheck = useCallback(async () => {
    setConnState('running');
    try {
      const r = await runConnectivityCheck();
      setConn(r);
      setConnState('done');
      postMeasurement({
        wilaya: wilayaRef.current || null,
        latency_ms: r.latency_ms,
        dns_ok: r.dns_ok,
        reachable: r.reachable,
      })
        .then(() => refresh())
        .catch(() => {});
    } catch {
      setConnState('done');
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
    getIpInfo()
      .then((info) => {
        setIpInfo(info);
        if (info?.isp && info.isp !== 'Other') setIsp(info.isp);
        if (info?.wilaya_guess) setWilaya(info.wilaya_guess);
      })
      .catch(() => {});
    runCheck();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function submitReport(issueKey) {
    setReportBusy(true);
    try {
      const res = await postReport({ isp, wilaya: wilaya || null, issue_type: issueKey });
      if (res.ok) {
        showToast(res.deduped ? 'Already counted — thanks' : 'Report sent');
        refresh();
      } else if (res.error === 'rate_limited') {
        showToast('Easy there — too many reports for now');
      }
    } catch {
      showToast('Could not send — try again');
    } finally {
      setReportBusy(false);
    }
  }

  const worst = worstStatus(status?.isps);
  const win = status?.window_minutes ?? 15;
  const secsAgo = Math.max(0, Math.round((nowTick - lastUpdated) / 1000));
  const ispLabel = ipInfo?.isp && ipInfo.isp !== 'Other' ? ipInfo.isp : null;

  const outs = byStatus(status?.isps, 'outage');
  const degs = byStatus(status?.isps, 'degraded');
  const tw = topWilaya(wilayaStatus?.wilayas);

  let title;
  let sub;
  if (outs.length) {
    title = (
      <h1 className="hero__title">
        <span className="down">{joinNames(outs)}</span> {outs.length > 1 ? 'are' : 'is'} down for many users right now
      </h1>
    );
    sub = tw ? `Most reports are coming from ${tw}.` : 'Reports are spiking right now.';
  } else if (degs.length) {
    title = (
      <h1 className="hero__title">
        <span className="deg">{joinNames(degs)}</span> {degs.length > 1 ? 'are' : 'is'} having problems
      </h1>
    );
    sub = tw ? `Slowdowns reported around ${tw}.` : 'Some users are seeing slowdowns.';
  } else {
    title = (
      <h1 className="hero__title">
        All networks are <span className="ok">running normally</span>
      </h1>
    );
    sub = 'Live from community reports and in-browser checks across the 58 wilayas.';
  }

  return (
    <>
      <header className="header">
        <div className="header__inner">
          <div className="brand">
            <Glyph />
            <div className="brand__text">
              <div className="brand__name">
                CHABAKA
                <span className="ber" dir="rtl" style={{ marginLeft: 8 }}>
                  شبكة
                </span>
              </div>
              <div className="brand__sub">Algeria internet status</div>
            </div>
          </div>
          <div className="live">
            <span className="live__updated">updated {secsAgo}s ago</span>
            <span className="pill" style={{ color: worst.color }}>
              <span className="dot dot--live" style={{ background: worst.color, color: worst.color }} />
              {worst.label}
            </span>
          </div>
        </div>
      </header>

      <section className="hero wrap">
        <div className="hero__head">
          <div className="hero__eyebrow">Live · {win} min window</div>
          {title}
          <p className="hero__sub">{sub}</p>
        </div>
        <div className="spark">
          <div className="spark__label">Reports · last 24h</div>
          <Sparkline data={timeline?.buckets || []} />
        </div>
      </section>

      <main className="wrap">
        <div className="grid">
          <div className="card map-card">
            <div className="card__head">
              <span className="card__title">Live map</span>
              <span className="card__hint">hover a wilaya</span>
            </div>
            <div className="card__body">
              <AlgeriaMap wilayaStatus={wilayaStatus?.wilayas} />
            </div>
            <div className="legend">
              {LEGEND.map((l) => (
                <span className="legend__item" key={l.label}>
                  <span className="legend__swatch" style={{ background: l.c, opacity: l.o ?? 0.85 }} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>

          <StatusBar status={status} />
        </div>

        <div className="grid grid--split">
          <ReportPanel
            ipInfo={ipInfo}
            isp={isp}
            setIsp={setIsp}
            wilaya={wilaya}
            setWilaya={setWilaya}
            onSubmit={submitReport}
            busy={reportBusy}
          />
          <ConnectivityCard conn={conn} state={connState} ispLabel={ispLabel} onRun={runCheck} />
        </div>

        <footer className="foot section-foot">
          <div>
            <strong>How it works.</strong> Chabaka combines what people report with live network probes your
            browser runs against neutral endpoints. When reports and failed checks spike for one operator, it
            surfaces here within minutes.
          </div>
          <div className="foot__row">
            <span>Operators tracked: Algérie Télécom · Mobilis · Djezzy · Ooredoo</span>
            <span>Visitor IPs are salted-and-hashed, never stored raw.</span>
            <span>Map data: fr33dz/Algeria-geojson.</span>
          </div>
        </footer>
      </main>

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}

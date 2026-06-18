const VERDICT = {
  good: { text: 'Connected', color: 'var(--ok)' },
  weak: { text: 'Unstable', color: 'var(--degraded)' },
  down: { text: 'No connection', color: 'var(--outage)' },
};

function verdictOf(conn) {
  if (!conn) return null;
  if (!conn.reachable) return VERDICT.down;
  if (!conn.dns_ok || (conn.latency_ms != null && conn.latency_ms > 600)) return VERDICT.weak;
  return VERDICT.good;
}

export default function ConnectivityCard({ conn, state, ispLabel, onRun }) {
  const v = verdictOf(conn);
  const running = state === 'running';

  return (
    <div className="card">
      <div className="card__head">
        <span className="card__title">Your connection</span>
        <span className="card__hint">measured in your browser</span>
      </div>
      <div className="card__body">
        {running && (
          <div className="conn-head">
            <span className="spin" />
            <span className="conn-isp">Testing your connection…</span>
          </div>
        )}

        {!running && v && (
          <>
            <div className="conn-head">
              <span className="conn-verdict" style={{ color: v.color }}>
                {v.text}
              </span>
              {ispLabel && <span className="conn-isp">on {ispLabel}</span>}
            </div>

            <div className="conn-metrics">
              <div className="conn-metric">
                <div className="conn-metric__v">{conn.latency_ms != null ? conn.latency_ms : '—'}</div>
                <div className="conn-metric__k">latency (ms)</div>
              </div>
              <div className="conn-metric">
                <div className="conn-metric__v" style={{ color: conn.dns_ok ? 'var(--ok)' : 'var(--outage)' }}>
                  {conn.dns_ok ? 'OK' : 'Fail'}
                </div>
                <div className="conn-metric__k">DNS</div>
              </div>
              <div className="conn-metric">
                <div className="conn-metric__v" style={{ color: conn.reachable ? 'var(--ok)' : 'var(--outage)' }}>
                  {conn.reachable ? 'Yes' : 'No'}
                </div>
                <div className="conn-metric__k">reachable</div>
              </div>
            </div>

            <div className="probe-list">
              {conn.probes.map((p) => (
                <div className="probe" key={p.name}>
                  <span>{p.name}</span>
                  <span className="probe__ms" style={{ color: p.ok ? 'var(--text)' : 'var(--outage)' }}>
                    {p.ok ? (p.ms != null ? `${p.ms} ms` : 'ok') : 'timeout'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <button className="btn btn--ghost" onClick={onRun} disabled={running} style={{ marginTop: 16 }}>
          {running ? 'Testing…' : conn ? 'Run again' : 'Run check'}
        </button>

        <div className="shared-note">
          <span className="dot" style={{ background: 'var(--brand)' }} />
          Shared anonymously to improve the map. No personal data, no raw IP stored.
        </div>
      </div>
    </div>
  );
}

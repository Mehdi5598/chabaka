import { CANONICAL_ISPS, STATUS_META } from '../constants';

function fmtLatency(ms) {
  if (ms == null) return '—';
  return `${ms} ms`;
}
function fmtReach(rate) {
  if (rate == null) return '—';
  return `${Math.round(rate * 100)}%`;
}

function IspRow({ row, index }) {
  const meta = STATUS_META[row.status] || STATUS_META.no_data;
  return (
    <div className="isp" style={{ borderLeftColor: meta.color, animationDelay: `${index * 60}ms` }}>
      <div className="isp__name">{row.isp}</div>
      <div className="isp__status" style={{ color: meta.color }}>
        <span className="dot" style={{ background: meta.color }} />
        {meta.label}
      </div>
      <div className="isp__metrics">
        <div className="metric">
          <span className="metric__v">{row.reports_recent}</span>
          <span className="metric__k">reports</span>
        </div>
        <div className="metric">
          <span className="metric__v">{fmtLatency(row.latency_ms_median)}</span>
          <span className="metric__k">latency</span>
        </div>
        <div className="metric">
          <span className="metric__v">{fmtReach(row.reachable_rate)}</span>
          <span className="metric__k">reachable</span>
        </div>
      </div>
    </div>
  );
}

export default function StatusBar({ status }) {
  const rows = status?.isps || [];
  const byName = Object.fromEntries(rows.map((r) => [r.isp, r]));
  // Always render the four majors in a stable order; append "Other" only if it has signal.
  const ordered = CANONICAL_ISPS.map(
    (name) => byName[name] || { isp: name, status: 'no_data', reports_recent: 0 },
  );
  const other = byName['Other'];
  if (other && (other.reports_recent > 0 || other.measurements_recent > 0)) ordered.push(other);

  return (
    <div className="card">
      <div className="card__head">
        <span className="card__title">Operators</span>
        <span className="card__hint">last {status?.window_minutes ?? 15} min</span>
      </div>
      <div className="card__body">
        <div className="isp-list">
          {ordered.map((row, i) => (
            <IspRow key={row.isp} row={row} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

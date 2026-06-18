import { useState } from 'react';
import { ISP_OPTIONS, ISSUE_TYPES } from '../constants';
import { WILAYAS } from '../data/wilayas';

export default function ReportPanel({ ipInfo, isp, setIsp, wilaya, setWilaya, onSubmit, busy }) {
  const [issue, setIssue] = useState(null);

  const detected = ipInfo?.isp && ipInfo.isp !== 'Other' ? ipInfo.isp : null;

  async function submit() {
    if (!issue) return;
    await onSubmit(issue);
    setIssue(null);
  }

  return (
    <div className="card">
      <div className="card__head">
        <span className="card__title">Report a problem</span>
        <span className="card__hint">takes 5 seconds</span>
      </div>
      <div className="card__body">
        <div className="field">
          <label className="field__label">Your operator</label>
          <div className="chip-row">
            {detected && (
              <span className="chip">
                <span className="dot" style={{ background: 'var(--brand)' }} />
                detected
              </span>
            )}
            <select className="select" value={isp} onChange={(e) => setIsp(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
              {ISP_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label className="field__label">Wilaya</label>
          <select className="select" value={wilaya} onChange={(e) => setWilaya(e.target.value)}>
            <option value="">Select your wilaya…</option>
            {WILAYAS.map((w) => (
              <option key={w.code} value={w.name}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field__label">What's happening?</label>
          <div className="issue-grid">
            {ISSUE_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                className="btn-issue"
                aria-pressed={issue === t.key}
                onClick={() => setIssue(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <button className="btn" onClick={submit} disabled={!issue || busy}>
          {busy ? <span className="spin" /> : 'Send report'}
        </button>
      </div>
    </div>
  );
}

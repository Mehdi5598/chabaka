export const CANONICAL_ISPS = ['Algérie Télécom', 'Mobilis', 'Djezzy', 'Ooredoo'];
export const ISP_OPTIONS = [...CANONICAL_ISPS, 'Other'];

export const ISSUE_TYPES = [
  { key: 'no_internet', label: 'No internet' },
  { key: 'slow', label: 'Slow' },
  { key: 'dns', label: 'DNS issues' },
  { key: 'intermittent', label: 'Keeps dropping' },
];

export const STATUS_META = {
  operational: { label: 'Operational', color: 'var(--ok)' },
  degraded: { label: 'Degraded', color: 'var(--degraded)' },
  outage: { label: 'Outage', color: 'var(--outage)' },
  no_data: { label: 'No signal', color: 'var(--nodata)' },
};

export const SEVERITY = { no_data: -1, operational: 0, degraded: 1, outage: 2 };

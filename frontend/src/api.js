const BASE = import.meta.env.VITE_API_BASE || '/api';

async function req(path, opts) {
  const res = await fetch(BASE + path, {
    headers: { 'content-type': 'application/json' },
    ...opts,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const getStatus = () => req('/status');
export const getWilayaStatus = () => req('/status/wilayas');
export const getIpInfo = () => req('/ip-info');
export const getTimeline = (hours = 24) => req(`/timeline?hours=${hours}`);
export const postReport = (body) => req('/report', { method: 'POST', body: JSON.stringify(body) });
export const postMeasurement = (body) =>
  req('/measurement', { method: 'POST', body: JSON.stringify(body) });

// Runs entirely in the visitor's browser. Measures real DNS-over-HTTPS latency
// and reachability against neutral endpoints, then returns an anonymized result.
const TIMEOUT_MS = 5000;

function timedFetch(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const start = performance.now();
  return fetch(url, { signal: ctrl.signal, ...opts })
    .then((res) => {
      clearTimeout(timer);
      return { ok: true, ms: performance.now() - start, res };
    })
    .catch(() => {
      clearTimeout(timer);
      return { ok: false, ms: null, res: null };
    });
}

async function dohProbe(url, hasAnswer) {
  const r = await timedFetch(url, { headers: { accept: 'application/dns-json' }, cache: 'no-store' });
  if (!r.ok) return { ok: false, ms: null, resolved: false };
  let resolved = false;
  try {
    resolved = hasAnswer(await r.res.json());
  } catch {
    resolved = false;
  }
  return { ok: true, ms: r.ms, resolved };
}

const PROBE_LABELS = ['Cloudflare DNS', 'Google DNS', 'Google reachability', 'Cloudflare reachability'];

export async function runConnectivityCheck() {
  const results = await Promise.all([
    dohProbe(
      'https://cloudflare-dns.com/dns-query?name=cloudflare.com&type=A',
      (j) => Array.isArray(j.Answer) && j.Answer.length > 0,
    ),
    dohProbe(
      'https://dns.google/resolve?name=google.com&type=A',
      (j) => Array.isArray(j.Answer) && j.Answer.length > 0,
    ),
    timedFetch('https://www.google.com/generate_204', { mode: 'no-cors', cache: 'no-store' }),
    timedFetch('https://cloudflare.com/cdn-cgi/trace', { mode: 'no-cors', cache: 'no-store' }),
  ]);

  const times = results.filter((p) => p.ok && p.ms != null).map((p) => p.ms);
  const median = times.length
    ? [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)]
    : null;

  const dnsOk = results.slice(0, 2).some((p) => p.resolved);
  const reachable = results.some((p) => p.ok);

  return {
    latency_ms: median != null ? Math.round(median) : null,
    dns_ok: dnsOk,
    reachable,
    probes: results.map((p, i) => ({
      name: PROBE_LABELS[i],
      ok: p.ok,
      ms: p.ms != null ? Math.round(p.ms) : null,
    })),
  };
}

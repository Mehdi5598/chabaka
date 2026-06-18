import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import { WILAYAS } from '../data/wilayas';

// name -> { ber, code } for tooltip enrichment
const NAME_INFO = Object.fromEntries(WILAYAS.map((w) => [w.name, { ber: w.name_ber, code: w.code }]));

const FILL = {
  high: { fillColor: '#e5533c', fillOpacity: 0.72, color: '#e5533c', weight: 1.2 },
  medium: { fillColor: '#e6a92b', fillOpacity: 0.6, color: '#e6a92b', weight: 1 },
  low: { fillColor: '#e6a92b', fillOpacity: 0.3, color: '#c9a23a', weight: 1 },
  none: { fillColor: '#16241d', fillOpacity: 0.4, color: '#2b5644', weight: 0.8 },
};

function levelLabel(level) {
  if (level === 'high') return 'Outage reports';
  if (level === 'medium') return 'Several issues';
  if (level === 'low') return 'A few reports';
  return 'No reports';
}

export default function AlgeriaMap({ wilayaStatus }) {
  const [geo, setGeo] = useState(null);
  const statusRef = useRef(wilayaStatus || {});
  statusRef.current = wilayaStatus || {};

  useEffect(() => {
    let alive = true;
    fetch('/wilayas.geojson')
      .then((r) => r.json())
      .then((d) => alive && setGeo(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  function styleFn(feature) {
    const st = statusRef.current[feature.properties.name];
    const base = FILL_for(st?.level);
    return { ...base, opacity: 0.55 };
  }

  function FILL_for(level) {
    return FILL[level] || FILL.none;
  }

  function onEach(feature, layer) {
    const name = feature.properties.name;
    const info = NAME_INFO[name] || {};
    const st = statusRef.current[name];
    const reports = st?.reports ?? 0;
    const reach = st?.reachable_rate != null ? ` · ${Math.round(st.reachable_rate * 100)}% reachable` : '';
    layer.bindTooltip(
      `<div class="wil-tip__name">${name}<span class="wil-tip__ber">${info.ber || ''}</span></div>` +
        `<div class="wil-tip__row">${levelLabel(st?.level)} · ${reports} report${reports === 1 ? '' : 's'}${reach}</div>`,
      { sticky: true, className: 'wil-tip', direction: 'top', opacity: 1 },
    );
    layer.on({
      mouseover: (e) => e.target.setStyle({ weight: 2.4, color: '#1ea672' }),
      mouseout: (e) => e.target.setStyle(styleFn(feature)),
    });
  }

  // changing key on data update forces a re-style of all features
  const version = wilayaStatus ? Object.keys(wilayaStatus).length + ':' + (geo ? '1' : '0') : '0';

  return (
    <MapContainer
      className="map-canvas"
      center={[28.2, 2.8]}
      zoom={5}
      minZoom={4}
      maxZoom={9}
      scrollWheelZoom={false}
      worldCopyJump={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
      />
      {geo && <GeoJSON key={version} data={geo} style={styleFn} onEachFeature={onEach} />}
    </MapContainer>
  );
}

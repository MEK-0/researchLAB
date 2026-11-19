// Sunucu istemcisi: /events (SSE) ve /api uçları.

// Canlı olay akışı. Sayfa yenilenince son oturumun olayları (en fazla replay) sessizce yüklenir.
export function connectEvents({ replay = 300, onOpen, onEvent }) {
  if (!window.EventSource) return null;
  const es = new EventSource(`/events?replay=${replay}`);
  es.onopen = () => onOpen && onOpen();
  es.onmessage = m => { try { onEvent(JSON.parse(m.data)); } catch (_) { /* bozuk satır */ } };
  return es;
}

export async function getJSON(path) {
  const r = await fetch(path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

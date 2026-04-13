const SESSION_KEY = 'dooh_chat_session_id';

export function getOrCreateSessionId() {
  if (typeof window === 'undefined') return null;
  let id = localStorage.getItem(SESSION_KEY);
  if (id) return id;
  id = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, id);
  return id;
}

export function trackEvent(eventType, eventData) {
  try {
    const sessionId = getOrCreateSessionId();
    if (!sessionId) return;
    const body = JSON.stringify({
      sessionId,
      eventType,
      eventData: eventData || undefined,
      pageUrl: window.location.pathname,
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/track', { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {});
    }
  } catch { /* fire and forget */ }
}

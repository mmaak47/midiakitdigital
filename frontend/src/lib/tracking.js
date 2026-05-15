/**
 * tracking.js
 * Event tracking with LGPD consent gating.
 * Analytics events are only sent if user consented ('all').
 * Essential functions (session ID, lead capture) always work.
 */

const SESSION_KEY = 'dooh_chat_session_id';
const CONSENT_KEY = 'intermidia_consent';

// ── Consent management ───────────────────────────────────────────────
// Returns 'all' | 'essential' | null (null = not yet decided)
export function getConsentStatus() {
  if (typeof window === 'undefined') return null;
  const val = localStorage.getItem(CONSENT_KEY);
  if (val === 'all' || val === 'essential') return val;
  return null;
}

export function setConsentStatus(status) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CONSENT_KEY, status);
  // Dispatch event so other components can react
  window.dispatchEvent(new CustomEvent('consent-change', { detail: { status } }));
}

export function hasAnalyticsConsent() {
  return getConsentStatus() === 'all';
}

// ── Session ID (essential — always available) ────────────────────────
export function getOrCreateSessionId() {
  if (typeof window === 'undefined') return null;
  let id = localStorage.getItem(SESSION_KEY);
  if (id) return id;
  id = crypto.randomUUID();
  localStorage.setItem(SESSION_KEY, id);
  return id;
}

// ── Analytics tracking (requires consent) ────────────────────────────
export function trackEvent(eventType, eventData) {
  try {
    // Block analytics tracking if user hasn't consented
    if (!hasAnalyticsConsent()) return;

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

// ── Contact lead capture (essential — works without analytics consent) ─
// This is triggered when user actively clicks a contact button,
// which constitutes legitimate interest under LGPD (user-initiated action).
export function captureContactLead(source) {
  try {
    const sessionId = getOrCreateSessionId();
    if (!sessionId) return;

    const body = JSON.stringify({
      sessionId,
      source: source || 'contact_click',
      pageUrl: window.location.pathname,
    });

    fetch('/api/leads/capture-contact', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      credentials: 'include',
    }).catch(() => {});
  } catch {
    // fire and forget
  }
}

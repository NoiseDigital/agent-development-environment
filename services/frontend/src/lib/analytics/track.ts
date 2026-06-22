// Thin typed wrapper over gtag for the key user actions
// we care about. Events flow gtag → our sGTM container → GA4 (see the
// Analytics component + the "All events" GA4 tag).
//
// Privacy: never pass PII (message text, emails, raw filenames, client names).
// Stick to metadata — agent name, ids, ratings, types — so GA4 stays clean and
// compliant.

/** The closed set of events we emit. Adding one here is the only place a new
 *  event name is declared — keeps names consistent and typo-proof. */
export type AnalyticsEvent =
  | 'login'
  | 'logout'
  | 'agent_selected'
  | 'new_conversation'
  | 'session_resumed'
  | 'conversation_deleted'
  | 'message_sent'
  | 'agent_run'
  | 'feedback_submitted'
  | 'source_uploaded'
  | 'analysis_run'
  | 'regression_run'
  | 'market_radar_run'
  | 'dashboard_created'
  | 'dashboard_viewed'
  | 'chart_pinned'
  | 'plan_viewed'
  | 'user_invited'
  | 'role_changed';

/** Fire a GA4 event */
export function track(event: AnalyticsEvent, params?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  // Dev aid: log every event so you can verify firing locally without digging
  // through the Network tab. Stripped from the production bundle.
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[track]', event, params ?? {});
  }
  window.gtag?.('event', event, params);
}

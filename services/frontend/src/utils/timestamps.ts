// Timestamp helpers shared across the chat UI.

/** Coerce an ADK timestamp (seconds or millis, number or ISO string) to epoch millis. */
export const normalizeTimestamp = (timestamp: number | string): number => {
  let ts = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
  if (ts < 1_000_000_000_000) ts *= 1000; // seconds → ms
  if (!ts || isNaN(ts) || ts <= 0) ts = Date.now();
  return ts;
};

/** Hour:minute label for a message timestamp. */
export const formatMessageTime = (timestamp: number | string): string =>
  new Date(normalizeTimestamp(timestamp)).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

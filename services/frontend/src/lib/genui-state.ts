// Per-block UI state persistence — keyed by the parent message's ADK event id
// + the block's index. Lets a Choices block stay "Answered" and an Action
// block stay "✓ applied" across remounts (session switch, reload, scrollback).
//
// Backed by localStorage so the state outlives a tab close. Anonymous /
// streaming messages (id starts with `streaming-` or `user-`) are NOT
// persisted — there's no stable key for them, and the moment the turn
// finalizes the message's id flips to the real ADK event id anyway.

const NAMESPACE = 'noiseos:genui:';

function isStableId(messageId: string | undefined): messageId is string {
  if (!messageId) return false;
  if (messageId.startsWith('streaming-')) return false;
  if (messageId.startsWith('user-')) return false;
  return true;
}

function keyFor(messageId: string, blockIndex: number): string {
  return `${NAMESPACE}${messageId}:${blockIndex}`;
}

export function loadBlockState<T>(
  messageId: string | undefined,
  blockIndex: number,
): T | null {
  if (!isStableId(messageId)) return null;
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(keyFor(messageId, blockIndex));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveBlockState<T>(
  messageId: string | undefined,
  blockIndex: number,
  value: T,
): void {
  if (!isStableId(messageId)) return;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      keyFor(messageId, blockIndex),
      JSON.stringify(value),
    );
  } catch {
    /* quota / serialization — fall back to in-memory only */
  }
}

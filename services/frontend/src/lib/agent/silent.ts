/** Zero-width sentinel prepended to messages a page sends on the user's behalf —
 *  greetings and action notifications (upload / run / mode switch). The agent
 *  receives and responds to them (its reply is shown), but the projection hides
 *  the *user* bubble, both live (deriveMessages) and on reload (eventsToMessages),
 *  so the transcript shows only what the user actually typed. U+2063 (INVISIBLE
 *  SEPARATOR) is non-printing and won't occur in real input. */
export const AGENT_SILENT_PREFIX = String.fromCharCode(0x2063);

export const isSilentMessage = (text: string): boolean =>
  text.startsWith(AGENT_SILENT_PREFIX);

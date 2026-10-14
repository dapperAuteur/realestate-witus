/**
 * Escapes text for the places Photo Sphere Viewer renders as HTML: the navbar
 * caption, marker and map tooltips, and the notification box.
 *
 * PSV writes those with innerHTML and sanitizes nothing. Room names, captions
 * and hotspot text are typed by agency staff and shown to the public, often
 * inside the embed on our own origin, so an unescaped `<img onerror>` in a room
 * name would run script on every buyer's screen. Everything agent-typed that
 * reaches PSV goes through here; React-rendered text never needs it.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escaped, with line breaks kept: for hotspot content shown in PSV's notification. */
export function escapeHtmlMultiline(text: string): string {
  return escapeHtml(text).replace(/\r?\n/g, "<br>");
}

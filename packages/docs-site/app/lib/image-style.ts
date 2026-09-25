// The width cap shared by a guide `<img>` and an inlined SVG figure: never wider
// than the page, never wider than the author asked for.
export function imageMaxWidthStyle(maxWidth: string): string {
  return `max-width: min(100%, ${maxWidth})`;
}

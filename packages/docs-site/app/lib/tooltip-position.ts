export interface TooltipAnchor {
  rectLeft: number;
  rectBottom: number;
  innerWidth: number;
  innerHeight: number;
}

const CARD_MAX_W = 320;
const CARD_MAX_H = 320;
const MARGIN = 8;
const GAP = 8;

/**
 * Places the symbol-tooltip card relative to its anchor and the viewport.
 *
 * The card is `position: fixed` at most `max-w-xs` (320px) wide. Anchoring it to
 * the symbol's left clips it off the viewport's right edge for symbols near the
 * right side, so `left` is clamped into `[MARGIN, innerWidth - CARD_MAX_W -
 * MARGIN]` — the card right-aligns near the edge instead of overflowing.
 *
 * The card sits `GAP` below the symbol and `maxHeight` is clamped to the space
 * remaining below the anchor, capped at `CARD_MAX_H`; a symbol near the viewport
 * bottom yields a short, scrollable popup (never a negative height).
 */
export function tooltipPosition(a: TooltipAnchor): {
  top: number;
  left: number;
  maxHeight: number;
} {
  const top = a.rectBottom + GAP;
  const left = Math.max(MARGIN, Math.min(a.rectLeft, a.innerWidth - CARD_MAX_W - MARGIN));
  const maxHeight = Math.max(0, Math.min(CARD_MAX_H, a.innerHeight - top - MARGIN));
  return { top, left, maxHeight };
}

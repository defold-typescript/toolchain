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

export interface LabelTooltipAnchor {
  rectLeft: number;
  rectTop: number;
  rectBottom: number;
  rectWidth: number;
  innerWidth: number;
  tipWidth: number;
  tipHeight: number;
}

const LABEL_GAP = 6;

/**
 * Places a short label tooltip (the `ui/tooltip` island) centred above its
 * trigger. `left` is clamped into `[MARGIN, innerWidth - tipWidth - MARGIN]` so
 * a trigger near either edge keeps the tip on screen; when the space above the
 * trigger (less the gap and margin) cannot hold the tip it flips below.
 */
export function labelTooltipPosition(a: LabelTooltipAnchor): {
  top: number;
  left: number;
  placement: "top" | "bottom";
} {
  const centred = a.rectLeft + a.rectWidth / 2 - a.tipWidth / 2;
  const left = Math.max(MARGIN, Math.min(centred, a.innerWidth - a.tipWidth - MARGIN));
  if (a.rectTop - LABEL_GAP - MARGIN < a.tipHeight) {
    return { top: a.rectBottom + LABEL_GAP, left, placement: "bottom" };
  }
  return { top: a.rectTop - LABEL_GAP - a.tipHeight, left, placement: "top" };
}

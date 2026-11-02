export type TapFocus = {
  /** True while the latest input was a touch or pen press, so a focus it raised is a tap. */
  focusFromTap(): boolean;
  dispose(): void;
};

/**
 * Tracks whether the most recent input was a tap. A touch or pen `pointerdown`
 * sets the mark; a mouse `pointerdown` or any `keydown` clears it, so keyboard
 * focus after a tap is treated as keyboard focus again. Capture listeners run
 * before the `focusin` a press or key raises. Client-reachable, so no DOM types
 * beyond `EventTarget`.
 */
export function watchTapFocus(target: EventTarget): TapFocus {
  let fromTap = false;
  const onPointerDown = (event: Event) => {
    fromTap = (event as Event & { pointerType?: string }).pointerType !== "mouse";
  };
  const onKeyDown = () => {
    fromTap = false;
  };
  target.addEventListener("pointerdown", onPointerDown, true);
  target.addEventListener("keydown", onKeyDown, true);
  return {
    focusFromTap: () => fromTap,
    dispose() {
      target.removeEventListener("pointerdown", onPointerDown, true);
      target.removeEventListener("keydown", onKeyDown, true);
    },
  };
}

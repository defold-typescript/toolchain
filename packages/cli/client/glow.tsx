/** Matches `--animate-glow` and `--animate-glow-dim` in styles.css. */
export const GLOW_MS = 1200;

export interface GlowProps {
  /** How many times the glow has started; a new value restarts the fade. */
  readonly stamp: number;
  /** When it last started, on the store's clock. */
  readonly since: number | undefined;
  readonly now: number;
  /** Fades from the dimmer color, for a rule whose `when` rejected the event. */
  readonly dim?: boolean;
}

/**
 * A fading overlay for a `relative` parent. A virtualized row mounts it again when it scrolls
 * back into sight, so it resumes the fade at its age rather than replaying it.
 */
export function Glow({ stamp, since, now, dim = false }: GlowProps) {
  if (stamp === 0 || since === undefined || now - since >= GLOW_MS) {
    return null;
  }
  return (
    <span
      key={stamp}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${dim ? "animate-glow-dim" : "animate-glow"}`}
      style={{ animationDelay: `${since - now}ms` }}
    />
  );
}

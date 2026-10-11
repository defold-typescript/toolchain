import type { BuddyLight, BuddyPose, BuddyReaction, DemoVisual } from "./demos";

/**
 * The buddy drawn beside each live diagram. One drawing holds the parts of
 * every pose; the classes from `figureClass` pick which parts `styles.css` shows.
 */

const POSE_WORDS: Record<BuddyPose, string> = {
  asleep: "asleep",
  waking: "waking up",
  awake: "awake",
  follow: "following the player",
  resting: "resting",
  stopped: "stopped",
};

const LIGHT_WORDS: Record<BuddyLight, string> = {
  off: "off",
  dim: "dim",
  lit: "on",
};

export function figureClass(visual: DemoVisual): string {
  const pose = `hsm-buddy hsm-pose-${visual.pose}`;
  return visual.light === undefined ? pose : `${pose} hsm-light-${visual.light}`;
}

export function figureLabel(visual: DemoVisual): string {
  const pose = `buddy ${POSE_WORDS[visual.pose]}`;
  return visual.light === undefined ? pose : `${pose}, light ${LIGHT_WORDS[visual.light]}`;
}

/** The class a reaction puts on the element around the figure for as long as it shows. */
export function reactionClass(reaction: BuddyReaction): string {
  return `hsm-react-${reaction}`;
}

export const BUDDY_SVG = `<svg viewBox="0 0 120 84" aria-hidden="true" focusable="false">
  <g class="hsm-b-player">
    <circle cx="18" cy="42" r="6" />
    <path d="M9 78v-13a9 9 0 0 1 18 0v13" />
  </g>
  <g class="hsm-b-robot">
    <path d="M60 14v10M45 60h-6v8M75 60h6v8" />
    <circle class="hsm-b-light" cx="60" cy="9" r="5" />
    <rect class="hsm-b-shell" x="40" y="24" width="40" height="26" rx="8" />
    <rect class="hsm-b-shell" x="45" y="53" width="30" height="19" rx="6" />
    <g class="hsm-b-eyes-open"><circle cx="51" cy="37" r="3.5" /><circle cx="69" cy="37" r="3.5" /></g>
    <g class="hsm-b-eyes-half"><path d="M47.5 37a3.5 3.5 0 0 0 7 0z" /><path d="M65.5 37a3.5 3.5 0 0 0 7 0z" /></g>
    <g class="hsm-b-eyes-shut"><path d="M47 37q4 3 8 0" /><path d="M65 37q4 3 8 0" /></g>
    <g class="hsm-b-battery">
      <rect x="53" y="59" width="12" height="7" rx="1.5" />
      <path d="M67 61.5v2" />
      <path class="hsm-b-charge" d="M56 61v3" />
    </g>
    <circle class="hsm-b-shell" cx="53" cy="77" r="4" />
    <circle class="hsm-b-shell" cx="67" cy="77" r="4" />
  </g>
  <g class="hsm-b-zz"><path d="M90 22h7l-7 8h7" /><path d="M101 9h5l-5 6h5" /></g>
  <g class="hsm-b-hit"><path d="M86 30l7-4M87 37h8M86 44l7 4" /></g>
  <g class="hsm-b-huh"><path d="M92 45a5 5 0 1 1 6.5 4.8q-1.5 1-1.5 3.2" /><path d="M97 58v.5" /></g>
</svg>`;

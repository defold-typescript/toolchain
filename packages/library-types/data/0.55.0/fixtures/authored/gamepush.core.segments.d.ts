/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @noResolution
 */
declare module 'gamepush.core.segments' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface SegmentsCallbacks {
    /** The player entered a segment. */
    enter?: (segment_tag: unknown) => void;
    /** The player left a segment. */
    leave?: (segment_tag: unknown) => void;
  }

  /** The tags of the segments the player belongs to; empty when none. */
  export function list(): string[];

  /**
   * Whether the player belongs to a segment.
   * @param tag The segment's tag.
   */
  export function has(tag: string): boolean;

  /** The event handlers. */
  export const callbacks: SegmentsCallbacks;
}

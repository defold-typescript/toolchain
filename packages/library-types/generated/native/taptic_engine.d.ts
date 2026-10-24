/** @noSelfInFile */
declare global {
  /**
   * Haptic feedback through the iOS Taptic Engine: impact, notification and
   * selection events. The extension registers this namespace on iOS only; on
   * every other platform it does not exist at runtime.
   *
   * @see {@link https://github.com/MaratGilyazov/def_taptic_engine|Github Source}
   */
  namespace taptic_engine {
    /** Light impact style, for {@link taptic_engine.impact}. */
    const IMPACT_LIGHT: number;
    /** Medium impact style, for {@link taptic_engine.impact}. */
    const IMPACT_MEDIUM: number;
    /** Heavy impact style, for {@link taptic_engine.impact}. */
    const IMPACT_HEAVY: number;
    /** Success notification type, for {@link taptic_engine.notification}. */
    const NOTIFICATION_SUCCESS: number;
    /** Warning notification type, for {@link taptic_engine.notification}. */
    const NOTIFICATION_WARNING: number;
    /** Error notification type, for {@link taptic_engine.notification}. */
    const NOTIFICATION_ERROR: number;

    /**
     * Reports whether the device supports the Taptic Engine.
     *
     * @returns `true` when haptic feedback is available.
     */
    function isSupported(): boolean;

    /**
     * Plays an impact haptic.
     *
     * @param style - One of `IMPACT_LIGHT`, `IMPACT_MEDIUM` or `IMPACT_HEAVY`.
     */
    function impact(style: number): void;

    /**
     * Plays a notification haptic.
     *
     * @param type - One of `NOTIFICATION_SUCCESS`, `NOTIFICATION_WARNING` or
     * `NOTIFICATION_ERROR`.
     */
    function notification(type: number): void;

    /** Plays a selection-change haptic. */
    function selection(): void;
  }
}

export {};

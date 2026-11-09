/** @noSelfInFile */
/**
 * GameAnalytics event tracking, sessions and remote configs. The extension
 * reads its game key, secret key and settings from the `gameanalytics`
 * section of `game.project`, and initializes the SDK at startup unless
 * `use_custom_id` or `manual_initialize` is set there. It registers this
 * namespace on iOS, Android, HTML5, macOS, Windows and Linux only; on every
 * other platform it does not exist at runtime.
 *
 * Every event table raises an error on a key the event does not list. An
 * enum-valued string field is compared ignoring case, and an event left
 * without one sends the SDK the value `0`, which names no member of that
 * enum.
 *
 * @see {@link https://github.com/GameAnalytics/GA-SDK-DEFOLD|Github Source}
 */
/** @globalTable */
declare module "gameanalytics" {
  /**
   * Sets a custom user id and initializes the SDK with it. Takes effect only
   * when `gameanalytics.use_custom_id` is `1` in `game.project`; otherwise it
   * logs a warning and does nothing.
   *
   * @param id - The user id; an empty string raises an error.
   */
  function configureUserId(id: string): void;

  /**
   * Initializes the SDK. Takes effect only when
   * `gameanalytics.manual_initialize` is `1` in `game.project`; otherwise it
   * logs a warning and does nothing.
   */
  function initialize(): void;

  /**
   * Sends a business (real-money purchase) event.
   *
   * @param options - The event. `currency`, `itemType` and `itemId` must be
   * non-empty strings.
   */
  function addBusinessEvent(options: {
    /** Currency code, such as `"USD"`. */
    currency: string;
    /** Amount in the currency's smallest unit, truncated to an integer. Defaults to `0`. */
    amount?: number;
    itemType: string;
    itemId: string;
    cartType?: string;
    /** Store receipt. Accepted on iOS and Android only; elsewhere the key raises an error. */
    receipt?: string;
    /** Receipt signature. Accepted on Android only; elsewhere the key raises an error. */
    signature?: string;
    /**
     * Fetch the App Store receipt automatically instead of sending `receipt`.
     * Accepted on iOS only; elsewhere the key raises an error.
     */
    autoFetchReceipt?: boolean;
    /** Custom fields for this event, as a JSON object string. */
    customFields?: string;
    /** Merge `customFields` into the global custom fields instead of replacing them. */
    mergeFields?: boolean;
  }): void;

  /**
   * Sends a resource (virtual currency) event.
   *
   * @param options - The event. `currency`, `itemType` and `itemId` must be
   * non-empty strings and `amount` must be greater than zero.
   */
  function addResourceEvent(options: {
    /** Whether the currency was gained (`"Source"`) or spent (`"Sink"`). */
    flowType?: "Source" | "Sink";
    currency: string;
    amount: number;
    itemType: string;
    itemId: string;
    /** Custom fields for this event, as a JSON object string. */
    customFields?: string;
    /**
     * Accepted as a boolean, but the extension reads it as a string, so it is
     * always `false` and `customFields` replaces the global custom fields.
     */
    mergeFields?: boolean;
  }): void;

  /**
   * Sends a progression event.
   *
   * @param options - The event. `progression01` must be a non-empty string.
   */
  function addProgressionEvent(options: {
    progressionStatus?: "Start" | "Complete" | "Fail";
    progression01: string;
    progression02?: string;
    progression03?: string;
    /** Score, truncated to an integer. Sent only when given. */
    score?: number;
    /** Custom fields for this event, as a JSON object string. */
    customFields?: string;
    /** Merge `customFields` into the global custom fields instead of replacing them. */
    mergeFields?: boolean;
  }): void;

  /**
   * Sends a design event.
   *
   * @param options - The event. `eventId` must be a non-empty string.
   */
  function addDesignEvent(options: {
    /** Event id, in colon-separated parts such as `"kill:sword"`. */
    eventId: string;
    /** Value sent with the event, only when given. */
    value?: number;
    /** Custom fields for this event, as a JSON object string. */
    customFields?: string;
    /** Merge `customFields` into the global custom fields instead of replacing them. */
    mergeFields?: boolean;
  }): void;

  /**
   * Sends an error event.
   *
   * @param options - The event.
   */
  function addErrorEvent(options: {
    severity?: "Critical" | "Debug" | "Error" | "Info" | "Warning";
    message?: string;
    /** Custom fields for this event, as a JSON object string. */
    customFields?: string;
    /** Merge `customFields` into the global custom fields instead of replacing them. */
    mergeFields?: boolean;
  }): void;

  /**
   * Sends an ad event. With `duration` the event carries the duration;
   * without it, the event carries `noAdReason`.
   *
   * @param options - The event.
   */
  function addAdEvent(options: {
    adAction?: "Clicked" | "Show" | "FailedShow" | "RewardReceived";
    adType?: "Video" | "RewardedVideo" | "Playable" | "Interstitial" | "OfferWall" | "Banner";
    adSdkName?: string;
    adPlacement?: string;
    /** How long the ad was shown, truncated to an integer. */
    duration?: number;
    /** Why no ad was shown. Ignored when `duration` is given. */
    noAdReason?:
      | "Unknown"
      | "Offline"
      | "NoFill"
      | "InternalError"
      | "InvalidRequest"
      | "UnableToPrecache";
    /** Custom fields for this event, as a JSON object string. */
    customFields?: string;
    /** Merge `customFields` into the global custom fields instead of replacing them. */
    mergeFields?: boolean;
  }): void;

  /**
   * Turns event submission on or off.
   *
   * @param flag - `true` to submit events.
   */
  function setEnabledEventSubmission(flag: boolean): void;

  /**
   * Turns the SDK's info log on or off.
   *
   * @param flag - `true` to log.
   */
  function setEnabledInfoLog(flag: boolean): void;

  /**
   * Turns the SDK's verbose log on or off.
   *
   * @param flag - `true` to log.
   */
  function setEnabledVerboseLog(flag: boolean): void;

  /**
   * Turns manual session handling on or off. While on, sessions start and end
   * only through {@link gameanalytics.startSession} and
   * {@link gameanalytics.endSession}.
   *
   * @param flag - `true` to handle sessions manually.
   */
  function setEnabledManualSessionHandling(flag: boolean): void;

  /**
   * Sets custom dimension 01 for the events that follow.
   *
   * @param dimension - One of the values listed in
   * `gameanalytics.custom_dimensions_01` in `game.project`.
   */
  function setCustomDimension01(dimension: string): void;

  /**
   * Sets custom dimension 02 for the events that follow.
   *
   * @param dimension - One of the values listed in
   * `gameanalytics.custom_dimensions_02` in `game.project`.
   */
  function setCustomDimension02(dimension: string): void;

  /**
   * Sets custom dimension 03 for the events that follow.
   *
   * @param dimension - One of the values listed in
   * `gameanalytics.custom_dimensions_03` in `game.project`.
   */
  function setCustomDimension03(dimension: string): void;

  /**
   * Sets the custom fields sent with every event.
   *
   * @param customFields - The fields, as a JSON object string.
   */
  function setGlobalCustomEventFields(customFields: string): void;

  /** Starts a session, for use with manual session handling. */
  function startSession(): void;

  /** Ends the current session, for use with manual session handling. */
  function endSession(): void;

  /**
   * Reads one remote config value.
   *
   * @param options - `key` must be a non-empty string.
   * @returns The value, or `defaultValue` (an empty string when not given)
   * when the key has no value.
   */
  function getRemoteConfigsValueAsString(options: { key: string; defaultValue?: string }): string;

  /**
   * Whether the remote configs have been fetched.
   *
   * @returns `true` once the remote configs are ready.
   */
  function isRemoteConfigsReady(): boolean;

  /**
   * Reads every remote config.
   *
   * @returns The remote configs, as a JSON object string.
   */
  function getRemoteConfigsContentAsString(): string;

  /**
   * Sets the listener called when the remote configs are updated, replacing
   * any earlier one.
   *
   * @param listener - Called as `(self)`.
   */
  function setRemoteConfigsListener(listener: (self: unknown) => void): void;
}

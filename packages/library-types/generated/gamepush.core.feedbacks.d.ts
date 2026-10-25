/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @noResolution
 */
declare module 'gamepush.core.feedbacks' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface FeedbacksCallbacks {
    /** A feedback was sent. */
    create_feedback?: (feedback: unknown) => void;
    /** Sending a feedback failed. */
    error_create_feedback?: (error: unknown) => void;
    /** The feedback list window was opened. */
    open_feedbacks_list?: () => void;
    /** Opening the feedback list window failed. */
    error_open_feedbacks_list?: (error: unknown) => void;
    /** The player's feedbacks were fetched. */
    fetch_feedbacks?: (result: unknown) => void;
    /** Fetching the player's feedbacks failed. */
    error_fetch_feedbacks?: (error: unknown) => void;
    /** The next page of feedbacks was fetched. */
    fetch_more_feedbacks?: (result: unknown) => void;
    /** Fetching the next page of feedbacks failed. */
    error_fetch_more_feedbacks?: (error: unknown) => void;
    /** A message was sent to a feedback's chat. */
    send_message?: (message: unknown) => void;
    /** Sending a message to a feedback's chat failed. */
    error_send_message?: (error: unknown) => void;
    /** A message arrived in a feedback's chat. */
    event_feedback_message?: (message: unknown) => void;
    /** A feedback was created. */
    event_feedback_created?: (feedback: unknown) => void;
    /** A feedback's status changed. */
    event_feedback_status_updated?: (result: unknown) => void;
    /** A feedback's status on the platform changed. */
    event_feedback_platform_status_updated?: (result: unknown) => void;
  }

  /**
   * Sends a feedback. Raises when the table is missing.
   * @param parameters The feedback, for example `{ type: "SUGGESTION", text: "..." }`.
   * @param callback Receives the result.
   */
  export function send(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Opens the feedback list window.
   * @param parameters The list filter, or nil for every feedback.
   * @param callback Receives the result.
   */
  export function open(
    parameters?: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Opens one feedback. Raises when the table is missing.
   * @param parameters The feedback, for example `{ feedbackId: 1 }`.
   * @param callback Receives the result.
   */
  export function open_feedback(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the player's feedbacks.
   * @param parameters The list filter, or nil for every feedback.
   * @param callback Receives the result.
   * @returns The result when called without `callback`, else nil.
   */
  export function fetch(
    parameters?: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): Record<string, unknown> | undefined;

  /**
   * Fetches the next page of the player's feedbacks.
   * @param parameters The list filter, or nil for every feedback.
   * @param callback Receives the result.
   * @returns The result when called without `callback`, else nil.
   */
  export function fetch_more(
    parameters?: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): Record<string, unknown> | undefined;

  /**
   * Sends a message to a feedback's chat. Raises when the table is missing.
   * @param parameters The message, for example `{ feedbackId: 1, text: "..." }`.
   * @param callback Receives the result.
   */
  export function send_message(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /** The feedback event handlers. */
  export const callbacks: FeedbacksCallbacks;
}

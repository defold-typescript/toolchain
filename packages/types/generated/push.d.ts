/** @noSelfInFile */
declare global {
  /**
   * Functions and constants for interacting with local, as well as Apple''s and Google''s push notification services. These API's only exist on mobile platforms. [icon:ios] [icon:android]
   */
  namespace push {
    /**
     * Use this function to cancel a previously scheduled local push notification.
     * The notification is identified by a numeric id as returned by `push.schedule()`.
     *
     * @param id - The numeric id of the local push notification
     */
    function cancel(id: number): void;
    /**
     * Use this function to cancel a previously issued local push notifications.
     */
    function cancel_all_issued(): void;
    /**
     * Returns a table with all data associated with all scheduled local push notifications.
     * The table contains key, value pairs where the key is the push notification id and the value is a table with the notification data, corresponding to the data given by `push.get_scheduled(id)`.
     *
     * @returns Table with all data associated with all scheduled notifications.
     */
    function get_all_scheduled(): Record<string | number, unknown>;
    /**
     * Returns a table with all data associated with a specified local push notification.
     * The notification is identified by a numeric id as returned by `push.schedule()`.
     *
     * @param id - The numeric id of the local push notification.
     * @returns Table with all data associated with the notification.
     */
    function get_scheduled(id: number): Record<string | number, unknown>;
    /**
     * Send a request for push notifications. Note that the notifications table parameter is iOS only and will be ignored on Android.
     *
     * @param notifications - The types of notifications to listen to. [icon:ios]
     * @param callback - Register callback function.
     */
    function register(notifications: Record<string | number, unknown>, callback: (...args: unknown[]) => unknown): void;
    /**
     * Local push notifications are scheduled with this function.
     * The returned `id` value is uniquely identifying the scheduled notification and can be stored for later reference.
     *
     * @param time - Number of seconds into the future until the notification should be triggered.
     * @param title - Localized title to be displayed to the user if the application is not running.
     * @param alert - Localized body message of the notification to be displayed to the user if the application is not running.
     * @param payload - JSON string to be passed to the registered listener function.
     * @param notification_settings - Table with notification and platform specific fields
     */
    function schedule(time: number, title: string, alert: string, payload: string, notification_settings: Record<string | number, unknown>): LuaMultiReturn<[number, string]>;
    /**
     * Set the badge count for application icon. This function is only available on iOS. [icon:ios]
     *
     * @param count - Badge count
     */
    function set_badge_count(count: number): void;
    /**
     * Sets a listener function to listen to push notifications.
     *
     * @param listener - Listener callback function.
     */
    function set_listener(listener: (...args: unknown[]) => unknown): void;
  }
}

export {};

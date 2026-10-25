/** @noSelfInFile */
/**
 * Functions and constants for interacting with local, as well as Apple''s and Google''s push notification services. These API's only exist on mobile platforms. [icon:ios] [icon:android]
 */
/** @globalTable */
declare module "push" {
  /**
   * Alert notification type.
   */
  const NOTIFICATION_ALERT: number & { readonly __brand: "push.NOTIFICATION_ALERT" };
  /**
   * Badge notification type.
   */
  const NOTIFICATION_BADGE: number & { readonly __brand: "push.NOTIFICATION_BADGE" };
  /**
   * Sound notification type.
   */
  const NOTIFICATION_SOUND: number & { readonly __brand: "push.NOTIFICATION_SOUND" };
  /**
   * Local push origin.
   */
  const ORIGIN_LOCAL: number & { readonly __brand: "push.ORIGIN_LOCAL" };
  /**
   * Remote push origin.
   */
  const ORIGIN_REMOTE: number & { readonly __brand: "push.ORIGIN_REMOTE" };
  /**
   * The default notification priority. Only available on Android. [icon:android]
   */
  const PRIORITY_DEFAULT: number & { readonly __brand: "push.PRIORITY_DEFAULT" };
  /**
   * Priority for more important notifications or alerts. Only available on Android. [icon:android]
   */
  const PRIORITY_HIGH: number & { readonly __brand: "push.PRIORITY_HIGH" };
  /**
   * Priority for items that are less important. Only available on Android. [icon:android]
   */
  const PRIORITY_LOW: number & { readonly __brand: "push.PRIORITY_LOW" };
  /**
   * Set this priority for your application's most important items that require the user's prompt attention or input. Only available on Android. [icon:android]
   */
  const PRIORITY_MAX: number & { readonly __brand: "push.PRIORITY_MAX" };
  /**
   * This priority is for items might not be shown to the user except under special circumstances, such as detailed notification logs. Only available on Android. [icon:android]
   */
  const PRIORITY_MIN: number & { readonly __brand: "push.PRIORITY_MIN" };
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
   * @example
   * ```lua
   * Register for push notifications on iOS. Note that the token needs to be converted on this platform.local function push_listener(self, payload, origin)
   *      -- The payload arrives here.
   * end
   *
   * function init(self)
   *      local alerts = {push.NOTIFICATION_BADGE, push.NOTIFICATION_SOUND, push.NOTIFICATION_ALERT}
   *      push.register(alerts, function (self, token, error)
   *      if token then
   *           -- NOTE: %02x to pad byte with leading zero
   *           local token_string = ""
   *           for i = 1,#token do
   *               token_string = token_string .. string.format("%02x", string.byte(token, i))
   *           end
   *           print(token_string)
   *           push.set_listener(push_listener)
   *      else
   *           -- Push registration failed.
   *           print(error.error)
   *      end
   * endRegister for push notifications on Android.local function push_listener(self, payload, origin)
   *      -- The payload arrives here.
   * end
   *
   * function init(self)
   *      push.register({}, function (self, installation_id, error)
   *          if installation_id then
   *               print(installation_id)
   *               push.set_listener(push_listener)
   *          else
   *               -- Push registration failed.
   *               print(error.error)
   *          end
   *     end)
   * end
   * ```
   */
  function register(notifications: number[], callback: (self: unknown, token: string, error: Record<string | number, unknown>) => void): void;
  /**
   * Local push notifications are scheduled with this function.
   * The returned `id` value is uniquely identifying the scheduled notification and can be stored for later reference.
   *
   * @param time - Number of seconds into the future until the notification should be triggered.
   * @param title - Localized title to be displayed to the user if the application is not running.
   * @param alert - Localized body message of the notification to be displayed to the user if the application is not running.
   * @param payload - JSON string to be passed to the registered listener function.
   * @param notification_settings - Table with notification and platform specific fields
   * @example
   * ```lua
   * This example demonstrates how to schedule a local notification:-- Schedule a local push in 3 seconds
   * local payload = '{ "data" : { "field" : "Some value", "field2" : "Other value" } }'
   * id, err = push.schedule(3, "Update!", "There are new stuff in the app", payload, { action = "check it out" })
   * if err then
   *      -- Something went wrong
   *      ...
   * end
   * ```
   */
  function schedule(time: number, title: string, alert: string, payload: string, notification_settings: { action?: string; badge_count?: number; priority?: number }): LuaMultiReturn<[number, string]>;
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
   * @example
   * ```lua
   * Set the push notification listener.local function push_listener(self, payload, origin, activated)
   *      -- The payload arrives here.
   *      pprint(payload)
   *      if origin == push.ORIGIN_LOCAL then
   *          -- This was a local push
   *          ...
   *      end
   *
   *      if origin == push.ORIGIN_REMOTE then
   *          -- This was a remote push
   *          ...
   *      end
   * end
   *
   * local init(self)
   *      ...
   *      -- Assuming that push.register() has been successfully called earlier
   *      push.set_listener(push_listener)
   * end
   * ```
   */
  function set_listener(listener: (self: unknown, payload: Record<string | number, unknown>, origin: number & { readonly __brand: "push.ORIGIN_LOCAL" } | number & { readonly __brand: "push.ORIGIN_REMOTE" }, activated: boolean) => void): void;
}

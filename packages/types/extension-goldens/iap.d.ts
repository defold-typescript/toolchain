/** @noSelfInFile */
/**
 * Functions and constants for doing in-app purchases. Supported on iOS, Android (Google Play and Amazon) and Facebook Canvas platforms. [icon:ios] [icon:googleplay] [icon:amazon] [icon:facebook]
 */
/** @globalTable */
declare module "iap" {
  /**
   * provider id for Amazon
   */
  const PROVIDER_ID_AMAZON: number & { readonly __brand: "iap.PROVIDER_ID_AMAZON" };
  /**
   * provider id for Apple
   */
  const PROVIDER_ID_APPLE: number & { readonly __brand: "iap.PROVIDER_ID_APPLE" };
  /**
   * provider id for Facebook
   */
  const PROVIDER_ID_FACEBOOK: number & { readonly __brand: "iap.PROVIDER_ID_FACEBOOK" };
  /**
   * iap provider id for Google
   */
  const PROVIDER_ID_GOOGLE: number & { readonly __brand: "iap.PROVIDER_ID_GOOGLE" };
  /**
   * the item is already owned by the user
   */
  const REASON_ITEM_ALREADY_OWNED: number & { readonly __brand: "iap.REASON_ITEM_ALREADY_OWNED" };
  /**
   * unspecified error reason
   */
  const REASON_UNSPECIFIED: number & { readonly __brand: "iap.REASON_UNSPECIFIED" };
  /**
   * user canceled reason
   */
  const REASON_USER_CANCELED: number & { readonly __brand: "iap.REASON_USER_CANCELED" };
  /**
   * transaction failed state
   */
  const TRANS_STATE_FAILED: number & { readonly __brand: "iap.TRANS_STATE_FAILED" };
  /**
   * transaction purchased state
   */
  const TRANS_STATE_PURCHASED: number & { readonly __brand: "iap.TRANS_STATE_PURCHASED" };
  /**
   * transaction purchasing state This is an intermediate mode followed by TRANS_STATE_PURCHASED. Store provider support dependent.
   */
  const TRANS_STATE_PURCHASING: number & { readonly __brand: "iap.TRANS_STATE_PURCHASING" };
  /**
   * transaction restored state This is only available on store providers supporting restoring purchases.
   */
  const TRANS_STATE_RESTORED: number & { readonly __brand: "iap.TRANS_STATE_RESTORED" };
  /**
   * transaction unverified state, requires verification of purchase
   */
  const TRANS_STATE_UNVERIFIED: number & { readonly __brand: "iap.TRANS_STATE_UNVERIFIED" };
  /**
   * Acknowledge a transaction. [icon:attention] Calling iap.acknowledge is required on a successful transaction on Google Play unless iap.finish is called. The transaction.state field must equal iap.TRANS_STATE_PURCHASED.
   *
   * @param transaction - transaction table parameter as supplied in listener callback
   */
  function acknowledge(transaction: { ident?: string; state?: number; trans_ident?: string; date?: string; original_trans?: string; receipt?: string; signature?: string; user_id?: string }): void;
  /**
   * Purchase a product.
   *
   * @param id - product to buy
   * @param options - optional parameters as properties. The following parameters can be set
   * @example
   * ```lua
   *   local function iap_listener(self, transaction, error)
   *     if error == nil then
   *       -- purchase is successful.
   *       print(transaction.date)
   *       -- required if auto finish transactions is disabled in project settings
   *       if (transaction.state == iap.TRANS_STATE_PURCHASED) then
   *         -- do server-side verification of purchase here..
   *         iap.finish(transaction)
   *       end
   *     else
   *       print(error.error, error.reason)
   *     end
   *   end
   *
   *   function init(self)
   *       iap.set_listener(iap_listener)
   *       iap.buy("my_iap")
   *   end
   * ```
   */
  function buy(id: string, options?: { request_id?: string; token?: string }): void;
  /**
   * Explicitly finish a product transaction. [icon:attention] Calling iap.finish is required on a successful transaction if `auto_finish_transactions` is disabled in project settings. Calling this function with `auto_finish_transactions` set will be ignored and a warning is printed. The `transaction.state` field must equal `iap.TRANS_STATE_PURCHASED`.
   *
   * @param transaction - transaction table parameter as supplied in listener callback
   */
  function finish(transaction: { ident?: string; state?: number; trans_ident?: string; date?: string; original_trans?: string; receipt?: string; signature?: string; user_id?: string }): void;
  /**
   * Get current iap provider
   *
   * @returns one of the following values
   * - `iap.PROVIDER_ID_GOOGLE`
   * - `iap.PROVIDER_ID_AMAZON`
   * - `iap.PROVIDER_ID_APPLE`
   * - `iap.PROVIDER_ID_FACEBOOK`
   */
  function get_provider_id(): number & { readonly __brand: "iap.PROVIDER_ID_GOOGLE" } | number & { readonly __brand: "iap.PROVIDER_ID_AMAZON" } | number & { readonly __brand: "iap.PROVIDER_ID_APPLE" } | number & { readonly __brand: "iap.PROVIDER_ID_FACEBOOK" };
  /**
   * Get a list of all avaliable iap products.
   *
   * @param ids - table (array) of identifiers to get products from
   * @param callback - result callback taking the following parameters
   * @example
   * ```lua
   *   local function iap_callback(self, products, error)
   *     if error == nil then
   *       for k,p in pairs(products) do
   *         -- present the product
   *         print(p.title)
   *         print(p.description)
   *       end
   *     else
   *       print(error.error)
   *     end
   *   end
   *
   *   function init(self)
   *       iap.list({"my_iap"}, iap_callback)
   *   end
   * ```
   */
  function list(ids: string[], callback: (self: unknown, products: { ident: string; title: string; description: string; price: number; price_string: string; currency_code: string; onetime: { token: string; price: number; price_string: string; currency_code: string }; subscriptions: { token: string; pricing: { price_string: string; price: number; currency_code: string; billing_period: string; billing_cycle_count: number; recurrence_mode: string } } }, error: Record<string | number, unknown>) => void): void;
  /**
   * Restore previously purchased products.
   *
   * @returns value is `true` if current store supports handling restored transactions, otherwise `false`.
   */
  function restore(): boolean;
  /**
   * Set the callback function to receive purchase transaction events.
   *
   * @param listener - listener callback function. Pass an empty function if you no longer wish to receive callbacks.
   */
  function set_listener(listener: (self: unknown, transaction: { ident: string; state: string; date: string; trans_ident: string; receipt: string; original_trans: string; original_json: string; signature: string; request_id: string; user_id: string; is_sandbox_mode: boolean; cancel_date: string; canceled: string }, error: Record<string | number, unknown>) => void): void;
}

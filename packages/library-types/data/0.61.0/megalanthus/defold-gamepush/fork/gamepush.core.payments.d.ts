/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/purchases|GamePush purchases docs}
 * @noResolution
 */
declare module 'gamepush.core.payments' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface PaymentsCallbacks {
    /** A product was purchased. */
    purchase?: (result: unknown) => void;
    /** A purchase failed. */
    error_purchase?: (error: unknown) => void;
    /** A purchase was consumed. */
    consume?: (result: unknown) => void;
    /** Consuming a purchase failed. */
    error_consume?: (error: unknown) => void;
    /** The product list was fetched. */
    fetch_products?: (result: unknown) => void;
    /** Fetching the product list failed. */
    error_fetch_products?: (error: unknown) => void;
    /** The player subscribed. */
    subscribe?: (result: unknown) => void;
    /** Subscribing failed. */
    error_subscribe?: (error: unknown) => void;
    /** The player unsubscribed. */
    unsubscribe?: (result: unknown) => void;
    /** Unsubscribing failed. */
    error_unsubscribe?: (error: unknown) => void;
  }

  /**
   * Whether the platform supports payments.
   * @upstreamDoc d8c89a5be8c3
   */
  export function is_available(): boolean;

  /**
   * The products on sale.
   * @upstreamDoc 84d7bb18fe34
   */
  export function products(): Record<string, unknown>[];

  /**
   * The player's purchases.
   * @upstreamDoc a62b5853f569
   */
  export function purchases(): Record<string, unknown>[];

  /**
   * Buys a product. Raises when the table is missing.
   * @param parameters The product to buy, for example `{ id: 749 }`.
   * @param callback Receives the purchase result.
    * @upstreamDoc 650d3f2b013e
   */
  export function purchase(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Consumes a purchase. Raises when the table is missing.
   * @param parameters The product to consume, for example `{ id: 749 }`.
   * @param callback Receives the consume result.
    * @upstreamDoc 022e19c347b6
   */
  export function consume(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Whether the player owns a product.
   * @param product The product's id or tag.
    * @upstreamDoc 372e57b47b7a
   */
  export function has(product: string | number): boolean;

  /**
   * Fetches the product list.
   * @param callback Receives the fetch result.
    * @upstreamDoc 1617b1c976d4
   */
  export function fetch_products(callback?: (result: unknown) => void): void;

  /**
   * Whether the platform supports subscriptions.
   * @upstreamDoc 2c69f175d288
   */
  export function is_subscriptions_available(): boolean;

  /**
   * Subscribes the player. Raises when the table is missing.
   * @param parameters The subscription, for example `{ tag: "Test_subscription" }`.
   * @param callback Receives the subscription result.
    * @upstreamDoc 26ad555e16c4
   */
  export function subscribe(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Cancels a subscription. Raises when the table is missing.
   * @param parameters The subscription, for example `{ tag: "Test_subscription" }`.
   * @param callback Receives the cancellation result.
    * @upstreamDoc 2b8092af3384
   */
  export function unsubscribe(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /** The payment event handlers. */
  export const callbacks: PaymentsCallbacks;
}

/** @noSelfInFile */
import type { Opaque } from "../src/core-types";

declare global {
  namespace iap {
    /**
     * Acknowledge a transaction. [icon:attention] Calling iap.acknowledge is required on a successful transaction on Google Play unless iap.finish is called. The transaction.state field must equal iap.TRANS_STATE_PURCHASED.
     *
     * @param transaction - transaction table parameter as supplied in listener callback
     */
    function acknowledge(transaction: Record<string | number, unknown>): void;
    /**
     * Purchase a product.
     *
     * @param id - product to buy
     * @param options - optional parameters as properties. The following parameters can be set
     */
    function buy(id: string, options: Record<string | number, unknown>): void;
    /**
     * Explicitly finish a product transaction. [icon:attention] Calling iap.finish is required on a successful transaction if `auto_finish_transactions` is disabled in project settings. Calling this function with `auto_finish_transactions` set will be ignored and a warning is printed. The `transaction.state` field must equal `iap.TRANS_STATE_PURCHASED`.
     *
     * @param transaction - transaction table parameter as supplied in listener callback
     */
    function finish(transaction: Record<string | number, unknown>): void;
    /**
     * Get current iap provider
     *
     * @returns one of the following values
  - `iap.PROVIDER_ID_GOOGLE`
  - `iap.PROVIDER_ID_AMAZON`
  - `iap.PROVIDER_ID_APPLE`
  - `iap.PROVIDER_ID_FACEBOOK`
     */
    function get_provider_id(): Opaque<"constant">;
    /**
     * Get a list of all avaliable iap products.
     *
     * @param ids - table (array) of identifiers to get products from
     * @param callback - result callback taking the following parameters
     */
    function list(ids: string[], callback: (...args: unknown[]) => unknown): void;
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
    function set_listener(listener: (...args: unknown[]) => unknown): void;
  }
}

export {};

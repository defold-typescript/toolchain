/** @noSelfInFile */
declare global {
  /**
   * Functions and constants for doing inter-app communication. Supported on iOS and Android. [icon:ios] [icon:android]
   */
  namespace iac {
    /**
     * iac type
     */
    const TYPE_INVOCATION: number & { readonly __brand: "iac.TYPE_INVOCATION" };
    /**
     * Sets the listener function for inter-app communication events.
     *
     * @param payload - The iac payload.
     * @param type - The type of iac, an iac.TYPE_ enumeration. It can be one of the predefined constants below
     * - `iac.TYPE_INVOCATION`
     * @example
     * ```lua
     *   local function iac_listener(self, payload, type)
     *        if type == iac.TYPE_INVOCATION then
     *            -- This was an invocation
     *            print(payload.origin) -- origin may be empty string if it could not be resolved
     *            print(payload.url)
     *        end
     *   end
     *
     *   function init(self)
     *        iac.set_listener(iac_listener)
     *   end
     * ```
     */
    function set_listener(payload: Record<string | number, unknown>, type: number): void;
  }
}

export {};

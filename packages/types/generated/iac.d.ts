/** @noSelfInFile */
declare global {
  namespace iac {
    /**
     * Sets the listener function for inter-app communication events.
     *
     * @param payload - The iac payload.
     * @param type - The type of iac, an iac.TYPE_ enumeration. It can be one of the predefined constants below
     * - `iac.TYPE_INVOCATION`
     */
    function set_listener(payload: Record<string | number, unknown>, type: number): void;
  }
}

export {};

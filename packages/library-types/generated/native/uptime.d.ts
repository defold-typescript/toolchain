/** @noSelfInFile */
declare global {
  /**
   * Time elapsed since the device booted. The extension registers this
   * namespace on iOS, Android, macOS and Windows only; on every other platform
   * it does not exist at runtime.
   *
   * @see {@link https://github.com/AGulev/defold-extension-uptime|Github Source}
   */
  namespace uptime {
    /**
     * Returns the time since the device booted, in seconds.
     *
     * @returns Seconds since boot.
     */
    function get(): number;
  }
}

export {};

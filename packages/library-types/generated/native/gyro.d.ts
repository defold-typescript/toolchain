/** @noSelfInFile */
declare global {
  /**
   * Gyroscope rotation as a quaternion. The extension registers this namespace
   * on iOS and Android only; on every other platform it does not exist at
   * runtime.
   *
   * @see {@link https://github.com/britzl/defold-gyro|Github Source}
   */
  namespace gyro {
    /**
     * Starts the gyroscope. While started, the listener is invoked every frame
     * with the device rotation as a quaternion.
     *
     * @param listener - Called every frame as `(self, quatx, quaty, quatz, quatw)`.
     */
    function start(
      listener: (
        self: unknown,
        quatx: number,
        quaty: number,
        quatz: number,
        quatw: number,
      ) => void,
    ): void;

    /** Stops the gyroscope. */
    function stop(): void;
  }
}

export {};

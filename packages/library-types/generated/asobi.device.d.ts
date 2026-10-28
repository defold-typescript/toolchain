/** @noSelfInFile **/

/**
 * Guest device credentials: a stable device id and secret that a game generates once, saves,
 * and presents to guest sign-in on every launch, so the same pair resumes the same player.
 * @see {@link https://github.com/widgrensit/asobi-defold|Github Source}
 * @noResolution
 */
declare module 'asobi.device' {
  /** What `generate`, `load_or_create` and `clear` read. */
  export interface DeviceOptions {
    /** The save file's application name, passed to `sys.get_save_file`. Defaults to `"asobi"`. */
    app?: string;
    /** The save file's name, passed to `sys.get_save_file`. Defaults to `"guest_device"`. */
    file?: string;
    /**
     * Returns `n` random bytes from a stronger source than the default, which uses the
     * browser's crypto on HTML5 and a seeded `math.random` elsewhere. It must return at least
     * 32 bytes when asked for 32.
     */
    random_bytes?: (n: number) => string;
    /** A fixed device id, used in place of a random one. */
    device_id?: string;
  }

  /**
   * Generates a new device id and secret without saving them. The secret is standard base64
   * of 32 random bytes, the shape the server requires.
   * @param opts The random byte source and a fixed device id.
   * @returns The device id and the device secret.
   */
  export function generate(
    opts?: Pick<DeviceOptions, 'random_bytes' | 'device_id'>,
  ): LuaMultiReturn<[device_id: string, device_secret: string]>;

  /**
   * Loads the saved device id and secret, or generates a pair and saves it on first run. Outside
   * the engine it generates a pair without saving. On HTML5 a pair saved in the older save
   * format is replaced, since web builds writing it all minted the same id.
   * @param opts The save file, the random byte source and a fixed device id.
   * @returns The device id and the device secret.
   */
  export function load_or_create(opts?: DeviceOptions): LuaMultiReturn<[device_id: string, device_secret: string]>;

  /**
   * Erases the saved pair, so the next `load_or_create` mints a new guest. The server account
   * is not deleted. Pass the same save file used to sign in.
   * @param opts The save file.
   */
  export function clear(opts?: Pick<DeviceOptions, 'app' | 'file'>): void;

  /**
   * Internal. The standard base64 encoder `generate` uses, exposed for upstream's encoder
   * test.
   */
  export const _base64: (bytes: string) => string;
}

/** @noSelfInFile **/

/**
 * @see {@link https://github.com/heroiclabs/nakama-defold|Github Source}
 * @noResolution
 */
declare module 'nakama.engine.defold' {
  export function uuid(): string;

  export function http(
    config: unknown,
    url_path: string,
    query_params: string,
    method: string,
    post_data: string,
    retry_policy: unknown,
    cancellation_token: unknown,
    callback: (response: unknown) => void
  ): void;

  export function socket_create(config: unknown, on_message: (socket: symbol, message: unknown) => void): void;

  export function socket_connect(socket: symbol, callback: (success: boolean, error: string) => void): void;

  export function socket_send(socket: symbol, message: string): void;
}

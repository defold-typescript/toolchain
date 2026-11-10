/** @noSelfInFile **/

/**
 * The asobi matchmaker over REST. A project reaches it as `client.matchmaker`.
 * @see {@link https://github.com/widgrensit/asobi-defold|Github Source}
 * @noResolution
 */
declare module 'asobi.api.matchmaker' {
  import type { Client, Payload } from 'asobi.client';
  import type { HttpCallback } from 'asobi.http';

  /** The ticket `add` sends. */
  export interface MatchmakerTicket {
    /** The mode to queue for. Defaults to `"default"`. */
    mode?: string;
    /** The properties the server matches players on. */
    properties?: Payload;
  }

  /**
   * Queues the signed-in player for a match.
   * @param client The client.
   * @param opts The mode to queue for, or the ticket. Queues for `"default"` when left out.
   * @param callback Receives the ticket, or the error.
   */
  export function add(client: Client, opts?: string | MatchmakerTicket, callback?: HttpCallback): void;

  /**
   * Fetches a ticket's state.
   * @param client The client.
   * @param ticket_id The ticket's id.
   * @param callback Receives the ticket, or the error.
   */
  export function status(client: Client, ticket_id: string, callback?: HttpCallback): void;

  /**
   * Leaves the queue.
   * @param client The client.
   * @param ticket_id The ticket's id.
   * @param callback Receives the server's answer, or the error.
   */
  export function cancel(client: Client, ticket_id: string, callback?: HttpCallback): void;
}

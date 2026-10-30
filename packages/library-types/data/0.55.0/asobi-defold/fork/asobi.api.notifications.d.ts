/** @noSelfInFile **/

/**
 * asobi notifications over REST. A project reaches it as `client.notifications`.
 * @see {@link https://github.com/widgrensit/asobi-defold|Github Source}
 * @noResolution
 */
declare module 'asobi.api.notifications' {
  import type { Client } from 'asobi.client';
  import type { HttpCallback } from 'asobi.http';

  /** The filters `list` sends. Each one left out applies no filter. */
  export interface NotificationListOptions {
    /** Only read, or only unread, notifications. */
    read?: boolean;
    /** The most notifications to return. */
    limit?: number;
  }

  /**
   * Fetches the signed-in player's notifications.
   * @param client The client.
   * @param opts The filters.
   * @param callback Receives the notifications, or the error.
   */
  export function list(client: Client, opts?: NotificationListOptions, callback?: HttpCallback): void;

  /**
   * Marks a notification read.
   * @param client The client.
   * @param notification_id The notification's id.
   * @param callback Receives the server's answer, or the error.
   */
  export function mark_read(client: Client, notification_id: string, callback?: HttpCallback): void;

  /**
   * Deletes a notification.
   * @param client The client.
   * @param notification_id The notification's id.
   * @param callback Receives the server's answer, or the error.
   */
  function delete_(client: Client, notification_id: string, callback?: HttpCallback): void;
  export { delete_ as delete };
}

/** @noSelfInFile **/

/**
 * asobi friends, groups and chat history over REST. A project reaches it as `client.social`.
 * @see {@link https://github.com/widgrensit/asobi-defold|Github Source}
 * @noResolution
 */
declare module 'asobi.api.social' {
  import type { Client, Payload } from 'asobi.client';
  import type { HttpCallback } from 'asobi.http';

  /**
   * Fetches the signed-in player's friends.
   * @param client The client.
   * @param status Only friendships with this status. Every friendship when left out.
   * @param limit The most friends to return. Defaults to `50`.
   * @param callback Receives the friends, or the error.
   */
  export function get_friends(client: Client, status?: string, limit?: number, callback?: HttpCallback): void;

  /**
   * Sends a friend request.
   * @param client The client.
   * @param friend_id The player's id.
   * @param callback Receives the friendship, or the error.
   */
  export function add_friend(client: Client, friend_id: string, callback?: HttpCallback): void;

  /**
   * Accepts a friend request, setting the friendship's status to `accepted`.
   * @param client The client.
   * @param friend_id The player's id.
   * @param callback Receives the friendship, or the error.
   */
  export function accept_friend(client: Client, friend_id: string, callback?: HttpCallback): void;

  /**
   * Blocks a player, setting the friendship's status to `blocked`.
   * @param client The client.
   * @param friend_id The player's id.
   * @param callback Receives the friendship, or the error.
   */
  export function block_friend(client: Client, friend_id: string, callback?: HttpCallback): void;

  /**
   * Removes a friend.
   * @param client The client.
   * @param friend_id The player's id.
   * @param callback Receives the server's answer, or the error.
   */
  export function remove_friend(client: Client, friend_id: string, callback?: HttpCallback): void;

  /**
   * Creates a group.
   * @param client The client.
   * @param name The group's name.
   * @param description The group's description. Defaults to `""`.
   * @param max_members The most members it holds. Defaults to `50`.
   * @param open Whether any player may join without an invite. Defaults to `false`.
   * @param callback Receives the group, or the error.
   */
  export function create_group(
    client: Client,
    name: string,
    description?: string,
    max_members?: number,
    open?: boolean,
    callback?: HttpCallback,
  ): void;

  /**
   * Fetches a group.
   * @param client The client.
   * @param group_id The group's id.
   * @param callback Receives the group, or the error.
   */
  export function get_group(client: Client, group_id: string, callback?: HttpCallback): void;

  /**
   * Joins a group.
   * @param client The client.
   * @param group_id The group's id.
   * @param callback Receives the server's answer, or the error.
   */
  export function join_group(client: Client, group_id: string, callback?: HttpCallback): void;

  /**
   * Leaves a group.
   * @param client The client.
   * @param group_id The group's id.
   * @param callback Receives the server's answer, or the error.
   */
  export function leave_group(client: Client, group_id: string, callback?: HttpCallback): void;

  /**
   * Sets a friendship's status.
   * @param client The client.
   * @param friend_id The player's id.
   * @param status The new status.
   * @param callback Receives the friendship, or the error.
   */
  export function update_friend(client: Client, friend_id: string, status: string, callback?: HttpCallback): void;

  /**
   * Updates a group.
   * @param client The client.
   * @param group_id The group's id.
   * @param fields The group fields to change.
   * @param callback Receives the group, or the error.
   */
  export function update_group(client: Client, group_id: string, fields: Payload, callback?: HttpCallback): void;

  /**
   * Fetches a group's members.
   * @param client The client.
   * @param group_id The group's id.
   * @param callback Receives the members, or the error.
   */
  export function get_group_members(client: Client, group_id: string, callback?: HttpCallback): void;

  /**
   * Sets a member's role in a group.
   * @param client The client.
   * @param group_id The group's id.
   * @param player_id The member's player id.
   * @param role The new role.
   * @param callback Receives the member, or the error.
   */
  export function update_member_role(
    client: Client,
    group_id: string,
    player_id: string,
    role: string,
    callback?: HttpCallback,
  ): void;

  /**
   * Removes a member from a group.
   * @param client The client.
   * @param group_id The group's id.
   * @param player_id The member's player id.
   * @param callback Receives the server's answer, or the error.
   */
  export function remove_member(client: Client, group_id: string, player_id: string, callback?: HttpCallback): void;

  /**
   * Fetches a chat channel's past messages.
   * @param client The client.
   * @param channel_id The channel's id.
   * @param limit The most messages to return. The server's default applies when left out.
   * @param callback Receives the messages, or the error.
   */
  export function get_chat_history(client: Client, channel_id: string, limit?: number, callback?: HttpCallback): void;
}

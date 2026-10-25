/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/channels|GamePush channels docs}
 * @noResolution
 */
declare module 'gamepush.core.channels' {
  export interface ChannelValueParameters {
    /** The channel's id. */
    channelId: number;
    /** The state key. */
    key: string;
    /** The value to store under the key. */
    value: unknown;
  }

  export interface ChannelAddValueParameters {
    /** The channel's id. */
    channelId: number;
    /** The state key. */
    key: string;
    /** The amount to add to the number stored under the key. */
    value: number;
  }

  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface ChannelsCallbacks {
    /** A channel was created. */
    create_channel?: (channel: unknown) => void;
    /** Creating a channel failed. */
    error_create_channel?: (error: unknown) => void;
    /** A channel was updated. */
    update_channel?: (channel: unknown) => void;
    /** Updating a channel failed. */
    error_update_channel?: (error: unknown) => void;
    /** A channel the player is in was changed. */
    event_update_channel?: (channel: unknown) => void;
    /** A channel was deleted. */
    delete_channel?: () => void;
    /** Deleting a channel failed. */
    error_delete_channel?: (error: unknown) => void;
    /** A channel the player is in was deleted. */
    event_delete_channel?: (channel: unknown) => void;
    /** A channel was fetched. */
    fetch_channel?: (channel: unknown) => void;
    /** Fetching a channel failed. */
    error_fetch_channel?: (error: unknown) => void;
    /** A list of channels was fetched. */
    fetch_channels?: (result: unknown) => void;
    /** Fetching a list of channels failed. */
    error_fetch_channels?: (error: unknown) => void;
    /** The next page of channels was fetched. */
    fetch_more_channels?: (result: unknown) => void;
    /** Fetching the next page of channels failed. */
    error_fetch_more_channels?: (error: unknown) => void;
    /** The chat window was opened. */
    open_chat?: () => void;
    /** The chat window was closed. */
    close_chat?: () => void;
    /** Opening the chat window failed. */
    error_open_chat?: (error: unknown) => void;
    /** The player joined a channel or asked to join it. */
    join?: (result: unknown) => void;
    /** Joining a channel failed. */
    error_join?: (error: unknown) => void;
    /** A player joined a channel. */
    event_join?: (result: unknown) => void;
    /** A player asked to join a channel. */
    event_join_request?: (result: unknown) => void;
    /** A request to join was cancelled. */
    cancel_join?: (result: unknown) => void;
    /** Cancelling a request to join failed. */
    error_cancel_join?: (error: unknown) => void;
    /** A player cancelled a request to join. */
    event_cancel_join?: (result: unknown) => void;
    /** The player left a channel. */
    leave?: (result: unknown) => void;
    /** Leaving a channel failed. */
    error_leave?: (error: unknown) => void;
    /** A player left a channel. */
    event_leave?: (result: unknown) => void;
    /** A member was removed from a channel. */
    kick?: (result: unknown) => void;
    /** Removing a member from a channel failed. */
    error_kick?: (error: unknown) => void;
    /** A channel's members were fetched. */
    fetch_members?: (result: unknown) => void;
    /** Fetching a channel's members failed. */
    error_fetch_members?: (error: unknown) => void;
    /** The next page of a channel's members was fetched. */
    fetch_more_members?: (result: unknown) => void;
    /** Fetching the next page of a channel's members failed. */
    error_fetch_more_members?: (error: unknown) => void;
    /** A player was muted. */
    mute?: (result: unknown) => void;
    /** Muting a player failed. */
    error_mute?: (error: unknown) => void;
    /** A player was muted in a channel. */
    event_mute?: (result: unknown) => void;
    /** A player was unmuted. */
    unmute?: (result: unknown) => void;
    /** Unmuting a player failed. */
    error_unmute?: (error: unknown) => void;
    /** A player was unmuted in a channel. */
    event_unmute?: (result: unknown) => void;
    /** An invite was sent. */
    send_invite?: (result: unknown) => void;
    /** Sending an invite failed. */
    error_send_invite?: (error: unknown) => void;
    /** The player was invited to a channel. */
    event_invite?: (result: unknown) => void;
    /** An invite was cancelled. */
    cancel_invite?: (result: unknown) => void;
    /** Cancelling an invite failed. */
    error_cancel_invite?: (error: unknown) => void;
    /** An invite to the player was cancelled. */
    event_cancel_invite?: (result: unknown) => void;
    /** An invite was accepted. */
    accept_invite?: (result: unknown) => void;
    /** Accepting an invite failed. */
    error_accept_invite?: (error: unknown) => void;
    /** An invite was rejected. */
    reject_invite?: (result: unknown) => void;
    /** Rejecting an invite failed. */
    error_reject_invite?: (error: unknown) => void;
    /** A player rejected an invite. */
    event_reject_invite?: (result: unknown) => void;
    /** The player's invites were fetched. */
    fetch_invites?: (result: unknown) => void;
    /** Fetching the player's invites failed. */
    error_fetch_invites?: (error: unknown) => void;
    /** The next page of the player's invites was fetched. */
    fetch_more_invites?: (result: unknown) => void;
    /** Fetching the next page of the player's invites failed. */
    error_fetch_more_invites?: (error: unknown) => void;
    /** The invites sent from a channel were fetched. */
    fetch_channel_invites?: (result: unknown) => void;
    /** Fetching the invites sent from a channel failed. */
    error_fetch_channel_invites?: (error: unknown) => void;
    /** The next page of the invites sent from a channel was fetched. */
    fetch_more_channel_invites?: (result: unknown) => void;
    /** Fetching the next page of the invites sent from a channel failed. */
    error_fetch_more_channel_invites?: (error: unknown) => void;
    /** The invites the player sent were fetched. */
    fetch_sent_invites?: (result: unknown) => void;
    /** Fetching the invites the player sent failed. */
    error_fetch_sent_invites?: (error: unknown) => void;
    /** The next page of the invites the player sent was fetched. */
    fetch_more_sent_invites?: (result: unknown) => void;
    /** Fetching the next page of the invites the player sent failed. */
    error_fetch_more_sent_invites?: (error: unknown) => void;
    /** A request to join was accepted. */
    accept_join_request?: (result: unknown) => void;
    /** Accepting a request to join failed. */
    error_accept_join_request?: (error: unknown) => void;
    /** A request to join was rejected. */
    reject_join_request?: (result: unknown) => void;
    /** Rejecting a request to join failed. */
    error_reject_join_request?: (error: unknown) => void;
    /** The player's request to join was rejected. */
    event_reject_join_request?: (result: unknown) => void;
    /** The requests to join a channel were fetched. */
    fetch_join_requests?: (result: unknown) => void;
    /** Fetching the requests to join a channel failed. */
    error_fetch_join_requests?: (error: unknown) => void;
    /** The next page of the requests to join a channel was fetched. */
    fetch_more_join_requests?: (result: unknown) => void;
    /** Fetching the next page of the requests to join a channel failed. */
    error_fetch_more_join_requests?: (error: unknown) => void;
    /** The requests to join that the player sent were fetched. */
    fetch_sent_join_requests?: (result: unknown) => void;
    /** Fetching the requests to join that the player sent failed. */
    error_fetch_sent_join_requests?: (error: unknown) => void;
    /** The next page of the requests to join that the player sent was fetched. */
    fetch_more_sent_join_requests?: (result: unknown) => void;
    /** Fetching the next page of the requests to join that the player sent failed. */
    error_fetch_more_sent_join_requests?: (error: unknown) => void;
    /** A message was sent. */
    send_message?: (result: unknown) => void;
    /** Sending a message failed. */
    error_send_message?: (error: unknown) => void;
    /** A new message arrived. */
    event_message?: (message: unknown) => void;
    /** A message was edited. */
    edit_message?: (result: unknown) => void;
    /** Editing a message failed. */
    error_edit_message?: (error: unknown) => void;
    /** A message in a channel was edited. */
    event_edit_message?: (message: unknown) => void;
    /** A message was deleted. */
    delete_message?: (result: unknown) => void;
    /** Deleting a message failed. */
    error_delete_message?: (error: unknown) => void;
    /** A message in a channel was deleted. */
    event_delete_message?: (message: unknown) => void;
    /** Messages were fetched. */
    fetch_messages?: (result: unknown) => void;
    /** Fetching messages failed. */
    error_fetch_messages?: (error: unknown) => void;
    /** The next page of messages was fetched. */
    fetch_more_messages?: (result: unknown) => void;
    /** Fetching the next page of messages failed. */
    error_fetch_more_messages?: (error: unknown) => void;
    /** A channel state value was set. */
    set_value?: (result: unknown) => void;
    /** Setting a channel state value failed. */
    error_set_value?: (error: unknown) => void;
    /** A channel state value was added to. */
    add_value?: (result: unknown) => void;
    /** Adding to a channel state value failed. */
    error_add_value?: (error: unknown) => void;
    /** A channel state value changed. */
    event_change_value?: (result: unknown) => void;
  }

  /**
   * Creates a channel. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.createChannel`.
   * @param callback Receives the result.
   */
  export function create_channel(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Updates a channel. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.updateChannel`.
   * @param callback Receives the result.
   */
  export function update_channel(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Deletes a channel. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.deleteChannel`.
   * @param callback Receives the result.
   */
  export function delete_channel(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches a channel by its id. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.fetchChannel`.
   * @param callback Receives the result.
   */
  export function fetch_channel(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches a list of channels. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.fetchChannels`.
   * @param callback Receives the result.
   */
  export function fetch_channels(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the next page of channels. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.fetchMoreChannels`.
   * @param callback Receives the result.
   */
  export function fetch_more_channels(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Opens the chat window.
   * @param parameters The options for the SDK's `channels.openChat`, or nil for the main chat.
   */
  export function open_chat(parameters?: Record<string, unknown>): void;

  /** Whether the main chat can be shown. */
  export function is_main_chat_enabled(): boolean;

  /** The main chat's id. */
  export function main_chat_id(): number;

  /**
   * Joins a public channel, or asks to join it. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.join`.
   * @param callback Receives the result.
   */
  export function join(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Cancels a request to join a channel. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.cancelJoin`.
   * @param callback Receives the result.
   */
  export function cancel_join(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Leaves a channel. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.leave`.
   * @param callback Receives the result.
   */
  export function leave(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Removes a member from a channel. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.kick`.
   * @param callback Receives the result.
   */
  export function kick(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches a channel's members. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.fetchMembers`.
   * @param callback Receives the result.
   */
  export function fetch_members(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the next page of a channel's members. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.fetchMoreMembers`.
   * @param callback Receives the result.
   */
  export function fetch_more_members(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Mutes a player in a channel. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.mute`.
   * @param callback Receives the result.
   */
  export function mute(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Unmutes a player in a channel. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.unmute`.
   * @param callback Receives the result.
   */
  export function unmute(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Invites a player to a channel. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.sendInvite`.
   * @param callback Receives the result.
   */
  export function send_invite(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Cancels an invite. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.cancelInvite`.
   * @param callback Receives the result.
   */
  export function cancel_invite(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Accepts an invite to a channel. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.acceptInvite`.
   * @param callback Receives the result.
   */
  export function accept_invite(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Rejects an invite to a channel. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.rejectInvite`.
   * @param callback Receives the result.
   */
  export function reject_invite(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the player's invites to channels. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.fetchInvites`.
   * @param callback Receives the result.
   */
  export function fetch_invites(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the next page of the player's invites. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.fetchMoreInvites`.
   * @param callback Receives the result.
   */
  export function fetch_more_invites(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the invites sent from a channel. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.fetchChannelInvites`.
   * @param callback Receives the result.
   */
  export function fetch_channel_invites(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the next page of the invites sent from a channel. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.fetchMoreChannelInvites`.
   * @param callback Receives the result.
   */
  export function fetch_more_channel_invites(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the invites the player sent to other players. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.fetchSentInvites`.
   * @param callback Receives the result.
   */
  export function fetch_sent_invites(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the next page of the invites the player sent. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.fetchMoreSentInvites`.
   * @param callback Receives the result.
   */
  export function fetch_more_sent_invites(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Accepts a request to join a channel. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.acceptJoinRequest`.
   * @param callback Receives the result.
   */
  export function accept_join_request(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Rejects a request to join a channel. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.rejectJoinRequest`.
   * @param callback Receives the result.
   */
  export function reject_join_request(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the requests to join a channel. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.fetchJoinRequests`.
   * @param callback Receives the result.
   */
  export function fetch_join_requests(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the next page of the requests to join a channel. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.fetchMoreJoinRequests`.
   * @param callback Receives the result.
   */
  export function fetch_more_join_requests(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the requests to join that the player sent. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.fetchSentJoinRequests`.
   * @param callback Receives the result.
   */
  export function fetch_sent_join_requests(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the next page of the requests to join that the player sent. Raises when the table is
   * missing.
   * @param parameters The options for the SDK's `channels.fetchMoreSentJoinRequests`.
   * @param callback Receives the result.
   */
  export function fetch_more_sent_join_requests(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Sends a message to a channel. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.sendMessage`.
   * @param callback Receives the result.
   */
  export function send_message(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Sends a personal message to a player. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.sendPersonalMessage`.
   * @param callback Receives the result.
   */
  export function send_personal_message(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Posts a message to a player's feed. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.sendFeedMessage`.
   * @param callback Receives the result.
   */
  export function send_feed_message(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Edits a message. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.editMessage`.
   * @param callback Receives the result.
   */
  export function edit_message(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Deletes a message. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.deleteMessage`.
   * @param callback Receives the result.
   */
  export function delete_message(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the messages in a channel. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.fetchMessages`.
   * @param callback Receives the result.
   */
  export function fetch_messages(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the personal messages with another player. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.fetchPersonalMessages`.
   * @param callback Receives the result.
   */
  export function fetch_personal_messages(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the messages in a player's feed. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.fetchFeedMessages`.
   * @param callback Receives the result.
   */
  export function fetch_feed_messages(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the next page of a channel's messages. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.fetchMoreMessages`.
   * @param callback Receives the result.
   */
  export function fetch_more_messages(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the next page of the personal messages with another player. Raises when the table is
   * missing.
   * @param parameters The options for the SDK's `channels.fetchMorePersonalMessages`.
   * @param callback Receives the result.
   */
  export function fetch_more_personal_messages(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Fetches the next page of the messages in a player's feed. Raises when the table is missing.
   * @param parameters The options for the SDK's `channels.fetchMoreFeedMessages`.
   * @param callback Receives the result.
   */
  export function fetch_more_feed_messages(
    parameters: Record<string, unknown>,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Sets a value in a channel's state. Raises when the table is missing.
   * @param parameters The channel, key and value.
   * @param callback Receives the result.
   */
  export function set_value(
    parameters: ChannelValueParameters,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Adds to a number in a channel's state. Raises when the table is missing.
   * @param parameters The channel, key and amount.
   * @param callback Receives the result.
   */
  export function add_value(
    parameters: ChannelAddValueParameters,
    callback?: (result: unknown) => void,
  ): void;

  /** The channel event handlers. */
  export const callbacks: ChannelsCallbacks;
}

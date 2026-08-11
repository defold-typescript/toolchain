/** @noSelfInFile **/

/**
 * @see {@link https://github.com/heroiclabs/nakama-defold|Github Source}
 * @noResolution
 */
declare module 'nakama.socket' {
  /**
   * A connected realtime socket. `create` copies every module export but itself onto the
   * instance with the socket already applied, so each call below is the module function
   * of the same name minus its leading `socket` parameter. Registering a listener
   * replaces the bound method of that name, which is why a listener is registered once.
   */
  interface Socket {
    connect(callback?: (success: boolean, error?: string) => void): unknown;
    send(message: unknown, callback?: (message: unknown) => void): unknown;
    on_disconnect(fn: () => void): void;
    channel_join(
      target: string,
      type: number,
      persistence: boolean,
      hidden: boolean,
      callback?: (message: unknown) => void,
    ): unknown;
    channel_leave(channel_id: string, callback?: (message: unknown) => void): unknown;
    channel_message_send(
      channel_id: string,
      content: string,
      callback?: (message: unknown) => void,
    ): unknown;
    channel_message_remove(
      channel_id: string,
      message_id: string,
      callback?: (message: unknown) => void,
    ): unknown;
    channel_message_update(
      channel_id: string,
      message_id: string,
      content: string,
      callback?: (message: unknown) => void,
    ): unknown;
    match_data_send(
      match_id: string,
      op_code: number,
      data: string,
      presences: unknown,
      reliable: boolean,
      callback?: (message: unknown) => void,
    ): unknown;
    match_create(name: string | undefined, callback?: (message: unknown) => void): unknown;
    match_join(
      match_id: string | undefined,
      token: string | undefined,
      metadata: unknown,
      callback?: (message: unknown) => void,
    ): unknown;
    match_leave(match_id: string, callback?: (message: unknown) => void): unknown;
    matchmaker_add(
      min_count: number,
      max_count: number,
      query: string,
      string_properties: unknown,
      numeric_properties: unknown,
      count_multiple: number,
      callback?: (message: unknown) => void,
    ): unknown;
    matchmaker_remove(ticket: string, callback?: (message: unknown) => void): unknown;
    party_create(
      open: boolean,
      max_size: number,
      callback?: (message: unknown) => void,
    ): unknown;
    party_join(party_id: string, callback?: (message: unknown) => void): unknown;
    party_leave(party_id: string, callback?: (message: unknown) => void): unknown;
    party_promote(
      party_id: string,
      presence: unknown,
      callback?: (message: unknown) => void,
    ): unknown;
    party_accept(
      party_id: string,
      presence: unknown,
      callback?: (message: unknown) => void,
    ): unknown;
    party_remove(
      party_id: string,
      presence: unknown,
      callback?: (message: unknown) => void,
    ): unknown;
    party_close(party_id: string, callback?: (message: unknown) => void): unknown;
    party_join_request_list(party_id: string, callback?: (message: unknown) => void): unknown;
    party_matchmaker_add(
      party_id: string,
      min_count: number,
      max_count: number,
      query: string,
      string_properties: unknown,
      numeric_properties: unknown,
      count_multiple: number,
      callback?: (message: unknown) => void,
    ): unknown;
    party_matchmaker_remove(
      party_id: string,
      ticket: string,
      callback?: (message: unknown) => void,
    ): unknown;
    party_data_send(
      party_id: string,
      op_code: number,
      data: string,
      callback?: (message: unknown) => void,
    ): unknown;
    status_follow(
      user_ids: string,
      usernames: string,
      callback?: (message: unknown) => void,
    ): unknown;
    status_unfollow(user_ids: string, callback?: (message: unknown) => void): unknown;
    status_update(status: string, callback?: (message: unknown) => void): unknown;
    on_channel_presence_event(fn: (message: unknown) => void): void;
    on_match_presence_event(fn: (message: unknown) => void): void;
    on_match_data(fn: (message: unknown) => void): void;
    on_match(fn: (message: unknown) => void): void;
    on_matchmaker_matched(fn: (message: unknown) => void): void;
    on_notifications(fn: (message: unknown) => void): void;
    on_party_presence_event(fn: (message: unknown) => void): void;
    on_party(fn: (message: unknown) => void): void;
    on_party_data(fn: (message: unknown) => void): void;
    on_party_join_request(fn: (message: unknown) => void): void;
    on_party_leader(fn: (message: unknown) => void): void;
    on_status_presence_event(fn: (message: unknown) => void): void;
    on_status(fn: (message: unknown) => void): void;
    on_stream_data(fn: (message: unknown) => void): void;
    on_error(fn: (message: unknown) => void): void;
    on_channel_message(fn: (message: unknown) => void): void;
  }

  /** Unspecified channel type. The server treats it as a room. */
  const CHANNELTYPE_UNSPECIFIED: 0;
  /** A room anyone can join to chat in. */
  const CHANNELTYPE_ROOM: 1;
  /** A private channel for one-to-one chat. */
  const CHANNELTYPE_DIRECT_MESSAGE: 2;
  /** A channel for group chat. */
  const CHANNELTYPE_GROUP: 3;

  /** An unexpected result from the server. */
  const ERROR_RUNTIME_EXCEPTION: 0;
  /** The server received a message it does not recognise. */
  const ERROR_UNRECOGNIZED_PAYLOAD: 1;
  /** A message was expected but contains no content. */
  const ERROR_MISSING_PAYLOAD: 2;
  /** Fields in the message have an invalid format. */
  const ERROR_BAD_INPUT: 3;
  /** The match id was not found. */
  const ERROR_MATCH_NOT_FOUND: 4;
  /** The match join was rejected. */
  const ERROR_MATCH_JOIN_REJECTED: 5;
  /** The runtime function does not exist on the server. */
  const ERROR_RUNTIME_FUNCTION_NOT_FOUND: 6;
  /** The runtime function executed with an error. */
  const ERROR_RUNTIME_FUNCTION_EXCEPTION: 7;

  /**
   * Creates a realtime socket for a client, and binds every other export of this module
   * onto it. `nakama.create_socket` is the same call reached through the core module.
   * @param client A client created with `nakama.create_client`.
   */
  function create(client: unknown): Socket;

  /**
   * Opens the socket's websocket connection to the server.
   * @param socket A socket created with `create`.
   * @param callback Receives whether the connection succeeded, and the error if it did not.
   * @returns The result, when no callback is given.
   */
  function connect(
    socket: Socket,
    callback?: (success: boolean, error?: string) => void,
  ): unknown;

  /**
   * Sends a prepared message table on the socket. The calls below build their own
   * message tables and pass them through here.
   * @param socket A socket created with `create`.
   * @param message The message table to send.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function send(socket: Socket, message: unknown, callback?: (message: unknown) => void): unknown;

  /**
   * Registers the function to call when the connection drops. It is called with no
   * arguments, and replaces the socket's bound `on_disconnect` method.
   * @param socket A socket created with `create`.
   * @param fn Called on disconnect.
   */
  function on_disconnect(socket: Socket, fn: () => void): void;

  /**
   * Joins a chat channel.
   * @param socket A socket created with `create`.
   * @param target The room name, group id or user id to join, depending on `type`.
   * @param type One of the `CHANNELTYPE_*` constants.
   * @param persistence Store the channel's messages on the server.
   * @param hidden Join without appearing in the channel's presence list.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function channel_join(
    socket: Socket,
    target: string,
    type: number,
    persistence: boolean,
    hidden: boolean,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Leaves a chat channel.
   * @param socket A socket created with `create`.
   * @param channel_id The channel to leave.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function channel_leave(
    socket: Socket,
    channel_id: string,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Sends a message to a joined chat channel.
   * @param socket A socket created with `create`.
   * @param channel_id The channel to send to.
   * @param content The message content, as a JSON string.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function channel_message_send(
    socket: Socket,
    channel_id: string,
    content: string,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Removes a message previously sent to a chat channel.
   * @param socket A socket created with `create`.
   * @param channel_id The channel the message is in.
   * @param message_id The message to remove.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function channel_message_remove(
    socket: Socket,
    channel_id: string,
    message_id: string,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Replaces the content of a message previously sent to a chat channel.
   * @param socket A socket created with `create`.
   * @param channel_id The channel the message is in.
   * @param message_id The message to update.
   * @param content The replacement content, as a JSON string.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function channel_message_update(
    socket: Socket,
    channel_id: string,
    message_id: string,
    content: string,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Sends data to a joined match. The data is base64-encoded on the way out and decoded
   * again for the receiving `on_match_data` listener.
   * @param socket A socket created with `create`.
   * @param match_id The match to send to.
   * @param op_code The application-defined operation code.
   * @param data The payload.
   * @param presences The presences to send to, or nil for everyone in the match.
   * @param reliable Send over the reliable channel.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function match_data_send(
    socket: Socket,
    match_id: string,
    op_code: number,
    data: string,
    presences: unknown,
    reliable: boolean,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Creates a new authoritative-relayed match.
   * @param socket A socket created with `create`.
   * @param name The match name, or nil to let the server generate one.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function match_create(
    socket: Socket,
    name: string | undefined,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Joins a match by id, or by the token a matchmaker result carried. Exactly one of the
   * two identifiers is set; the other is nil.
   * @param socket A socket created with `create`.
   * @param match_id The match to join.
   * @param token The match token, when joining a matchmaker result.
   * @param metadata Metadata to present to the match's other members.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function match_join(
    socket: Socket,
    match_id: string | undefined,
    token: string | undefined,
    metadata: unknown,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Leaves a joined match.
   * @param socket A socket created with `create`.
   * @param match_id The match to leave.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function match_leave(
    socket: Socket,
    match_id: string,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Joins the matchmaker pool. The ticket the server returns is what
   * `matchmaker_remove` cancels with, and a match arrives through `on_matchmaker_matched`.
   * @param socket A socket created with `create`.
   * @param min_count The smallest acceptable match size.
   * @param max_count The largest acceptable match size.
   * @param query The matchmaker query to filter candidates by.
   * @param string_properties This user's string properties, for other queries to match on.
   * @param numeric_properties This user's numeric properties, for other queries to match on.
   * @param count_multiple Only form matches whose size is a multiple of this.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function matchmaker_add(
    socket: Socket,
    min_count: number,
    max_count: number,
    query: string,
    string_properties: unknown,
    numeric_properties: unknown,
    count_multiple: number,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Leaves the matchmaker pool.
   * @param socket A socket created with `create`.
   * @param ticket The ticket `matchmaker_add` returned.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function matchmaker_remove(
    socket: Socket,
    ticket: string,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Creates a party and makes this user its leader.
   * @param socket A socket created with `create`.
   * @param open Let users join without a join request.
   * @param max_size The largest number of members the party accepts.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function party_create(
    socket: Socket,
    open: boolean,
    max_size: number,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Joins a party, or requests to join one that is not open.
   * @param socket A socket created with `create`.
   * @param party_id The party to join.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function party_join(
    socket: Socket,
    party_id: string,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Leaves a party.
   * @param socket A socket created with `create`.
   * @param party_id The party to leave.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function party_leave(
    socket: Socket,
    party_id: string,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Promotes a party member to leader.
   * @param socket A socket created with `create`.
   * @param party_id The party the member is in.
   * @param presence The member's presence.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function party_promote(
    socket: Socket,
    party_id: string,
    presence: unknown,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Accepts a pending join request, as party leader.
   * @param socket A socket created with `create`.
   * @param party_id The party the request is for.
   * @param presence The requesting user's presence.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function party_accept(
    socket: Socket,
    party_id: string,
    presence: unknown,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Removes a member from the party, or rejects a pending join request.
   * @param socket A socket created with `create`.
   * @param party_id The party to remove from.
   * @param presence The member's presence.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function party_remove(
    socket: Socket,
    party_id: string,
    presence: unknown,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Closes the party to new members and disbands it, as party leader.
   * @param socket A socket created with `create`.
   * @param party_id The party to close.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function party_close(
    socket: Socket,
    party_id: string,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Lists the party's pending join requests.
   * @param socket A socket created with `create`.
   * @param party_id The party to list requests for.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function party_join_request_list(
    socket: Socket,
    party_id: string,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Joins the matchmaker pool as a whole party, as party leader.
   * @param socket A socket created with `create`.
   * @param party_id The party to match with.
   * @param min_count The smallest acceptable match size.
   * @param max_count The largest acceptable match size.
   * @param query The matchmaker query to filter candidates by.
   * @param string_properties The party's string properties, for other queries to match on.
   * @param numeric_properties The party's numeric properties, for other queries to match on.
   * @param count_multiple Only form matches whose size is a multiple of this.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function party_matchmaker_add(
    socket: Socket,
    party_id: string,
    min_count: number,
    max_count: number,
    query: string,
    string_properties: unknown,
    numeric_properties: unknown,
    count_multiple: number,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Takes the party back out of the matchmaker pool.
   * @param socket A socket created with `create`.
   * @param party_id The party to cancel for.
   * @param ticket The ticket `party_matchmaker_add` returned.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function party_matchmaker_remove(
    socket: Socket,
    party_id: string,
    ticket: string,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Sends data to every member of a party.
   * @param socket A socket created with `create`.
   * @param party_id The party to send to.
   * @param op_code The application-defined operation code.
   * @param data The payload.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function party_data_send(
    socket: Socket,
    party_id: string,
    op_code: number,
    data: string,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Subscribes to the status updates of the given users.
   * @param socket A socket created with `create`.
   * @param user_ids The user ids to follow.
   * @param usernames The usernames to follow.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function status_follow(
    socket: Socket,
    user_ids: string,
    usernames: string,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Unsubscribes from the status updates of the given users.
   * @param socket A socket created with `create`.
   * @param user_ids The user ids to unfollow.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function status_unfollow(
    socket: Socket,
    user_ids: string,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Sets this user's status message, or clears it when the status is empty.
   * @param socket A socket created with `create`.
   * @param status The status message to publish to followers.
   * @param callback Receives the server's response.
   * @returns The response, when no callback is given.
   */
  function status_update(
    socket: Socket,
    status: string,
    callback?: (message: unknown) => void,
  ): unknown;

  /**
   * Registers the function to call when someone joins or leaves a joined chat channel.
   * @param socket A socket created with `create`.
   * @param fn Receives the channel presence event.
   */
  function on_channel_presence_event(socket: Socket, fn: (message: unknown) => void): void;

  /**
   * Registers the function to call when someone joins or leaves a joined match.
   * @param socket A socket created with `create`.
   * @param fn Receives the match presence event.
   */
  function on_match_presence_event(socket: Socket, fn: (message: unknown) => void): void;

  /**
   * Registers the function to call when match data arrives. The payload is
   * base64-decoded before the listener sees it.
   * @param socket A socket created with `create`.
   * @param fn Receives the match data.
   */
  function on_match_data(socket: Socket, fn: (message: unknown) => void): void;

  /**
   * Registers the function to call when a match is created or joined.
   * @param socket A socket created with `create`.
   * @param fn Receives the match.
   */
  function on_match(socket: Socket, fn: (message: unknown) => void): void;

  /**
   * Registers the function to call when the matchmaker finds a match. Its token is what
   * `match_join` takes.
   * @param socket A socket created with `create`.
   * @param fn Receives the matchmaker result.
   */
  function on_matchmaker_matched(socket: Socket, fn: (message: unknown) => void): void;

  /**
   * Registers the function to call when notifications arrive for this user.
   * @param socket A socket created with `create`.
   * @param fn Receives the notifications.
   */
  function on_notifications(socket: Socket, fn: (message: unknown) => void): void;

  /**
   * Registers the function to call when someone joins or leaves a joined party.
   * @param socket A socket created with `create`.
   * @param fn Receives the party presence event.
   */
  function on_party_presence_event(socket: Socket, fn: (message: unknown) => void): void;

  /**
   * Registers the function to call when a party is created or joined.
   * @param socket A socket created with `create`.
   * @param fn Receives the party.
   */
  function on_party(socket: Socket, fn: (message: unknown) => void): void;

  /**
   * Registers the function to call when party data arrives.
   * @param socket A socket created with `create`.
   * @param fn Receives the party data.
   */
  function on_party_data(socket: Socket, fn: (message: unknown) => void): void;

  /**
   * Registers the function to call when someone asks to join a party this user leads.
   * @param socket A socket created with `create`.
   * @param fn Receives the join request.
   */
  function on_party_join_request(socket: Socket, fn: (message: unknown) => void): void;

  /**
   * Registers the function to call when a party changes leader.
   * @param socket A socket created with `create`.
   * @param fn Receives the new leader.
   */
  function on_party_leader(socket: Socket, fn: (message: unknown) => void): void;

  /**
   * Registers the function to call when a followed user comes online or goes offline.
   * @param socket A socket created with `create`.
   * @param fn Receives the status presence event.
   */
  function on_status_presence_event(socket: Socket, fn: (message: unknown) => void): void;

  /**
   * Registers the function to call when a followed user changes their status message.
   * @param socket A socket created with `create`.
   * @param fn Receives the status.
   */
  function on_status(socket: Socket, fn: (message: unknown) => void): void;

  /**
   * Registers the function to call when data arrives on a subscribed stream.
   * @param socket A socket created with `create`.
   * @param fn Receives the stream data.
   */
  function on_stream_data(socket: Socket, fn: (message: unknown) => void): void;

  /**
   * Registers the function to call when the server reports an error. Its code is one of
   * the `ERROR_*` constants.
   * @param socket A socket created with `create`.
   * @param fn Receives the error.
   */
  function on_error(socket: Socket, fn: (message: unknown) => void): void;

  /**
   * Registers the function to call when a message arrives on a joined chat channel.
   * @param socket A socket created with `create`.
   * @param fn Receives the channel message.
   */
  function on_channel_message(socket: Socket, fn: (message: unknown) => void): void;
}

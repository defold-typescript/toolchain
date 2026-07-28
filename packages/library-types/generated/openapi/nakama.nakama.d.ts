/** @noSelfInFile */
/** @noResolution */
declare module 'nakama.nakama' {
  /**
   * (synthesized)
   * Defold `nakama` API namespace.
   */
  export namespace nakama {
    /**
     * Add friends by ID or username to a user's account.
     *
     * @param ids - The account id of a user.
     * @param usernames - The account username of a user.
     */
    function add_friends(ids?: Record<string | number, unknown>, usernames?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Add users to a group.
     *
     * @param groupId - The group to add users to.
     * @param userIds - The users to add.
     */
    function add_group_users(groupId: string, userIds?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Authenticate a user with an Apple ID against the server.
     *
     * @param account - The Apple account details.
     * @param create - Register the account if the user does not already exist.
     * @param username - Set the username on the account at register. Must be unique.
     */
    function authenticate_apple(account: Record<string | number, unknown>, create?: boolean, username?: string): Record<string | number, unknown>;
    /**
     * Authenticate a user with a custom id against the server.
     *
     * @param account - The custom account details.
     * @param create - Register the account if the user does not already exist.
     * @param username - Set the username on the account at register. Must be unique.
     */
    function authenticate_custom(account: Record<string | number, unknown>, create?: boolean, username?: string): Record<string | number, unknown>;
    /**
     * Authenticate a user with a device id against the server.
     *
     * @param account - The device account details.
     * @param create - Register the account if the user does not already exist.
     * @param username - Set the username on the account at register. Must be unique.
     */
    function authenticate_device(account: Record<string | number, unknown>, create?: boolean, username?: string): Record<string | number, unknown>;
    /**
     * Authenticate a user with an email+password against the server.
     *
     * @param account - The email account details.
     * @param create - Register the account if the user does not already exist.
     * @param username - Set the username on the account at register. Must be unique.
     */
    function authenticate_email(account: Record<string | number, unknown>, create?: boolean, username?: string): Record<string | number, unknown>;
    /**
     * Authenticate a user with a Facebook OAuth token against the server.
     *
     * @param account - The Facebook account details.
     * @param create - Register the account if the user does not already exist.
     * @param username - Set the username on the account at register. Must be unique.
     * @param sync - Import Facebook friends for the user.
     */
    function authenticate_facebook(account: Record<string | number, unknown>, create?: boolean, username?: string, sync?: boolean): Record<string | number, unknown>;
    /**
     * Authenticate a user with a Facebook Instant Game token against the server.
     *
     * @param account - The Facebook Instant Game account details.
     * @param create - Register the account if the user does not already exist.
     * @param username - Set the username on the account at register. Must be unique.
     */
    function authenticate_facebook_instant_game(account: Record<string | number, unknown>, create?: boolean, username?: string): Record<string | number, unknown>;
    /**
     * Authenticate a user with Apple's GameCenter against the server.
     *
     * @param account - The Game Center account details.
     * @param create - Register the account if the user does not already exist.
     * @param username - Set the username on the account at register. Must be unique.
     */
    function authenticate_game_center(account: Record<string | number, unknown>, create?: boolean, username?: string): Record<string | number, unknown>;
    /**
     * Authenticate a user with Google against the server.
     *
     * @param account - The Google account details.
     * @param create - Register the account if the user does not already exist.
     * @param username - Set the username on the account at register. Must be unique.
     */
    function authenticate_google(account: Record<string | number, unknown>, create?: boolean, username?: string): Record<string | number, unknown>;
    /**
     * Authenticate a user with Steam against the server.
     *
     * @param account - The Steam account details.
     * @param create - Register the account if the user does not already exist.
     * @param username - Set the username on the account at register. Must be unique.
     * @param sync - Import Steam friends for the user.
     */
    function authenticate_steam(account: Record<string | number, unknown>, create?: boolean, username?: string, sync?: boolean): Record<string | number, unknown>;
    /**
     * Ban a set of users from a group.
     *
     * @param groupId - The group to ban users from.
     * @param userIds - The users to ban.
     */
    function ban_group_users(groupId: string, userIds?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Block one or more users by ID or username.
     *
     * @param ids - The account id of a user.
     * @param usernames - The account username of a user.
     */
    function block_friends(ids?: Record<string | number, unknown>, usernames?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * A user with additional account details. Always the current user.
     */
    function create_api_account(user?: Record<string | number, unknown>, wallet?: string, email?: string, devices?: Record<string | number, unknown>, customId?: string, verifyTime?: string, disableTime?: string): Record<string | number, unknown>;
    /**
     * Send a Apple Sign In token to the server. Used with authenticate/link/unlink.
     */
    function create_api_account_apple(token?: string, vars?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Send a custom ID to the server. Used with authenticate/link/unlink.
     */
    function create_api_account_custom(id?: string, vars?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Send a device to the server. Used with authenticate/link/unlink and user.
     */
    function create_api_account_device(id?: string, vars?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Send an email with password to the server. Used with authenticate/link/unlink.
     */
    function create_api_account_email(email?: string, password?: string, vars?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Send a Facebook token to the server. Used with authenticate/link/unlink.
     */
    function create_api_account_facebook(token?: string, vars?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Send a Facebook Instant Game token to the server. Used with authenticate/link/unlink.
     */
    function create_api_account_facebook_instant_game(signedPlayerInfo?: string, vars?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Send Apple's Game Center account credentials to the server. Used with authenticate/link/unlink.
     *
     * https://developer.apple.com/documentation/gamekit/gklocalplayer/1515407-generateidentityverificationsign
     */
    function create_api_account_game_center(playerId?: string, bundleId?: string, timestampSeconds?: string, salt?: string, signature?: string, publicKeyUrl?: string, vars?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Send a Google token to the server. Used with authenticate/link/unlink.
     */
    function create_api_account_google(token?: string, vars?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Send a Steam token to the server. Used with authenticate/link/unlink.
     */
    function create_api_account_steam(token?: string, vars?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * A message sent on a channel.
     */
    function create_api_channel_message(channelId?: string, messageId?: string, code?: number, senderId?: string, username?: string, content?: string, createTime?: string, updateTime?: string, persistent?: boolean, roomName?: string, groupId?: string, userIdOne?: string, userIdTwo?: string): Record<string | number, unknown>;
    /**
     * A list of channel messages, usually a result of a list operation.
     */
    function create_api_channel_message_list(messages?: Record<string | number, unknown>, nextCursor?: string, prevCursor?: string, cacheableCursor?: string): Record<string | number, unknown>;
    /**
     * Create a group with the current user as owner.
     */
    function create_api_create_group_request(name?: string, description?: string, langTag?: string, avatarUrl?: string, open?: boolean, maxCount?: number): Record<string | number, unknown>;
    /**
     * Storage objects to delete.
     */
    function create_api_delete_storage_object_id(collection?: string, key?: string, version?: string): Record<string | number, unknown>;
    /**
     * Batch delete storage objects.
     */
    function create_api_delete_storage_objects_request(objectIds?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Represents an event to be passed through the server to registered event handlers.
     */
    function create_api_event(name?: string, properties?: Record<string | number, unknown>, timestamp?: string, external?: boolean): Record<string | number, unknown>;
    /**
     * A friend of a user.
     */
    function create_api_friend(user?: Record<string | number, unknown>, state?: number, updateTime?: string): Record<string | number, unknown>;
    /**
     * A collection of zero or more friends of the user.
     */
    function create_api_friend_list(friends?: Record<string | number, unknown>, cursor?: string): Record<string | number, unknown>;
    /**
     * A group in the server.
     */
    function create_api_group(id?: string, creatorId?: string, name?: string, description?: string, langTag?: string, metadata?: string, avatarUrl?: string, open?: boolean, edgeCount?: number, maxCount?: number, createTime?: string, updateTime?: string): Record<string | number, unknown>;
    /**
     * One or more groups returned from a listing operation.
     */
    function create_api_group_list(groups?: Record<string | number, unknown>, cursor?: string): Record<string | number, unknown>;
    /**
     * A list of users belonging to a group, along with their role.
     */
    function create_api_group_user_list(groupUsers?: Record<string | number, unknown>, cursor?: string): Record<string | number, unknown>;
    /**
     * Represents a complete leaderboard record with all scores and associated metadata.
     */
    function create_api_leaderboard_record(leaderboardId?: string, ownerId?: string, username?: string, score?: string, subscore?: string, numScore?: number, metadata?: string, createTime?: string, updateTime?: string, expiryTime?: string, rank?: string, maxNumScore?: number): Record<string | number, unknown>;
    /**
     * A set of leaderboard records, may be part of a leaderboard records page or a batch of individual records.
     */
    function create_api_leaderboard_record_list(records?: Record<string | number, unknown>, ownerRecords?: Record<string | number, unknown>, nextCursor?: string, prevCursor?: string, rankCount?: string): Record<string | number, unknown>;
    /**
     * Link Steam to the current user's account.
     */
    function create_api_link_steam_request(account?: Record<string | number, unknown>, sync?: boolean): Record<string | number, unknown>;
    /**
     * List user subscriptions.
     */
    function create_api_list_subscriptions_request(limit?: number, cursor?: string): Record<string | number, unknown>;
    /**
     * Represents a realtime match.
     */
    function create_api_match(matchId?: string, authoritative?: boolean, label?: string, size?: number, tickRate?: number, handlerName?: string): Record<string | number, unknown>;
    /**
     * A list of realtime matches.
     */
    function create_api_match_list(matches?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * A notification in the server.
     */
    function create_api_notification(id?: string, subject?: string, content?: string, code?: number, senderId?: string, createTime?: string, persistent?: boolean): Record<string | number, unknown>;
    /**
     * A collection of zero or more notifications.
     */
    function create_api_notification_list(notifications?: Record<string | number, unknown>, cacheableCursor?: string): Record<string | number, unknown>;
    /**
     * Storage objects to get.
     */
    function create_api_read_storage_object_id(collection?: string, key?: string, userId?: string): Record<string | number, unknown>;
    /**
     * Batch get storage objects.
     */
    function create_api_read_storage_objects_request(objectIds?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Execute an Lua function on the server.
     */
    function create_api_rpc(id?: string, payload?: string, httpKey?: string): Record<string | number, unknown>;
    /**
     * A user's session used to authenticate messages.
     */
    function create_api_session(created?: boolean, token?: string, refreshToken?: string): Record<string | number, unknown>;
    /**
     * Log out a session, invalidate a refresh token, or log out all sessions/refresh tokens for a user.
     */
    function create_api_session_logout_request(token?: string, refreshToken?: string): Record<string | number, unknown>;
    /**
     * Authenticate against the server with a refresh token.
     */
    function create_api_session_refresh_request(token?: string, vars?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * An object within the storage engine.
     */
    function create_api_storage_object(collection?: string, key?: string, userId?: string, value?: string, version?: string, permissionRead?: number, permissionWrite?: number, createTime?: string, updateTime?: string): Record<string | number, unknown>;
    /**
     * A storage acknowledgement.
     */
    function create_api_storage_object_ack(collection?: string, key?: string, version?: string, userId?: string, createTime?: string, updateTime?: string): Record<string | number, unknown>;
    /**
     * Batch of acknowledgements for the storage object write.
     */
    function create_api_storage_object_acks(acks?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * List of storage objects.
     */
    function create_api_storage_object_list(objects?: Record<string | number, unknown>, cursor?: string): Record<string | number, unknown>;
    /**
     * Batch of storage objects.
     */
    function create_api_storage_objects(objects?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * A list of validated subscriptions stored by Nakama.
     */
    function create_api_subscription_list(validatedSubscriptions?: Record<string | number, unknown>, cursor?: string, prevCursor?: string): Record<string | number, unknown>;
    /**
     * A tournament on the server.
     */
    function create_api_tournament(id?: string, title?: string, description?: string, category?: number, sortOrder?: number, size?: number, maxSize?: number, maxNumScore?: number, canEnter?: boolean, endActive?: number, nextReset?: number, metadata?: string, createTime?: string, startTime?: string, endTime?: string, duration?: number, startActive?: number, prevReset?: number, operator?: Record<string | number, unknown>, authoritative?: boolean): Record<string | number, unknown>;
    /**
     * A list of tournaments.
     */
    function create_api_tournament_list(tournaments?: Record<string | number, unknown>, cursor?: string): Record<string | number, unknown>;
    /**
     * A set of tournament records which may be part of a tournament records page or a batch of individual records.
     */
    function create_api_tournament_record_list(records?: Record<string | number, unknown>, ownerRecords?: Record<string | number, unknown>, nextCursor?: string, prevCursor?: string, rankCount?: string): Record<string | number, unknown>;
    /**
     * Update a user's account details.
     */
    function create_api_update_account_request(username?: string, displayName?: string, avatarUrl?: string, langTag?: string, location?: string, timezone?: string): Record<string | number, unknown>;
    /**
     * A user in the server.
     */
    function create_api_user(id?: string, username?: string, displayName?: string, avatarUrl?: string, langTag?: string, location?: string, timezone?: string, metadata?: string, facebookId?: string, googleId?: string, gamecenterId?: string, steamId?: string, online?: boolean, edgeCount?: number, createTime?: string, updateTime?: string, facebookInstantGameId?: string, appleId?: string): Record<string | number, unknown>;
    /**
     * A list of groups belonging to a user, along with the user's role in each group.
     */
    function create_api_user_group_list(userGroups?: Record<string | number, unknown>, cursor?: string): Record<string | number, unknown>;
    /**
     * A collection of zero or more users.
     */
    function create_api_users(users?: Record<string | number, unknown>): Record<string | number, unknown>;
    function create_api_validate_purchase_apple_request(receipt?: string, persist?: boolean): Record<string | number, unknown>;
    function create_api_validate_purchase_facebook_instant_request(signedRequest?: string, persist?: boolean): Record<string | number, unknown>;
    function create_api_validate_purchase_google_request(purchase?: string, persist?: boolean): Record<string | number, unknown>;
    function create_api_validate_purchase_huawei_request(purchase?: string, signature?: string, persist?: boolean): Record<string | number, unknown>;
    /**
     * Validate IAP response.
     */
    function create_api_validate_purchase_response(validatedPurchases?: Record<string | number, unknown>): Record<string | number, unknown>;
    function create_api_validate_subscription_apple_request(receipt?: string, persist?: boolean): Record<string | number, unknown>;
    function create_api_validate_subscription_google_request(receipt?: string, persist?: boolean): Record<string | number, unknown>;
    /**
     * Validate Subscription response.
     */
    function create_api_validate_subscription_response(validatedSubscription?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Validated Purchase stored by Nakama.
     */
    function create_api_validated_purchase(userId?: string, productId?: string, transactionId?: string, store?: Record<string | number, unknown>, purchaseTime?: string, createTime?: string, updateTime?: string, refundTime?: string, providerResponse?: string, environment?: Record<string | number, unknown>, seenBefore?: boolean): Record<string | number, unknown>;
    function create_api_validated_subscription(userId?: string, productId?: string, originalTransactionId?: string, store?: Record<string | number, unknown>, purchaseTime?: string, createTime?: string, updateTime?: string, environment?: Record<string | number, unknown>, expiryTime?: string, refundTime?: string, providerResponse?: string, providerNotification?: string, active?: boolean): Record<string | number, unknown>;
    /**
     * The object to store.
     */
    function create_api_write_storage_object(collection?: string, key?: string, value?: string, version?: string, permissionRead?: number, permissionWrite?: number): Record<string | number, unknown>;
    /**
     * Write objects to the storage engine.
     */
    function create_api_write_storage_objects_request(objects?: Record<string | number, unknown>): Record<string | number, unknown>;
    function create_channel_join_message(target: string, type: number, persistence: Record<string | number, unknown>, hidden: Record<string | number, unknown>): void;
    function create_channel_leave_message(channel_id: string): void;
    function create_channel_message(id: string, presences: Record<string | number, unknown>, self: Record<string | number, unknown>, room_name: string, group_id: string, user_id_one: string, user_id_two: string): void;
    function create_channel_message_ack_message(channel_id: string, message_id: string, code: Record<string | number, unknown>, username: string, create_time: Record<string | number, unknown>, update_time: Record<string | number, unknown>, persistent: Record<string | number, unknown>, room_name: string, group_id: string, user_id_one: string, user_id_two: string): void;
    function create_channel_message_remove_message(channel_id: string, message_id: string): void;
    function create_channel_message_send_message(channel_id: string, content: string): void;
    function create_channel_message_update_message(channel_id: string, message_id: string, content: string): void;
    function create_channel_presence_event_message(channel_id: string, joins: Record<string | number, unknown>, leaves: Record<string | number, unknown>, room_name: string, group_id: string, user_id_one: string, user_id_two: string): void;
    function create_envelope_message(cid: string, channel?: Record<string | number, unknown>, channel_join?: Record<string | number, unknown>, channel_leave?: Record<string | number, unknown>, channel_message?: Record<string | number, unknown>, channel_message_ack?: Record<string | number, unknown>, channel_message_send?: Record<string | number, unknown>, channel_message_update?: Record<string | number, unknown>, channel_message_remove?: Record<string | number, unknown>, channel_presence_event?: Record<string | number, unknown>, error?: Record<string | number, unknown>, match?: Record<string | number, unknown>, match_create?: Record<string | number, unknown>, match_data?: Record<string | number, unknown>, match_data_send?: Record<string | number, unknown>, match_join?: Record<string | number, unknown>, match_leave?: Record<string | number, unknown>, match_presence_event?: Record<string | number, unknown>, matchmaker_add?: Record<string | number, unknown>, matchmaker_matched?: Record<string | number, unknown>, matchmaker_remove?: Record<string | number, unknown>, matchmaker_ticket?: Record<string | number, unknown>, notifications?: Record<string | number, unknown>, rpc?: Record<string | number, unknown>, status?: Record<string | number, unknown>, status_follow?: Record<string | number, unknown>, status_presence_event?: Record<string | number, unknown>, status_unfollow?: Record<string | number, unknown>, status_update?: Record<string | number, unknown>, stream_data?: Record<string | number, unknown>, stream_presence_event?: Record<string | number, unknown>, ping?: Record<string | number, unknown>, pong?: Record<string | number, unknown>, party?: Record<string | number, unknown>, party_create?: Record<string | number, unknown>, party_join?: Record<string | number, unknown>, party_leave?: Record<string | number, unknown>, party_promote?: Record<string | number, unknown>, party_leader?: Record<string | number, unknown>, party_accept?: Record<string | number, unknown>, party_remove?: Record<string | number, unknown>, party_close?: Record<string | number, unknown>, party_join_request_list?: Record<string | number, unknown>, party_join_request?: Record<string | number, unknown>, party_matchmaker_add?: Record<string | number, unknown>, party_matchmaker_remove?: Record<string | number, unknown>, party_matchmaker_ticket?: Record<string | number, unknown>, party_data?: Record<string | number, unknown>, party_data_send?: Record<string | number, unknown>, party_presence_event?: Record<string | number, unknown>): void;
    function create_error_message(code: number, message: string, context: Record<string | number, unknown>): void;
    /**
     * Create a new group with the current user as the owner.
     *
     * @param body - Create a group with the current user as owner.
     */
    function create_group(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * A single user-role pair.
     */
    function create_group_user_list_group_user(user?: Record<string | number, unknown>, state?: number): Record<string | number, unknown>;
    function create_match_create_message(name: string): void;
    function create_match_data_message(match_id: string, presence: Record<string | number, unknown>, op_code: number, data: string, reliable: boolean): void;
    function create_match_data_send_message(match_id: string, op_code: number, data: string, presences: Record<string | number, unknown>, reliable: boolean): void;
    function create_match_join_message(match_id: string | undefined, token: string | undefined, metadata: Record<string | number, unknown>): void;
    function create_match_leave_message(match_id: string): void;
    function create_match_message(match_id: string, authoritative: boolean, label: Record<string | number, unknown>, size: number, presences: Record<string | number, unknown>, self: Record<string | number, unknown>): void;
    function create_match_presence_event_message(match_id: string, joins: Record<string | number, unknown>, leaves: Record<string | number, unknown>): void;
    function create_matchmaker_add_message(min_count: number, max_count: number, query: string, string_properties: Record<string | number, unknown>, numeric_properties: Record<string | number, unknown>, count_multiple: Record<string | number, unknown>): void;
    function create_matchmaker_matched_message(ticket: string, match_id: string | undefined, token: string | undefined, users: Record<string | number, unknown>, self: Record<string | number, unknown>): void;
    function create_matchmaker_remove_message(ticket: string): void;
    function create_matchmaker_ticket_message(ticket: string): void;
    function create_notifications_message(notifications: Record<string | number, unknown>): void;
    function create_party_accept_message(party_id: string, presence: Record<string | number, unknown>): void;
    function create_party_close_message(party_id: string): void;
    function create_party_create_message(open: boolean, max_size: number): void;
    function create_party_data_message(party_id: string, presence: Record<string | number, unknown>, op_code: number, data: string): void;
    function create_party_data_send_message(party_id: string, op_code: number, data: string): void;
    function create_party_join_message(party_id: string): void;
    function create_party_join_request_list_message(party_id: string): void;
    function create_party_join_request_message(party_id: string, presences: Record<string | number, unknown>): void;
    function create_party_leader_message(party_id: string, presence: Record<string | number, unknown>): void;
    function create_party_leave_message(party_id: string): void;
    function create_party_matchmaker_add_message(party_id: string, min_count: number, max_count: number, query: string, string_properties: Record<string | number, unknown>, numeric_properties: Record<string | number, unknown>, count_multiple: Record<string | number, unknown>): void;
    function create_party_matchmaker_remove_message(party_id: string, ticket: string): void;
    function create_party_matchmaker_ticket_message(party_id: string, ticket: string): void;
    function create_party_message(party_id: string, open: boolean, max_size: number, self: Record<string | number, unknown>, leader: Record<string | number, unknown>, presences: Record<string | number, unknown>): void;
    function create_party_presence_event_message(party_id: string, joins: Record<string | number, unknown>, leaves: Record<string | number, unknown>): void;
    function create_party_promote_message(party_id: string, presence: Record<string | number, unknown>): void;
    function create_party_remove_message(party_id: string, presence: Record<string | number, unknown>): void;
    function create_ping_message(): void;
    function create_pong_message(): void;
    function create_protobuf_any(arg0?: string): Record<string | number, unknown>;
    function create_rpc_status(code?: number, message?: string, details?: Record<string | number, unknown>): Record<string | number, unknown>;
    function create_status_follow_message(user_ids: Record<string | number, unknown>, usernames: Record<string | number, unknown>): void;
    function create_status_message(presences: Record<string | number, unknown>): void;
    function create_status_presence_event_message(joins: Record<string | number, unknown>, leaves: Record<string | number, unknown>): void;
    function create_status_unfollow_message(user_ids: Record<string | number, unknown>): void;
    function create_status_update_message(status: Record<string | number, unknown>): void;
    function create_stream_data_message(stream: Record<string | number, unknown>, sender: Record<string | number, unknown>, data: string, reliable: boolean): void;
    function create_stream_message(mode: number, subject: string, subcontext: string, label: string): void;
    function create_stream_presence_event_message(stream: Record<string | number, unknown>, joins: Record<string | number, unknown>, leaves: Record<string | number, unknown>): void;
    /**
     * A single group-role pair.
     */
    function create_user_group_list_user_group(group?: Record<string | number, unknown>, state?: number): Record<string | number, unknown>;
    function create_user_presence_message(user_id: string, session_id: string, username: string, persistence: boolean, status: Record<string | number, unknown>): void;
    /**
     * Record values to write.
     */
    function create_write_leaderboard_record_request_leaderboard_record_write(score?: string, subscore?: string, metadata?: string, operator?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Record values to write.
     */
    function create_write_tournament_record_request_tournament_record_write(score?: string, subscore?: string, metadata?: string, operator?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Delete the current user's account.
     */
    function delete_account(): Record<string | number, unknown>;
    /**
     * Delete one or more users by ID or username.
     *
     * @param ids - The account id of a user.
     * @param usernames - The account username of a user.
     */
    function delete_friends(ids?: Record<string | number, unknown>, usernames?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Delete a group by ID.
     *
     * @param groupId - The id of a group.
     */
    function delete_group(groupId: string): Record<string | number, unknown>;
    /**
     * Delete a leaderboard record.
     *
     * @param leaderboardId - The leaderboard ID to delete from.
     */
    function delete_leaderboard_record(leaderboardId: string): Record<string | number, unknown>;
    /**
     * Delete one or more notifications for the current user.
     *
     * @param ids - The id of notifications.
     */
    function delete_notifications(ids?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Delete one or more objects by ID or username.
     *
     * @param body - Batch delete storage objects.
     */
    function delete_storage_objects(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Delete a tournament record.
     *
     * @param tournamentId - The tournament ID to delete from.
     */
    function delete_tournament_record(tournamentId: string): Record<string | number, unknown>;
    /**
     * Demote a set of users in a group to the next role down.
     *
     * @param groupId - The group ID to demote in.
     * @param userIds - The users to demote.
     */
    function demote_group_users(groupId: string, userIds?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Submit an event for processing in the server's registered runtime custom events handler.
     *
     * @param body - Represents an event to be passed through the server to registered event handlers.
     */
    function event(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Fetch the current user's account.
     */
    function get_account(): Record<string | number, unknown>;
    /**
     * Get subscription by product id.
     *
     * @param productId - Product id of the subscription
     */
    function get_subscription(productId: string): Record<string | number, unknown>;
    /**
     * Fetch zero or more users by ID and/or username.
     *
     * @param ids - The account id of a user.
     * @param usernames - The account username of a user.
     * @param facebookIds - The Facebook ID of a user.
     */
    function get_users(ids?: Record<string | number, unknown>, usernames?: Record<string | number, unknown>, facebookIds?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * A healthcheck which load balancers can use to check the service.
     */
    function healthcheck(): Record<string | number, unknown>;
    /**
     * Import Facebook friends and add them to a user's account.
     *
     * @param account - The Facebook account details.
     * @param reset - Reset the current user's friends list.
     */
    function import_facebook_friends(account: Record<string | number, unknown>, reset?: boolean): Record<string | number, unknown>;
    /**
     * Import Steam friends and add them to a user's account.
     *
     * @param account - The Facebook account details.
     * @param reset - Reset the current user's friends list.
     */
    function import_steam_friends(account: Record<string | number, unknown>, reset?: boolean): Record<string | number, unknown>;
    /**
     * Immediately join an open group, or request to join a closed one.
     *
     * @param groupId - The group ID to join. The group must already exist.
     */
    function join_group(groupId: string): Record<string | number, unknown>;
    /**
     * Attempt to join an open and running tournament.
     *
     * @param tournamentId - The ID of the tournament to join. The tournament must already exist.
     */
    function join_tournament(tournamentId: string): Record<string | number, unknown>;
    /**
     * Kick a set of users from a group.
     *
     * @param groupId - The group ID to kick from.
     * @param userIds - The users to kick.
     */
    function kick_group_users(groupId: string, userIds?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Leave a group the user is a member of.
     *
     * @param groupId - The group ID to leave.
     */
    function leave_group(groupId: string): Record<string | number, unknown>;
    /**
     * Add an Apple ID to the social profiles on the current user's account.
     *
     * @param body - Send a Apple Sign In token to the server. Used with authenticate/link/unlink.
     */
    function link_apple(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Add a custom ID to the social profiles on the current user's account.
     *
     * @param body - Send a custom ID to the server. Used with authenticate/link/unlink.
     */
    function link_custom(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Add a device ID to the social profiles on the current user's account.
     *
     * @param body - Send a device to the server. Used with authenticate/link/unlink and user.
     */
    function link_device(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Add an email+password to the social profiles on the current user's account.
     *
     * @param body - Send an email with password to the server. Used with authenticate/link/unlink.
     */
    function link_email(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Add Facebook to the social profiles on the current user's account.
     *
     * @param account - The Facebook account details.
     * @param sync - Import Facebook friends for the user.
     */
    function link_facebook(account: Record<string | number, unknown>, sync?: boolean): Record<string | number, unknown>;
    /**
     * Add Facebook Instant Game to the social profiles on the current user's account.
     *
     * @param body - Send a Facebook Instant Game token to the server. Used with authenticate/link/unlink.
     */
    function link_facebook_instant_game(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Add Apple's GameCenter to the social profiles on the current user's account.
     *
     * @param body - Send Apple's Game Center account credentials to the server. Used with authenticate/link/unlink.
     *
     * https://developer.apple.com/documentation/gamekit/gklocalplayer/1515407-generateidentityverificationsign
     */
    function link_game_center(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Add Google to the social profiles on the current user's account.
     *
     * @param body - Send a Google token to the server. Used with authenticate/link/unlink.
     */
    function link_google(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Add Steam to the social profiles on the current user's account.
     *
     * @param body - Link Steam to the current user's account.
     */
    function link_steam(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * List a channel's message history.
     *
     * @param channelId - The channel ID to list from.
     * @param limit - Max number of records to return. Between 1 and 100.
     * @param forward - True if listing should be older messages to newer, false if reverse.
     * @param cursor - A pagination cursor, if any.
     */
    function list_channel_messages(channelId: string, limit?: number, forward?: boolean, cursor?: string): Record<string | number, unknown>;
    /**
     * List all friends for the current user.
     *
     * @param limit - Max number of records to return. Between 1 and 100.
     * @param state - The friend state to list.
     * @param cursor - An optional next page cursor.
     */
    function list_friends(limit?: number, state?: number, cursor?: string): Record<string | number, unknown>;
    /**
     * List all users that are part of a group.
     *
     * @param groupId - The group ID to list from.
     * @param limit - Max number of records to return. Between 1 and 100.
     * @param state - The group user state to list.
     * @param cursor - An optional next page cursor.
     */
    function list_group_users(groupId: string, limit?: number, state?: number, cursor?: string): Record<string | number, unknown>;
    /**
     * List groups based on given filters.
     *
     * @param name - List groups that contain this value in their names.
     * @param cursor - Optional pagination cursor.
     * @param limit - Max number of groups to return. Between 1 and 100.
     * @param langTag - Language tag filter
     * @param members - Number of group members
     * @param open - Optional Open/Closed filter.
     */
    function list_groups(name?: string, cursor?: string, limit?: number, langTag?: string, members?: number, open?: boolean): Record<string | number, unknown>;
    /**
     * List leaderboard records.
     *
     * @param leaderboardId - The ID of the leaderboard to list for.
     * @param ownerIds - One or more owners to retrieve records for.
     * @param limit - Max number of records to return. Between 1 and 100.
     * @param cursor - A next or previous page cursor.
     * @param expiry - Expiry in seconds (since epoch) to begin fetching records from. Optional. 0 means from current time.
     */
    function list_leaderboard_records(leaderboardId: string, ownerIds?: Record<string | number, unknown>, limit?: number, cursor?: string, expiry?: string): Record<string | number, unknown>;
    /**
     * List leaderboard records that belong to a user.
     *
     * @param leaderboardId - The ID of the tournament to list for.
     * @param ownerId - The owner to retrieve records around.
     * @param limit - Max number of records to return. Between 1 and 100.
     * @param expiry - Expiry in seconds (since epoch) to begin fetching records from.
     * @param cursor - A next or previous page cursor.
     */
    function list_leaderboard_records_around_owner(leaderboardId: string, ownerId: string, limit?: number, expiry?: string, cursor?: string): Record<string | number, unknown>;
    /**
     * Fetch list of running matches.
     *
     * @param limit - Limit the number of returned matches.
     * @param authoritative - Authoritative or relayed matches.
     * @param label - Label filter.
     * @param minSize - Minimum user count.
     * @param maxSize - Maximum user count.
     * @param query - Arbitrary label query.
     */
    function list_matches(limit?: number, authoritative?: boolean, label?: string, minSize?: number, maxSize?: number, query?: string): Record<string | number, unknown>;
    /**
     * Fetch list of notifications.
     *
     * @param limit - The number of notifications to get. Between 1 and 100.
     * @param cacheableCursor - A cursor to page through notifications. May be cached by clients to get from point in time forwards.
     *
     * value from NotificationList.cacheable_cursor.
     */
    function list_notifications(limit?: number, cacheableCursor?: string): Record<string | number, unknown>;
    /**
     * List publicly readable storage objects in a given collection.
     *
     * @param collection - The collection which stores the object.
     * @param userId - ID of the user.
     * @param limit - The number of storage objects to list. Between 1 and 100.
     * @param cursor - The cursor to page through results from.
     *
     * value from StorageObjectList.cursor.
     */
    function list_storage_objects(collection: string, userId?: string, limit?: number, cursor?: string): Record<string | number, unknown>;
    /**
     * List publicly readable storage objects in a given collection.
     *
     * @param collection - The collection which stores the object.
     * @param userId - ID of the user.
     * @param limit - The number of storage objects to list. Between 1 and 100.
     * @param cursor - The cursor to page through results from.
     *
     * value from StorageObjectList.cursor.
     */
    function list_storage_objects2(collection: string, userId: string, limit?: number, cursor?: string): Record<string | number, unknown>;
    /**
     * List user's subscriptions.
     *
     * @param body - List user subscriptions.
     */
    function list_subscriptions(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * List tournament records.
     *
     * @param tournamentId - The ID of the tournament to list for.
     * @param ownerIds - One or more owners to retrieve records for.
     * @param limit - Max number of records to return. Between 1 and 100.
     * @param cursor - A next or previous page cursor.
     * @param expiry - Expiry in seconds (since epoch) to begin fetching records from.
     */
    function list_tournament_records(tournamentId: string, ownerIds?: Record<string | number, unknown>, limit?: number, cursor?: string, expiry?: string): Record<string | number, unknown>;
    /**
     * List tournament records for a given owner.
     *
     * @param tournamentId - The ID of the tournament to list for.
     * @param ownerId - The owner to retrieve records around.
     * @param limit - Max number of records to return. Between 1 and 100.
     * @param expiry - Expiry in seconds (since epoch) to begin fetching records from.
     * @param cursor - A next or previous page cursor.
     */
    function list_tournament_records_around_owner(tournamentId: string, ownerId: string, limit?: number, expiry?: string, cursor?: string): Record<string | number, unknown>;
    /**
     * List current or upcoming tournaments.
     *
     * @param categoryStart - The start of the categories to include. Defaults to 0.
     * @param categoryEnd - The end of the categories to include. Defaults to 128.
     * @param startTime - The start time for tournaments. Defaults to epoch.
     * @param endTime - The end time for tournaments. Defaults to +1 year from current Unix time.
     * @param limit - Max number of records to return. Between 1 and 100.
     * @param cursor - A next page cursor for listings (optional).
     */
    function list_tournaments(categoryStart?: number, categoryEnd?: number, startTime?: number, endTime?: number, limit?: number, cursor?: string): Record<string | number, unknown>;
    /**
     * List groups the current user belongs to.
     *
     * @param userId - ID of the user.
     * @param limit - Max number of records to return. Between 1 and 100.
     * @param state - The user group state to list.
     * @param cursor - An optional next page cursor.
     */
    function list_user_groups(userId: string, limit?: number, state?: number, cursor?: string): Record<string | number, unknown>;
    /**
     * Promote a set of users in a group to the next role up.
     *
     * @param groupId - The group ID to promote in.
     * @param userIds - The users to promote.
     */
    function promote_group_users(groupId: string, userIds?: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Get storage objects.
     *
     * @param body - Batch get storage objects.
     */
    function read_storage_objects(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Execute a Lua function on the server.
     *
     * @param id - The identifier of the function.
     * @param payload - The payload of the function which must be a JSON object.
     * @param httpKey - The authentication key used when executed as a non-client HTTP request.
     */
    function rpc_func(id: string, payload: string, httpKey?: string): Record<string | number, unknown>;
    /**
     * Execute a Lua function on the server.
     *
     * @param id - The identifier of the function.
     * @param payload - The payload of the function which must be a JSON object.
     * @param httpKey - The authentication key used when executed as a non-client HTTP request.
     */
    function rpc_func2(id: string, payload?: string, httpKey?: string): Record<string | number, unknown>;
    /**
     * Log out a session, invalidate a refresh token, or log out all sessions/refresh tokens for a user.
     *
     * @param body - Log out a session, invalidate a refresh token, or log out all sessions/refresh tokens for a user.
     */
    function session_logout(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Refresh a user's session using a refresh token retrieved from a previous authentication request.
     *
     * @param body - Authenticate against the server with a refresh token.
     */
    function session_refresh(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Remove the Apple ID from the social profiles on the current user's account.
     *
     * @param body - Send a Apple Sign In token to the server. Used with authenticate/link/unlink.
     */
    function unlink_apple(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Remove the custom ID from the social profiles on the current user's account.
     *
     * @param body - Send a custom ID to the server. Used with authenticate/link/unlink.
     */
    function unlink_custom(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Remove the device ID from the social profiles on the current user's account.
     *
     * @param body - Send a device to the server. Used with authenticate/link/unlink and user.
     */
    function unlink_device(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Remove the email+password from the social profiles on the current user's account.
     *
     * @param body - Send an email with password to the server. Used with authenticate/link/unlink.
     */
    function unlink_email(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Remove Facebook from the social profiles on the current user's account.
     *
     * @param body - Send a Facebook token to the server. Used with authenticate/link/unlink.
     */
    function unlink_facebook(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Remove Facebook Instant Game profile from the social profiles on the current user's account.
     *
     * @param body - Send a Facebook Instant Game token to the server. Used with authenticate/link/unlink.
     */
    function unlink_facebook_instant_game(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Remove Apple's GameCenter from the social profiles on the current user's account.
     *
     * @param body - Send Apple's Game Center account credentials to the server. Used with authenticate/link/unlink.
     *
     * https://developer.apple.com/documentation/gamekit/gklocalplayer/1515407-generateidentityverificationsign
     */
    function unlink_game_center(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Remove Google from the social profiles on the current user's account.
     *
     * @param body - Send a Google token to the server. Used with authenticate/link/unlink.
     */
    function unlink_google(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Remove Steam from the social profiles on the current user's account.
     *
     * @param body - Send a Steam token to the server. Used with authenticate/link/unlink.
     */
    function unlink_steam(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Update fields in the current user's account.
     *
     * @param body - Update a user's account details.
     */
    function update_account(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Update fields in a given group.
     *
     * @param groupId - The ID of the group to update.
     */
    function update_group(groupId: string, body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Validate Apple IAP Receipt
     */
    function validate_purchase_apple(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Validate FB Instant IAP Receipt
     */
    function validate_purchase_facebook_instant(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Validate Google IAP Receipt
     */
    function validate_purchase_google(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Validate Huawei IAP Receipt
     */
    function validate_purchase_huawei(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Validate Apple Subscription Receipt
     */
    function validate_subscription_apple(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Validate Google Subscription Receipt
     */
    function validate_subscription_google(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Write a record to a leaderboard.
     *
     * @param leaderboardId - The ID of the leaderboard to write to.
     * @param record - Record input.
     */
    function write_leaderboard_record(leaderboardId: string, record: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Write objects into the storage engine.
     *
     * @param body - Write objects to the storage engine.
     */
    function write_storage_objects(body: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Write a record to a tournament.
     *
     * @param tournamentId - The tournament ID to write the record for.
     * @param record - Record input.
     */
    function write_tournament_record(tournamentId: string, record: Record<string | number, unknown>): Record<string | number, unknown>;
    /**
     * Write a record to a tournament.
     *
     * @param tournamentId - The tournament ID to write the record for.
     * @param record - Record input.
     */
    function write_tournament_record2(tournamentId: string, record: Record<string | number, unknown>): Record<string | number, unknown>;
  }
}

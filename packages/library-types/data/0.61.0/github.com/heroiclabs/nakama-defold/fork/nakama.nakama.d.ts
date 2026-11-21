/** @noSelfInFile **/

/**
 * @see {@link https://github.com/heroiclabs/nakama-defold|Github Source}
 * @noResolution
 */
declare module 'nakama.nakama' {
  export type Client = symbol;

  export interface ClientConfig {
    host: string;
    port: number;
    use_ssl?: boolean;
    username: string;
    password: string;
    engine: unknown;
  }

  /**
   * Session variables: the string-to-string map Nakama bundles into the session token.
   * Upstream hands the table to `json.encode` as it is, so a string-keyed object literal
   * and a `LuaMap` reach the server the same way.
   */
  export type Vars = { [key: string]: string } | LuaMap<string, string>;

  /**
   * What an API call hands back when its request fails. `engine/defold.lua` replaces the
   * response with this table once its retries run out, and every call passes it on
   * unchanged, so test `"error" in result` before reading a response.
   */
  export interface ApiError {
    /** The server's error text, or `true` when the response could not be decoded. */
    error: string | true;
    /** The server's error message, or `Unable to decode response`. */
    message?: string;
    /** The status code the server sent with the error, if any. */
    code?: number;
  }

  /** The response of a call whose message has no fields: the empty table the server's
   * `{}` decodes to. */
  export type ApiEmpty = Record<string, never>;

  /** One of the `APIOPERATOR_*` values. */
  export type ApiOperator = "NO_OVERRIDE" | "BEST" | "SET" | "INCREMENT" | "DECREMENT";
  /** One of the `APISTOREENVIRONMENT_*` values. */
  export type ApiStoreEnvironment = "UNKNOWN" | "SANDBOX" | "PRODUCTION";
  /** One of the `APISTOREPROVIDER_*` values. */
  export type ApiStoreProvider =
    | "APPLE_APP_STORE"
    | "GOOGLE_PLAY_STORE"
    | "HUAWEI_APP_GALLERY"
    | "FACEBOOK_INSTANT_STORE";

  // A message as its `create_*` helper builds it and as an API call returns it. Every
  // helper asserts each field may be nil, and the server leaves a field at its default
  // out of the response, so every field is optional. A list's element type is not in the
  // Lua, so it stays `unknown[]`.

  /** The table `create_group_user_list_group_user` builds. */
  export interface GroupUserListGroupUser {
    state?: number;
    user?: ApiUser;
  }

  /** The table `create_user_group_list_user_group` builds. */
  export interface UserGroupListUserGroup {
    group?: ApiGroup;
    state?: number;
  }

  /** The table `create_write_leaderboard_record_request_leaderboard_record_write` builds. */
  export interface WriteLeaderboardRecordRequestLeaderboardRecordWrite {
    metadata?: string;
    operator?: ApiOperator;
    score?: string;
    subscore?: string;
  }

  /** The table `create_write_tournament_record_request_tournament_record_write` builds. */
  export interface WriteTournamentRecordRequestTournamentRecordWrite {
    metadata?: string;
    operator?: ApiOperator;
    score?: string;
    subscore?: string;
  }

  /** The table `create_api_account` builds. */
  export interface ApiAccount {
    custom_id?: string;
    devices?: unknown[];
    disable_time?: string;
    email?: string;
    user?: ApiUser;
    verify_time?: string;
    wallet?: string;
  }

  /** The table `create_api_account_apple` builds. */
  export interface ApiAccountApple {
    token?: string;
    vars?: Vars;
  }

  /** The table `create_api_account_custom` builds. */
  export interface ApiAccountCustom {
    id?: string;
    vars?: Vars;
  }

  /** The table `create_api_account_device` builds. */
  export interface ApiAccountDevice {
    id?: string;
    vars?: Vars;
  }

  /** The table `create_api_account_email` builds. */
  export interface ApiAccountEmail {
    email?: string;
    password?: string;
    vars?: Vars;
  }

  /** The table `create_api_account_facebook` builds. */
  export interface ApiAccountFacebook {
    token?: string;
    vars?: Vars;
  }

  /** The table `create_api_account_facebook_instant_game` builds. */
  export interface ApiAccountFacebookInstantGame {
    signed_player_info?: string;
    vars?: Vars;
  }

  /** The table `create_api_account_game_center` builds. */
  export interface ApiAccountGameCenter {
    bundle_id?: string;
    player_id?: string;
    public_key_url?: string;
    salt?: string;
    signature?: string;
    timestamp_seconds?: string;
    vars?: Vars;
  }

  /** The table `create_api_account_google` builds. */
  export interface ApiAccountGoogle {
    token?: string;
    vars?: Vars;
  }

  /** The table `create_api_account_steam` builds. */
  export interface ApiAccountSteam {
    token?: string;
    vars?: Vars;
  }

  /** The table `create_api_channel_message` builds. */
  export interface ApiChannelMessage {
    channel_id?: string;
    code?: number;
    content?: string;
    create_time?: string;
    group_id?: string;
    message_id?: string;
    persistent?: boolean;
    room_name?: string;
    sender_id?: string;
    update_time?: string;
    user_id_one?: string;
    user_id_two?: string;
    username?: string;
  }

  /** The table `create_api_channel_message_list` builds. */
  export interface ApiChannelMessageList {
    cacheable_cursor?: string;
    messages?: unknown[];
    next_cursor?: string;
    prev_cursor?: string;
  }

  /** The table `create_api_create_group_request` builds. */
  export interface ApiCreateGroupRequest {
    avatar_url?: string;
    description?: string;
    lang_tag?: string;
    max_count?: number;
    name?: string;
    open?: boolean;
  }

  /** The table `create_api_delete_storage_object_id` builds. */
  export interface ApiDeleteStorageObjectId {
    collection?: string;
    key?: string;
    version?: string;
  }

  /** The table `create_api_delete_storage_objects_request` builds. */
  export interface ApiDeleteStorageObjectsRequest {
    object_ids?: unknown[];
  }

  /** The table `create_api_event` builds. */
  export interface ApiEvent {
    external?: boolean;
    name?: string;
    properties?: unknown;
    timestamp?: string;
  }

  /** The table `create_api_friend` builds. */
  export interface ApiFriend {
    state?: number;
    update_time?: string;
    user?: ApiUser;
  }

  /** The table `create_api_friend_list` builds. */
  export interface ApiFriendList {
    cursor?: string;
    friends?: unknown[];
  }

  /** The table `create_api_group` builds. */
  export interface ApiGroup {
    avatar_url?: string;
    create_time?: string;
    creator_id?: string;
    description?: string;
    edge_count?: number;
    id?: string;
    lang_tag?: string;
    max_count?: number;
    metadata?: string;
    name?: string;
    open?: boolean;
    update_time?: string;
  }

  /** The table `create_api_group_list` builds. */
  export interface ApiGroupList {
    cursor?: string;
    groups?: unknown[];
  }

  /** The table `create_api_group_user_list` builds. */
  export interface ApiGroupUserList {
    cursor?: string;
    group_users?: unknown[];
  }

  /** The table `create_api_leaderboard_record` builds. */
  export interface ApiLeaderboardRecord {
    create_time?: string;
    expiry_time?: string;
    leaderboard_id?: string;
    max_num_score?: number;
    metadata?: string;
    num_score?: number;
    owner_id?: string;
    rank?: string;
    score?: string;
    subscore?: string;
    update_time?: string;
    username?: string;
  }

  /** The table `create_api_leaderboard_record_list` builds. */
  export interface ApiLeaderboardRecordList {
    next_cursor?: string;
    owner_records?: unknown[];
    prev_cursor?: string;
    rank_count?: string;
    records?: unknown[];
  }

  /** The table `create_api_link_steam_request` builds. */
  export interface ApiLinkSteamRequest {
    account?: ApiAccountSteam;
    sync?: boolean;
  }

  /** The table `create_api_list_subscriptions_request` builds. */
  export interface ApiListSubscriptionsRequest {
    cursor?: string;
    limit?: number;
  }

  /** The table `create_api_match` builds. */
  export interface ApiMatch {
    authoritative?: boolean;
    handler_name?: string;
    label?: string;
    match_id?: string;
    size?: number;
    tick_rate?: number;
  }

  /** The table `create_api_match_list` builds. */
  export interface ApiMatchList {
    matches?: unknown[];
  }

  /** The table `create_api_notification` builds. */
  export interface ApiNotification {
    code?: number;
    content?: string;
    create_time?: string;
    id?: string;
    persistent?: boolean;
    sender_id?: string;
    subject?: string;
  }

  /** The table `create_api_notification_list` builds. */
  export interface ApiNotificationList {
    cacheable_cursor?: string;
    notifications?: unknown[];
  }

  /** The table `create_api_read_storage_object_id` builds. */
  export interface ApiReadStorageObjectId {
    collection?: string;
    key?: string;
    user_id?: string;
  }

  /** The table `create_api_read_storage_objects_request` builds. */
  export interface ApiReadStorageObjectsRequest {
    object_ids?: unknown[];
  }

  /** The table `create_api_rpc` builds. */
  export interface ApiRpc {
    http_key?: string;
    id?: string;
    payload?: string;
  }

  /** The table `create_api_session` builds. */
  export interface ApiSession {
    created?: boolean;
    refresh_token?: string;
    token?: string;
  }

  /** The table `create_api_session_logout_request` builds. */
  export interface ApiSessionLogoutRequest {
    refresh_token?: string;
    token?: string;
  }

  /** The table `create_api_session_refresh_request` builds. */
  export interface ApiSessionRefreshRequest {
    token?: string;
    vars?: Vars;
  }

  /** The table `create_api_storage_object` builds. */
  export interface ApiStorageObject {
    collection?: string;
    create_time?: string;
    key?: string;
    permission_read?: number;
    permission_write?: number;
    update_time?: string;
    user_id?: string;
    value?: string;
    version?: string;
  }

  /** The table `create_api_storage_object_ack` builds. */
  export interface ApiStorageObjectAck {
    collection?: string;
    create_time?: string;
    key?: string;
    update_time?: string;
    user_id?: string;
    version?: string;
  }

  /** The table `create_api_storage_object_acks` builds. */
  export interface ApiStorageObjectAcks {
    acks?: unknown[];
  }

  /** The table `create_api_storage_object_list` builds. */
  export interface ApiStorageObjectList {
    cursor?: string;
    objects?: unknown[];
  }

  /** The table `create_api_storage_objects` builds. */
  export interface ApiStorageObjects {
    objects?: unknown[];
  }

  /** The table `create_api_subscription_list` builds. */
  export interface ApiSubscriptionList {
    cursor?: string;
    prev_cursor?: string;
    validated_subscriptions?: unknown[];
  }

  /** The table `create_api_tournament` builds. */
  export interface ApiTournament {
    authoritative?: boolean;
    can_enter?: boolean;
    category?: number;
    create_time?: string;
    description?: string;
    duration?: number;
    end_active?: number;
    end_time?: string;
    id?: string;
    max_num_score?: number;
    max_size?: number;
    metadata?: string;
    next_reset?: number;
    operator?: ApiOperator;
    prev_reset?: number;
    size?: number;
    sort_order?: number;
    start_active?: number;
    start_time?: string;
    title?: string;
  }

  /** The table `create_api_tournament_list` builds. */
  export interface ApiTournamentList {
    cursor?: string;
    tournaments?: unknown[];
  }

  /** The table `create_api_tournament_record_list` builds. */
  export interface ApiTournamentRecordList {
    next_cursor?: string;
    owner_records?: unknown[];
    prev_cursor?: string;
    rank_count?: string;
    records?: unknown[];
  }

  /** The table `create_api_update_account_request` builds. */
  export interface ApiUpdateAccountRequest {
    avatar_url?: string;
    display_name?: string;
    lang_tag?: string;
    location?: string;
    timezone?: string;
    username?: string;
  }

  /** The table `create_api_user` builds. */
  export interface ApiUser {
    apple_id?: string;
    avatar_url?: string;
    create_time?: string;
    display_name?: string;
    edge_count?: number;
    facebook_id?: string;
    facebook_instant_game_id?: string;
    gamecenter_id?: string;
    google_id?: string;
    id?: string;
    lang_tag?: string;
    location?: string;
    metadata?: string;
    online?: boolean;
    steam_id?: string;
    timezone?: string;
    update_time?: string;
    username?: string;
  }

  /** The table `create_api_user_group_list` builds. */
  export interface ApiUserGroupList {
    cursor?: string;
    user_groups?: unknown[];
  }

  /** The table `create_api_users` builds. */
  export interface ApiUsers {
    users?: unknown[];
  }

  /** The table `create_api_validate_purchase_apple_request` builds. */
  export interface ApiValidatePurchaseAppleRequest {
    persist?: boolean;
    receipt?: string;
  }

  /** The table `create_api_validate_purchase_facebook_instant_request` builds. */
  export interface ApiValidatePurchaseFacebookInstantRequest {
    persist?: boolean;
    signed_request?: string;
  }

  /** The table `create_api_validate_purchase_google_request` builds. */
  export interface ApiValidatePurchaseGoogleRequest {
    persist?: boolean;
    purchase?: string;
  }

  /** The table `create_api_validate_purchase_huawei_request` builds. */
  export interface ApiValidatePurchaseHuaweiRequest {
    persist?: boolean;
    purchase?: string;
    signature?: string;
  }

  /** The table `create_api_validate_purchase_response` builds. */
  export interface ApiValidatePurchaseResponse {
    validated_purchases?: unknown[];
  }

  /** The table `create_api_validate_subscription_apple_request` builds. */
  export interface ApiValidateSubscriptionAppleRequest {
    persist?: boolean;
    receipt?: string;
  }

  /** The table `create_api_validate_subscription_google_request` builds. */
  export interface ApiValidateSubscriptionGoogleRequest {
    persist?: boolean;
    receipt?: string;
  }

  /** The table `create_api_validate_subscription_response` builds. */
  export interface ApiValidateSubscriptionResponse {
    validated_subscription?: ApiValidatedSubscription;
  }

  /** The table `create_api_validated_purchase` builds. */
  export interface ApiValidatedPurchase {
    create_time?: string;
    environment?: ApiStoreEnvironment;
    product_id?: string;
    provider_response?: string;
    purchase_time?: string;
    refund_time?: string;
    seen_before?: boolean;
    store?: ApiStoreProvider;
    transaction_id?: string;
    update_time?: string;
    user_id?: string;
  }

  /** The table `create_api_validated_subscription` builds. */
  export interface ApiValidatedSubscription {
    active?: boolean;
    create_time?: string;
    environment?: ApiStoreEnvironment;
    expiry_time?: string;
    original_transaction_id?: string;
    product_id?: string;
    provider_notification?: string;
    provider_response?: string;
    purchase_time?: string;
    refund_time?: string;
    store?: ApiStoreProvider;
    update_time?: string;
    user_id?: string;
  }

  /** The table `create_api_write_storage_object` builds. */
  export interface ApiWriteStorageObject {
    collection?: string;
    key?: string;
    permission_read?: number;
    permission_write?: number;
    value?: string;
    version?: string;
  }

  /** The table `create_api_write_storage_objects_request` builds. */
  export interface ApiWriteStorageObjectsRequest {
    objects?: unknown[];
  }

  /** The table `create_protobuf_any` builds. */
  export interface ProtobufAny {
    "@type"?: string;
  }

  /** The table `create_rpc_status` builds. */
  export interface RpcStatus {
    code?: number;
    details?: unknown[];
    message?: string;
  }


  /** The retry policy `nakama.util.retries` builds; opaque here, that module not being
   * vendored by this target. */
  export type RetryPolicy = symbol;

  /** Cancels an in-flight call, or a whole `sync` block. Upstream builds it as a table
   * carrying its own `cancel`, and `nakama.cancel(token)` sets the same flag. */
  export interface CancellationToken {
    cancelled: boolean;
    cancel(this: void): void;
  }

  /**
   * Operator that can be used to override the one set in the leaderboard.
   *
   * - NO_OVERRIDE: Do not override the leaderboard operator.
   * - BEST: Override the leaderboard operator with BEST.
   * - SET: Override the leaderboard operator with SET.
   * - INCREMENT: Override the leaderboard operator with INCREMENT.
   * - DECREMENT: Override the leaderboard operator with DECREMENT.
    * @upstreamDoc d3b8801c8eef
   */
  export const APIOPERATOR_NO_OVERRIDE: "NO_OVERRIDE";
  export const APIOPERATOR_BEST: "BEST";
  export const APIOPERATOR_SET: "SET";
  export const APIOPERATOR_INCREMENT: "INCREMENT";
  export const APIOPERATOR_DECREMENT: "DECREMENT";

  /**
   * - UNKNOWN: Unknown environment.
   * - SANDBOX: Sandbox/test environment.
   * - PRODUCTION: Production environment.
    * @upstreamDoc d37ddd4bbdce
   */
  export const APISTOREENVIRONMENT_UNKNOWN: "UNKNOWN";
  export const APISTOREENVIRONMENT_SANDBOX: "SANDBOX";
  export const APISTOREENVIRONMENT_PRODUCTION: "PRODUCTION";

  /**
   * - APPLE_APP_STORE: Apple App Store
   * - GOOGLE_PLAY_STORE: Google Play Store
   * - HUAWEI_APP_GALLERY: Huawei App Gallery
   * - FACEBOOK_INSTANT_STORE: Facebook Instant Store
    * @upstreamDoc 1c2fb74ac101
   */
  export const APISTOREPROVIDER_APPLE_APP_STORE: "APPLE_APP_STORE";
  export const APISTOREPROVIDER_GOOGLE_PLAY_STORE: "GOOGLE_PLAY_STORE";
  export const APISTOREPROVIDER_HUAWEI_APP_GALLERY: "HUAWEI_APP_GALLERY";
  export const APISTOREPROVIDER_FACEBOOK_INSTANT_STORE: "FACEBOOK_INSTANT_STORE";

  /** Cancel a token, stopping the API calls it was passed to. */
  export function cancel(token: CancellationToken): void;
  /**
   * Create a cancellation token. Pass it to {@link sync} or to any API call to be
   * able to cancel an ongoing call, or a whole sequence of them, later.
   */
  export function cancellation_token(): CancellationToken;
  /**
   * Run `fn` inside a coroutine, so the API calls it makes can yield.
   * @param fn The code to run.
   * @param cancellation_token Optional token that cancels the running code.
   */
  export function sync(fn: () => void, cancellation_token?: CancellationToken): void;
  export function create_group_user_list_group_user(state_int: number, user_api_user: ApiUser | undefined): GroupUserListGroupUser;
  export function create_user_group_list_user_group(group_api_group: ApiGroup | undefined, state_int: number): UserGroupListUserGroup;
  export function create_write_leaderboard_record_request_leaderboard_record_write(
    metadata_str: string,
    operator_api_operator: ApiOperator | undefined,
    score_str: string,
    subscore_str: string,
  ): WriteLeaderboardRecordRequestLeaderboardRecordWrite;
  export function create_write_tournament_record_request_tournament_record_write(
    metadata_str: string,
    operator_api_operator: ApiOperator | undefined,
    score_str: string,
    subscore_str: string,
  ): WriteTournamentRecordRequestTournamentRecordWrite;
  export function create_api_account(
    custom_id_str: string,
    devices_arr: unknown[],
    disable_time_str: string,
    email_str: string,
    user_api_user: ApiUser | undefined,
    verify_time_str: string,
    wallet_str: string,
  ): ApiAccount;
  export function create_api_account_apple(token_str: string, vars_obj: Vars | undefined): ApiAccountApple;
  export function create_api_account_custom(id_str: string, vars_obj: Vars | undefined): ApiAccountCustom;
  export function create_api_account_device(id_str: string, vars_obj: Vars | undefined): ApiAccountDevice;
  export function create_api_account_email(email_str: string, password_str: string, vars_obj: Vars | undefined): ApiAccountEmail;
  export function create_api_account_facebook(token_str: string, vars_obj: Vars | undefined): ApiAccountFacebook;
  export function create_api_account_facebook_instant_game(
    signed_player_info_str: string,
    vars_obj: Vars | undefined,
  ): ApiAccountFacebookInstantGame;
  export function create_api_account_game_center(
    bundle_id_str: string,
    player_id_str: string,
    public_key_url_str: string,
    salt_str: string,
    signature_str: string,
    timestamp_seconds_str: string,
    vars_obj: Vars | undefined,
  ): ApiAccountGameCenter;
  export function create_api_account_google(token_str: string, vars_obj: Vars | undefined): ApiAccountGoogle;
  export function create_api_account_steam(token_str: string, vars_obj: Vars | undefined): ApiAccountSteam;
  export function create_api_channel_message(
    channel_id_str: string,
    code_int: number,
    content_str: string,
    create_time_str: string,
    group_id_str: string,
    message_id_str: string,
    persistent_bool: boolean,
    room_name_str: string,
    sender_id_str: string,
    update_time_str: string,
    user_id_one_str: string,
    user_id_two_str: string,
    username_str: string,
  ): ApiChannelMessage;
  export function create_api_channel_message_list(
    cacheable_cursor_str: string,
    messages_arr: unknown[],
    next_cursor_str: string,
    prev_cursor_str: string,
  ): ApiChannelMessageList;
  export function create_api_create_group_request(
    avatar_url_str: string,
    description_str: string,
    lang_tag_str: string,
    max_count_int: number,
    name_str: string,
    open_bool: boolean,
  ): ApiCreateGroupRequest;
  export function create_api_delete_storage_object_id(
    collection_str: string,
    key_str: string,
    version_str: string,
  ): ApiDeleteStorageObjectId;
  export function create_api_delete_storage_objects_request(object_ids_arr: unknown[]): ApiDeleteStorageObjectsRequest;
  export function create_api_event(
    external_bool: boolean,
    name_str: string,
    properties_obj: unknown,
    timestamp_str: string,
  ): ApiEvent;
  export function create_api_friend(state_int: number, update_time_str: string, user_api_user: ApiUser | undefined): ApiFriend;
  export function create_api_friend_list(cursor_str: string, friends_arr: unknown[]): ApiFriendList;
  export function create_api_group(
    avatar_url_str: string,
    create_time_str: string,
    creator_id_str: string,
    description_str: string,
    edge_count_int: number,
    id_str: string,
    lang_tag_str: string,
    max_count_int: number,
    metadata_str: string,
    name_str: string,
    open_bool: boolean,
    update_time_str: string,
  ): ApiGroup;
  export function create_api_group_list(cursor_str: string, groups_arr: unknown[]): ApiGroupList;
  export function create_api_group_user_list(cursor_str: string, group_users_arr: unknown[]): ApiGroupUserList;
  export function create_api_leaderboard_record(
    create_time_str: string,
    expiry_time_str: string,
    leaderboard_id_str: string,
    max_num_score_int: number,
    metadata_str: string,
    num_score_int: number,
    owner_id_str: string,
    rank_str: string,
    score_str: string,
    subscore_str: string,
    update_time_str: string,
    username_str: string,
  ): ApiLeaderboardRecord;
  export function create_api_leaderboard_record_list(
    next_cursor_str: string,
    owner_records_arr: unknown[],
    prev_cursor_str: string,
    rank_count_str: string,
    records_arr: unknown[],
  ): ApiLeaderboardRecordList;
  export function create_api_link_steam_request(account_api_account_steam: ApiAccountSteam | undefined, sync_bool: boolean): ApiLinkSteamRequest;
  export function create_api_list_subscriptions_request(cursor_str: string, limit_int: number): ApiListSubscriptionsRequest;
  export function create_api_match(
    authoritative_bool: boolean,
    handler_name_str: string,
    label_str: string,
    match_id_str: string,
    size_int: number,
    tick_rate_int: number,
  ): ApiMatch;
  export function create_api_match_list(matches_arr: unknown[]): ApiMatchList;
  export function create_api_notification(
    code_int: number,
    content_str: string,
    create_time_str: string,
    id_str: string,
    persistent_bool: boolean,
    sender_id_str: string,
    subject_str: string,
  ): ApiNotification;
  export function create_api_notification_list(
    cacheable_cursor_str: string,
    notifications_arr: unknown[],
  ): ApiNotificationList;
  export function create_api_read_storage_object_id(
    collection_str: string,
    key_str: string,
    user_id_str: string,
  ): ApiReadStorageObjectId;
  export function create_api_read_storage_objects_request(object_ids_arr: unknown[]): ApiReadStorageObjectsRequest;
  export function create_api_rpc(http_key_str: string, id_str: string, payload_str: string): ApiRpc;
  export function create_api_session(
    created_bool: boolean,
    refresh_token_str: string,
    token_str: string,
  ): ApiSession;
  export function create_api_session_logout_request(refresh_token_str: string, token_str: string): ApiSessionLogoutRequest;
  export function create_api_session_refresh_request(token_str: string, vars_obj: Vars | undefined): ApiSessionRefreshRequest;
  export function create_api_storage_object(
    collection_str: string,
    create_time_str: string,
    key_str: string,
    permission_read_int: number,
    permission_write_int: number,
    update_time_str: string,
    user_id_str: string,
    value_str: string,
    version_str: string,
  ): ApiStorageObject;
  export function create_api_storage_object_ack(
    collection_str: string,
    create_time_str: string,
    key_str: string,
    update_time_str: string,
    user_id_str: string,
    version_str: string,
  ): ApiStorageObjectAck;
  export function create_api_storage_object_acks(acks_arr: unknown[]): ApiStorageObjectAcks;
  export function create_api_storage_object_list(cursor_str: string, objects_arr: unknown[]): ApiStorageObjectList;
  export function create_api_storage_objects(objects_arr: unknown[]): ApiStorageObjects;
  export function create_api_subscription_list(
    cursor_str: string,
    prev_cursor_str: string,
    validated_subscriptions_arr: unknown[],
  ): ApiSubscriptionList;
  export function create_api_tournament(
    authoritative_bool: boolean,
    can_enter_bool: boolean,
    category_int: number,
    create_time_str: string,
    description_str: string,
    duration_int: number,
    end_active_int: number,
    end_time_str: string,
    id_str: string,
    max_num_score_int: number,
    max_size_int: number,
    metadata_str: string,
    next_reset_int: number,
    operator_api_operator: ApiOperator | undefined,
    prev_reset_int: number,
    size_int: number,
    sort_order_int: number,
    start_active_int: number,
    start_time_str: string,
    title_str: string,
  ): ApiTournament;
  export function create_api_tournament_list(cursor_str: string, tournaments_arr: unknown[]): ApiTournamentList;
  export function create_api_tournament_record_list(
    next_cursor_str: string,
    owner_records_arr: unknown[],
    prev_cursor_str: string,
    rank_count_str: string,
    records_arr: unknown[],
  ): ApiTournamentRecordList;
  export function create_api_update_account_request(
    avatar_url_str: string,
    display_name_str: string,
    lang_tag_str: string,
    location_str: string,
    timezone_str: string,
    username_str: string,
  ): ApiUpdateAccountRequest;
  export function create_api_user(
    apple_id_str: string,
    avatar_url_str: string,
    create_time_str: string,
    display_name_str: string,
    edge_count_int: number,
    facebook_id_str: string,
    facebook_instant_game_id_str: string,
    gamecenter_id_str: string,
    google_id_str: string,
    id_str: string,
    lang_tag_str: string,
    location_str: string,
    metadata_str: string,
    online_bool: boolean,
    steam_id_str: string,
    timezone_str: string,
    update_time_str: string,
    username_str: string,
  ): ApiUser;
  export function create_api_user_group_list(cursor_str: string, user_groups_arr: unknown[]): ApiUserGroupList;
  export function create_api_users(users_arr: unknown[]): ApiUsers;
  export function create_api_validate_purchase_apple_request(
    persist_bool: boolean,
    receipt_str: string,
  ): ApiValidatePurchaseAppleRequest;
  export function create_api_validate_purchase_facebook_instant_request(
    persist_bool: boolean,
    signed_request_str: string,
  ): ApiValidatePurchaseFacebookInstantRequest;
  export function create_api_validate_purchase_google_request(
    persist_bool: boolean,
    purchase_str: string,
  ): ApiValidatePurchaseGoogleRequest;
  export function create_api_validate_purchase_huawei_request(
    persist_bool: boolean,
    purchase_str: string,
    signature_str: string,
  ): ApiValidatePurchaseHuaweiRequest;
  export function create_api_validate_purchase_response(validated_purchases_arr: unknown[]): ApiValidatePurchaseResponse;
  export function create_api_validate_subscription_apple_request(
    persist_bool: boolean,
    receipt_str: string,
  ): ApiValidateSubscriptionAppleRequest;
  export function create_api_validate_subscription_google_request(
    persist_bool: boolean,
    receipt_str: string,
  ): ApiValidateSubscriptionGoogleRequest;
  export function create_api_validate_subscription_response(
    validated_subscription_api_validated_subscription: ApiValidatedSubscription | undefined,
  ): ApiValidateSubscriptionResponse;
  export function create_api_validated_purchase(
    create_time_str: string,
    environment_api_store_environment: ApiStoreEnvironment | undefined,
    product_id_str: string,
    provider_response_str: string,
    purchase_time_str: string,
    refund_time_str: string,
    seen_before_bool: boolean,
    store_api_store_provider: ApiStoreProvider | undefined,
    transaction_id_str: string,
    update_time_str: string,
    user_id_str: string,
  ): ApiValidatedPurchase;
  export function create_api_validated_subscription(
    active_bool: boolean,
    create_time_str: string,
    environment_api_store_environment: ApiStoreEnvironment | undefined,
    expiry_time_str: string,
    original_transaction_id_str: string,
    product_id_str: string,
    provider_notification_str: string,
    provider_response_str: string,
    purchase_time_str: string,
    refund_time_str: string,
    store_api_store_provider: ApiStoreProvider | undefined,
    update_time_str: string,
    user_id_str: string,
  ): ApiValidatedSubscription;
  export function create_api_write_storage_object(
    collection_str: string,
    key_str: string,
    permission_read_int: number,
    permission_write_int: number,
    value_str: string,
    version_str: string,
  ): ApiWriteStorageObject;
  export function create_api_write_storage_objects_request(objects_arr: unknown[]): ApiWriteStorageObjectsRequest;
  export function create_protobuf_any(type_str: string): ProtobufAny;
  export function create_rpc_status(code_int: number, details_arr: unknown[], message_str: string): RpcStatus;
  export function healthcheck(
    client: Client,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function delete_account(
    client: Client,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function get_account(
    client: Client,
    callback?: (result: ApiAccount | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiAccount | ApiError | undefined;
  export function update_account(
    client: Client,
    avatarUrl: string,
    displayName: string,
    langTag: string,
    location: string,
    timezone: string,
    username: string,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function authenticate_apple(
    client: Client,
    token: string,
    vars: Vars | undefined,
    create_bool: boolean,
    username_str: string,
    callback?: (result: import("nakama.session").Session | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): import("nakama.session").Session | ApiError | undefined;
  export function authenticate_custom(
    client: Client,
    id: string,
    vars: Vars | undefined,
    create_bool: boolean,
    username_str: string,
    callback?: (result: import("nakama.session").Session | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): import("nakama.session").Session | ApiError | undefined;
  export function authenticate_device(
    client: Client,
    id: string,
    vars: Vars | undefined,
    create_bool: boolean,
    username_str: string,
    callback?: (result: import("nakama.session").Session | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): import("nakama.session").Session | ApiError | undefined;
  export function authenticate_email(
    client: Client,
    email: string,
    password: string,
    vars: Vars | undefined,
    create_bool: boolean,
    username_str: string,
    callback?: (result: import("nakama.session").Session | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): import("nakama.session").Session | ApiError | undefined;
  export function authenticate_facebook(
    client: Client,
    token: string,
    vars: Vars | undefined,
    create_bool: boolean,
    username_str: string,
    sync_bool: boolean,
    callback?: (result: import("nakama.session").Session | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): import("nakama.session").Session | ApiError | undefined;
  export function authenticate_facebook_instant_game(
    client: Client,
    signedPlayerInfo: string,
    vars: Vars | undefined,
    create_bool: boolean,
    username_str: string,
    callback?: (result: import("nakama.session").Session | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): import("nakama.session").Session | ApiError | undefined;
  export function authenticate_game_center(
    client: Client,
    bundleId: string,
    playerId: string,
    publicKeyUrl: string,
    salt: string,
    signature: string,
    timestampSeconds: number,
    vars: Vars | undefined,
    create_bool: boolean,
    username_str: string,
    callback?: (result: import("nakama.session").Session | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): import("nakama.session").Session | ApiError | undefined;
  export function authenticate_google(
    client: Client,
    token: string,
    vars: Vars | undefined,
    create_bool: boolean,
    username_str: string,
    callback?: (result: import("nakama.session").Session | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): import("nakama.session").Session | ApiError | undefined;
  export function authenticate_steam(
    client: Client,
    token: string,
    vars: Vars | undefined,
    create_bool: boolean,
    username_str: string,
    sync_bool: boolean,
    callback?: (result: import("nakama.session").Session | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): import("nakama.session").Session | ApiError | undefined;
  export function link_apple(
    client: Client,
    token: string,
    vars?: Vars,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function link_custom(
    client: Client,
    id: string,
    vars?: Vars,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function link_device(
    client: Client,
    id: string,
    vars?: Vars,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function link_email(
    client: Client,
    email: string,
    password: string,
    vars?: Vars,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function link_facebook(
    client: Client,
    token: string,
    vars: Vars | undefined,
    sync_bool: boolean,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function link_facebook_instant_game(
    client: Client,
    signedPlayerInfo: string,
    vars?: Vars,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function link_game_center(
    client: Client,
    bundleId: string,
    playerId: string,
    publicKeyUrl: string,
    salt: string,
    signature: string,
    timestampSeconds: number,
    vars?: Vars,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function link_google(
    client: Client,
    token: string,
    vars?: Vars,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function link_steam(
    client: Client,
    account: unknown,
    sync: boolean,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function session_refresh(
    client: Client,
    token: string,
    vars?: Vars,
    callback?: (result: import("nakama.session").Session | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): import("nakama.session").Session | ApiError | undefined;
  export function unlink_apple(
    client: Client,
    token: string,
    vars?: Vars,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function unlink_custom(
    client: Client,
    id: string,
    vars?: Vars,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function unlink_device(
    client: Client,
    id: string,
    vars?: Vars,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function unlink_email(
    client: Client,
    email: string,
    password: string,
    vars?: Vars,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function unlink_facebook(
    client: Client,
    token: string,
    vars?: Vars,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function unlink_facebook_instant_game(
    client: Client,
    signedPlayerInfo: string,
    vars?: Vars,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function unlink_game_center(
    client: Client,
    bundleId: string,
    playerId: string,
    publicKeyUrl: string,
    salt: string,
    signature: string,
    timestampSeconds: number,
    vars?: Vars,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function unlink_google(
    client: Client,
    token: string,
    vars?: Vars,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function unlink_steam(
    client: Client,
    token: string,
    vars?: Vars,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function list_channel_messages(
    client: Client,
    channel_id_str: string,
    limit_int: number,
    forward_bool: boolean,
    cursor_str: string,
    callback?: (result: ApiChannelMessageList | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiChannelMessageList | ApiError | undefined;
  export function event(
    client: Client,
    external: boolean,
    name: string,
    properties: unknown,
    timestamp: string,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function delete_friends(
    client: Client,
    ids_arr: unknown[],
    usernames_arr: unknown[],
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function list_friends(
    client: Client,
    limit_int: number,
    state_int: number,
    cursor_str: string,
    callback?: (result: ApiFriendList | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiFriendList | ApiError | undefined;
  export function add_friends(
    client: Client,
    ids_arr: unknown[],
    usernames_arr: unknown[],
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function block_friends(
    client: Client,
    ids_arr: unknown[],
    usernames_arr: unknown[],
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function import_facebook_friends(
    client: Client,
    token: string,
    vars: Vars | undefined,
    reset_bool: boolean,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function import_steam_friends(
    client: Client,
    token: string,
    vars: Vars | undefined,
    reset_bool: boolean,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function list_groups(
    client: Client,
    name_str: string,
    cursor_str: string,
    limit_int: number,
    lang_tag_str: string,
    members_int: number,
    open_bool: boolean,
    callback?: (result: ApiGroupList | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiGroupList | ApiError | undefined;
  export function create_group(
    client: Client,
    avatarUrl: string,
    description: string,
    langTag: string,
    maxCount: number,
    name: string,
    open: boolean,
    callback?: (result: ApiGroup | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiGroup | ApiError | undefined;
  export function delete_group(
    client: Client,
    group_id_str: string,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function update_group(
    client: Client,
    group_id_str: string,
    body: unknown,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function add_group_users(
    client: Client,
    group_id_str: string,
    user_ids_arr: unknown[],
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function ban_group_users(
    client: Client,
    group_id_str: string,
    user_ids_arr: unknown[],
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function demote_group_users(
    client: Client,
    group_id_str: string,
    user_ids_arr: unknown[],
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function join_group(
    client: Client,
    group_id_str: string,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function kick_group_users(
    client: Client,
    group_id_str: string,
    user_ids_arr: unknown[],
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function leave_group(
    client: Client,
    group_id_str: string,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function promote_group_users(
    client: Client,
    group_id_str: string,
    user_ids_arr: unknown[],
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function list_group_users(
    client: Client,
    group_id_str: string,
    limit_int: number,
    state_int: number,
    cursor_str: string,
    callback?: (result: ApiGroupUserList | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiGroupUserList | ApiError | undefined;
  export function validate_purchase_apple(
    client: Client,
    persist: boolean,
    receipt: string,
    callback?: (result: ApiValidatePurchaseResponse | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiValidatePurchaseResponse | ApiError | undefined;
  export function validate_purchase_facebook_instant(
    client: Client,
    persist: boolean,
    signedRequest: string,
    callback?: (result: ApiValidatePurchaseResponse | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiValidatePurchaseResponse | ApiError | undefined;
  export function validate_purchase_google(
    client: Client,
    persist: boolean,
    purchase: string,
    callback?: (result: ApiValidatePurchaseResponse | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiValidatePurchaseResponse | ApiError | undefined;
  export function validate_purchase_huawei(
    client: Client,
    persist: boolean,
    purchase: string,
    signature: string,
    callback?: (result: ApiValidatePurchaseResponse | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiValidatePurchaseResponse | ApiError | undefined;
  export function list_subscriptions(
    client: Client,
    cursor: string,
    limit: number,
    callback?: (result: ApiSubscriptionList | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiSubscriptionList | ApiError | undefined;
  export function validate_subscription_apple(
    client: Client,
    persist: boolean,
    receipt: string,
    callback?: (result: ApiValidateSubscriptionResponse | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiValidateSubscriptionResponse | ApiError | undefined;
  export function validate_subscription_google(
    client: Client,
    persist: boolean,
    receipt: string,
    callback?: (result: ApiValidateSubscriptionResponse | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiValidateSubscriptionResponse | ApiError | undefined;
  export function get_subscription(
    client: Client,
    product_id_str: string,
    callback?: (result: ApiValidatedSubscription | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiValidatedSubscription | ApiError | undefined;
  export function delete_leaderboard_record(
    client: Client,
    leaderboard_id_str: string,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function list_leaderboard_records(
    client: Client,
    leaderboard_id_str: string,
    owner_ids_arr: unknown[],
    limit_int: number,
    cursor_str: string,
    expiry_str: string,
    callback?: (result: ApiLeaderboardRecordList | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiLeaderboardRecordList | ApiError | undefined;
  export function write_leaderboard_record(
    client: Client,
    leaderboard_id_str: string,
    metadata: string,
    operator: unknown,
    score: string,
    subscore: string,
    callback?: (result: ApiLeaderboardRecord | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiLeaderboardRecord | ApiError | undefined;
  export function list_leaderboard_records_around_owner(
    client: Client,
    leaderboard_id_str: string,
    owner_id_str: string,
    limit_int: number,
    expiry_str: string,
    cursor_str: string,
    callback?: (result: ApiLeaderboardRecordList | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiLeaderboardRecordList | ApiError | undefined;
  export function list_matches(
    client: Client,
    limit_int: number,
    authoritative_bool: boolean,
    label_str: string,
    min_size_int: number,
    max_size_int: number,
    query_str: string,
    callback?: (result: ApiMatchList | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiMatchList | ApiError | undefined;
  export function delete_notifications(
    client: Client,
    ids_arr: unknown[],
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function list_notifications(
    client: Client,
    limit_int: number,
    cacheable_cursor_str: string,
    callback?: (result: ApiNotificationList | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiNotificationList | ApiError | undefined;
  export function rpc_func2(
    client: Client,
    id_str: string,
    payload_str: string,
    http_key_str: string,
    callback?: (result: ApiRpc | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiRpc | ApiError | undefined;
  export function rpc_func(
    client: Client,
    id_str: string,
    payload: string,
    http_key_str: string,
    callback?: (result: ApiRpc | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiRpc | ApiError | undefined;
  export function session_logout(
    client: Client,
    refreshToken: string,
    token: string,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function read_storage_objects(
    client: Client,
    objectIds: unknown[],
    callback?: (result: ApiStorageObjects | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiStorageObjects | ApiError | undefined;
  export function write_storage_objects(
    client: Client,
    objects: unknown[],
    callback?: (result: ApiStorageObjectAcks | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiStorageObjectAcks | ApiError | undefined;
  export function delete_storage_objects(
    client: Client,
    objectIds: unknown[],
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function list_storage_objects(
    client: Client,
    collection_str: string,
    user_id_str: string,
    limit_int: number,
    cursor_str: string,
    callback?: (result: ApiStorageObjectList | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiStorageObjectList | ApiError | undefined;
  export function list_storage_objects2(
    client: Client,
    collection_str: string,
    user_id_str: string,
    limit_int: number,
    cursor_str: string,
    callback?: (result: ApiStorageObjectList | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiStorageObjectList | ApiError | undefined;
  export function list_tournaments(
    client: Client,
    category_start_int: number,
    category_end_int: number,
    start_time_int: number,
    end_time_int: number,
    limit_int: number,
    cursor_str: string,
    callback?: (result: ApiTournamentList | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiTournamentList | ApiError | undefined;
  export function delete_tournament_record(
    client: Client,
    tournament_id_str: string,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function list_tournament_records(
    client: Client,
    tournament_id_str: string,
    owner_ids_arr: unknown[],
    limit_int: number,
    cursor_str: string,
    expiry_str: string,
    callback?: (result: ApiTournamentRecordList | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiTournamentRecordList | ApiError | undefined;
  export function write_tournament_record2(
    client: Client,
    tournament_id_str: string,
    metadata: string,
    operator: unknown,
    score: string,
    subscore: string,
    callback?: (result: ApiLeaderboardRecord | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiLeaderboardRecord | ApiError | undefined;
  export function write_tournament_record(
    client: Client,
    tournament_id_str: string,
    metadata: string,
    operator: unknown,
    score: string,
    subscore: string,
    callback?: (result: ApiLeaderboardRecord | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiLeaderboardRecord | ApiError | undefined;
  export function join_tournament(
    client: Client,
    tournament_id_str: string,
    callback?: (result: ApiEmpty | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiEmpty | ApiError | undefined;
  export function list_tournament_records_around_owner(
    client: Client,
    tournament_id_str: string,
    owner_id_str: string,
    limit_int: number,
    expiry_str: string,
    cursor_str: string,
    callback?: (result: ApiTournamentRecordList | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiTournamentRecordList | ApiError | undefined;
  export function get_users(
    client: Client,
    ids_arr: unknown[],
    usernames_arr: unknown[],
    facebook_ids_arr: unknown[],
    callback?: (result: ApiUsers | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiUsers | ApiError | undefined;
  export function list_user_groups(
    client: Client,
    user_id_str: string,
    limit_int: number,
    state_int: number,
    cursor_str: string,
    callback?: (result: ApiUserGroupList | ApiError) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): ApiUserGroupList | ApiError | undefined;
  export function create_client(config: ClientConfig): Client;
  export function create_socket(client: Client): import("nakama.socket").Socket;
  export function set_bearer_token(client: Client, token: string): void;
}

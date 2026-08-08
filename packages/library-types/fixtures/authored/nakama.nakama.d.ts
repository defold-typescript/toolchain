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

  type SessionToken = symbol;
  interface Session {
    token: SessionToken;
    refresh_token: SessionToken;
    created: boolean;
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

  export function cancel(token: CancellationToken): void;
  export function cancellation_token(): CancellationToken;
  export function sync(fn: () => void, cancellation_token?: CancellationToken): void;
  export function create_group_user_list_group_user(state_int: number, user_api_user: unknown): void;
  export function create_user_group_list_user_group(group_api_group: unknown, state_int: number): void;
  export function create_write_leaderboard_record_request_leaderboard_record_write(
    metadata_str: string,
    operator_api_operator: unknown,
    score_str: string,
    subscore_str: string,
  ): void;
  export function create_write_tournament_record_request_tournament_record_write(
    metadata_str: string,
    operator_api_operator: unknown,
    score_str: string,
    subscore_str: string,
  ): void;
  export function create_api_account(
    custom_id_str: string,
    devices_arr: unknown[],
    disable_time_str: string,
    email_str: string,
    user_api_user: unknown,
    verify_time_str: string,
    wallet_str: string,
  ): void;
  export function create_api_account_apple(token_str: string, vars_obj: unknown): void;
  export function create_api_account_custom(id_str: string, vars_obj: unknown): { id: string; vars: unknown };
  export function create_api_account_device(id_str: string, vars_obj: unknown): void;
  export function create_api_account_email(email_str: string, password_str: string, vars_obj: unknown): void;
  export function create_api_account_facebook(token_str: string, vars_obj: unknown): void;
  export function create_api_account_facebook_instant_game(
    signed_player_info_str: string,
    vars_obj: unknown,
  ): void;
  export function create_api_account_game_center(
    bundle_id_str: string,
    player_id_str: string,
    public_key_url_str: string,
    salt_str: string,
    signature_str: string,
    timestamp_seconds_str: string,
    vars_obj: unknown,
  ): void;
  export function create_api_account_google(token_str: string, vars_obj: unknown): void;
  export function create_api_account_steam(token_str: string, vars_obj: unknown): void;
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
  ): void;
  export function create_api_channel_message_list(
    cacheable_cursor_str: string,
    messages_arr: unknown[],
    next_cursor_str: string,
    prev_cursor_str: string,
  ): void;
  export function create_api_create_group_request(
    avatar_url_str: string,
    description_str: string,
    lang_tag_str: string,
    max_count_int: number,
    name_str: string,
    open_bool: boolean,
  ): void;
  export function create_api_delete_storage_object_id(
    collection_str: string,
    key_str: string,
    version_str: string,
  ): void;
  export function create_api_delete_storage_objects_request(object_ids_arr: unknown[]): void;
  export function create_api_event(
    external_bool: boolean,
    name_str: string,
    properties_obj: unknown,
    timestamp_str: string,
  ): void;
  export function create_api_friend(state_int: number, update_time_str: string, user_api_user: unknown): void;
  export function create_api_friend_list(cursor_str: string, friends_arr: unknown[]): void;
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
  ): void;
  export function create_api_group_list(cursor_str: string, groups_arr: unknown[]): void;
  export function create_api_group_user_list(cursor_str: string, group_users_arr: unknown[]): void;
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
  ): void;
  export function create_api_leaderboard_record_list(
    next_cursor_str: string,
    owner_records_arr: unknown[],
    prev_cursor_str: string,
    rank_count_str: string,
    records_arr: unknown[],
  ): void;
  export function create_api_link_steam_request(account_api_account_steam: unknown, sync_bool: boolean): void;
  export function create_api_list_subscriptions_request(cursor_str: string, limit_int: number): void;
  export function create_api_match(
    authoritative_bool: boolean,
    handler_name_str: string,
    label_str: string,
    match_id_str: string,
    size_int: number,
    tick_rate_int: number,
  ): void;
  export function create_api_match_list(matches_arr: unknown[]): void;
  export function create_api_notification(
    code_int: number,
    content_str: string,
    create_time_str: string,
    id_str: string,
    persistent_bool: boolean,
    sender_id_str: string,
    subject_str: string,
  ): void;
  export function create_api_notification_list(
    cacheable_cursor_str: string,
    notifications_arr: unknown[],
  ): void;
  export function create_api_read_storage_object_id(
    collection_str: string,
    key_str: string,
    user_id_str: string,
  ): void;
  export function create_api_read_storage_objects_request(object_ids_arr: unknown[]): void;
  export function create_api_rpc(http_key_str: string, id_str: string, payload_str: string): void;
  export function create_api_session(
    created_bool: boolean,
    refresh_token_str: string,
    token_str: string,
  ): void;
  export function create_api_session_logout_request(refresh_token_str: string, token_str: string): void;
  export function create_api_session_refresh_request(token_str: string, vars_obj: unknown): void;
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
  ): void;
  export function create_api_storage_object_ack(
    collection_str: string,
    create_time_str: string,
    key_str: string,
    update_time_str: string,
    user_id_str: string,
    version_str: string,
  ): void;
  export function create_api_storage_object_acks(acks_arr: unknown[]): void;
  export function create_api_storage_object_list(cursor_str: string, objects_arr: unknown[]): void;
  export function create_api_storage_objects(objects_arr: unknown[]): void;
  export function create_api_subscription_list(
    cursor_str: string,
    prev_cursor_str: string,
    validated_subscriptions_arr: unknown[],
  ): void;
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
    operator_api_operator: unknown,
    prev_reset_int: number,
    size_int: number,
    sort_order_int: number,
    start_active_int: number,
    start_time_str: string,
    title_str: string,
  ): void;
  export function create_api_tournament_list(cursor_str: string, tournaments_arr: unknown[]): void;
  export function create_api_tournament_record_list(
    next_cursor_str: string,
    owner_records_arr: unknown[],
    prev_cursor_str: string,
    rank_count_str: string,
    records_arr: unknown[],
  ): void;
  export function create_api_update_account_request(
    avatar_url_str: string,
    display_name_str: string,
    lang_tag_str: string,
    location_str: string,
    timezone_str: string,
    username_str: string,
  ): void;
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
  ): void;
  export function create_api_user_group_list(cursor_str: string, user_groups_arr: unknown[]): void;
  export function create_api_users(users_arr: unknown[]): void;
  export function create_api_validate_purchase_apple_request(
    persist_bool: boolean,
    receipt_str: string,
  ): void;
  export function create_api_validate_purchase_facebook_instant_request(
    persist_bool: boolean,
    signed_request_str: string,
  ): void;
  export function create_api_validate_purchase_google_request(
    persist_bool: boolean,
    purchase_str: string,
  ): void;
  export function create_api_validate_purchase_huawei_request(
    persist_bool: boolean,
    purchase_str: string,
    signature_str: string,
  ): void;
  export function create_api_validate_purchase_response(validated_purchases_arr: unknown[]): void;
  export function create_api_validate_subscription_apple_request(
    persist_bool: boolean,
    receipt_str: string,
  ): void;
  export function create_api_validate_subscription_google_request(
    persist_bool: boolean,
    receipt_str: string,
  ): void;
  export function create_api_validate_subscription_response(
    validated_subscription_api_validated_subscription: unknown,
  ): void;
  export function create_api_validated_purchase(
    create_time_str: string,
    environment_api_store_environment: unknown,
    product_id_str: string,
    provider_response_str: string,
    purchase_time_str: string,
    refund_time_str: string,
    seen_before_bool: boolean,
    store_api_store_provider: unknown,
    transaction_id_str: string,
    update_time_str: string,
    user_id_str: string,
  ): void;
  export function create_api_validated_subscription(
    active_bool: boolean,
    create_time_str: string,
    environment_api_store_environment: unknown,
    expiry_time_str: string,
    original_transaction_id_str: string,
    product_id_str: string,
    provider_notification_str: string,
    provider_response_str: string,
    purchase_time_str: string,
    refund_time_str: string,
    store_api_store_provider: unknown,
    update_time_str: string,
    user_id_str: string,
  ): void;
  export function create_api_write_storage_object(
    collection_str: string,
    key_str: string,
    permission_read_int: number,
    permission_write_int: number,
    value_str: string,
    version_str: string,
  ): void;
  export function create_api_write_storage_objects_request(objects_arr: unknown[]): void;
  export function create_protobuf_any(type_str: string): void;
  export function create_rpc_status(code_int: number, details_arr: unknown[], message_str: string): void;
  export function healthcheck(
    client: Client,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function delete_account(
    client: Client,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function get_account(
    client: Client,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function update_account(
    client: Client,
    avatarUrl: string,
    displayName: string,
    langTag: string,
    location: string,
    timezone: string,
    username: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function authenticate_apple(
    client: Client,
    token: string,
    vars: unknown,
    create_bool: boolean,
    username_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function authenticate_custom(
    client: Client,
    id: string,
    vars: unknown,
    create_bool: boolean,
    username_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): Session;
  export function authenticate_device(
    client: Client,
    id: string,
    vars: unknown,
    create_bool: boolean,
    username_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function authenticate_email(
    client: Client,
    email: string,
    password: string,
    vars: unknown,
    create_bool: boolean,
    username_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function authenticate_facebook(
    client: Client,
    token: string,
    vars: unknown,
    create_bool: boolean,
    username_str: string,
    sync_bool: boolean,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function authenticate_facebook_instant_game(
    client: Client,
    signedPlayerInfo: string,
    vars: unknown,
    create_bool: boolean,
    username_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function authenticate_game_center(
    client: Client,
    bundleId: string,
    playerId: string,
    publicKeyUrl: string,
    salt: string,
    signature: string,
    timestampSeconds: number,
    vars: unknown,
    create_bool: boolean,
    username_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function authenticate_google(
    client: Client,
    token: string,
    vars: unknown,
    create_bool: boolean,
    username_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function authenticate_steam(
    client: Client,
    token: string,
    vars: unknown,
    create_bool: boolean,
    username_str: string,
    sync_bool: boolean,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function link_apple(
    client: Client,
    token: string,
    vars?: unknown,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function link_custom(
    client: Client,
    id: string,
    vars?: unknown,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function link_device(
    client: Client,
    id: string,
    vars?: unknown,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function link_email(
    client: Client,
    email: string,
    password: string,
    vars?: unknown,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function link_facebook(
    client: Client,
    token: string,
    vars: unknown,
    sync_bool: boolean,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function link_facebook_instant_game(
    client: Client,
    signedPlayerInfo: string,
    vars?: unknown,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function link_game_center(
    client: Client,
    bundleId: string,
    playerId: string,
    publicKeyUrl: string,
    salt: string,
    signature: string,
    timestampSeconds: number,
    vars?: unknown,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function link_google(
    client: Client,
    token: string,
    vars?: unknown,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function link_steam(
    client: Client,
    account: unknown,
    sync: boolean,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function session_refresh(
    client: Client,
    token: string,
    vars?: unknown,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function unlink_apple(
    client: Client,
    token: string,
    vars?: unknown,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function unlink_custom(
    client: Client,
    id: string,
    vars?: unknown,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function unlink_device(
    client: Client,
    id: string,
    vars?: unknown,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function unlink_email(
    client: Client,
    email: string,
    password: string,
    vars?: unknown,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function unlink_facebook(
    client: Client,
    token: string,
    vars?: unknown,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function unlink_facebook_instant_game(
    client: Client,
    signedPlayerInfo: string,
    vars?: unknown,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function unlink_game_center(
    client: Client,
    bundleId: string,
    playerId: string,
    publicKeyUrl: string,
    salt: string,
    signature: string,
    timestampSeconds: number,
    vars?: unknown,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function unlink_google(
    client: Client,
    token: string,
    vars?: unknown,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function unlink_steam(
    client: Client,
    token: string,
    vars?: unknown,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function list_channel_messages(
    client: Client,
    channel_id_str: string,
    limit_int: number,
    forward_bool: boolean,
    cursor_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function event(
    client: Client,
    external: boolean,
    name: string,
    properties: unknown,
    timestamp: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function delete_friends(
    client: Client,
    ids_arr: unknown[],
    usernames_arr: unknown[],
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function list_friends(
    client: Client,
    limit_int: number,
    state_int: number,
    cursor_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function add_friends(
    client: Client,
    ids_arr: unknown[],
    usernames_arr: unknown[],
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function block_friends(
    client: Client,
    ids_arr: unknown[],
    usernames_arr: unknown[],
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function import_facebook_friends(
    client: Client,
    token: string,
    vars: unknown,
    reset_bool: boolean,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function import_steam_friends(
    client: Client,
    token: string,
    vars: unknown,
    reset_bool: boolean,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function list_groups(
    client: Client,
    name_str: string,
    cursor_str: string,
    limit_int: number,
    lang_tag_str: string,
    members_int: number,
    open_bool: boolean,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function create_group(
    client: Client,
    avatarUrl: string,
    description: string,
    langTag: string,
    maxCount: number,
    name: string,
    open: boolean,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function delete_group(
    client: Client,
    group_id_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function update_group(
    client: Client,
    group_id_str: string,
    body: unknown,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function add_group_users(
    client: Client,
    group_id_str: string,
    user_ids_arr: unknown[],
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function ban_group_users(
    client: Client,
    group_id_str: string,
    user_ids_arr: unknown[],
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function demote_group_users(
    client: Client,
    group_id_str: string,
    user_ids_arr: unknown[],
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function join_group(
    client: Client,
    group_id_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function kick_group_users(
    client: Client,
    group_id_str: string,
    user_ids_arr: unknown[],
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function leave_group(
    client: Client,
    group_id_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function promote_group_users(
    client: Client,
    group_id_str: string,
    user_ids_arr: unknown[],
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function list_group_users(
    client: Client,
    group_id_str: string,
    limit_int: number,
    state_int: number,
    cursor_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function validate_purchase_apple(
    client: Client,
    persist: boolean,
    receipt: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function validate_purchase_facebook_instant(
    client: Client,
    persist: boolean,
    signedRequest: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function validate_purchase_google(
    client: Client,
    persist: boolean,
    purchase: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function validate_purchase_huawei(
    client: Client,
    persist: boolean,
    purchase: string,
    signature: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function list_subscriptions(
    client: Client,
    cursor: string,
    limit: number,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function validate_subscription_apple(
    client: Client,
    persist: boolean,
    receipt: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function validate_subscription_google(
    client: Client,
    persist: boolean,
    receipt: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function get_subscription(
    client: Client,
    product_id_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function delete_leaderboard_record(
    client: Client,
    leaderboard_id_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function list_leaderboard_records(
    client: Client,
    leaderboard_id_str: string,
    owner_ids_arr: unknown[],
    limit_int: number,
    cursor_str: string,
    expiry_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function write_leaderboard_record(
    client: Client,
    leaderboard_id_str: string,
    metadata: string,
    operator: unknown,
    score: string,
    subscore: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function list_leaderboard_records_around_owner(
    client: Client,
    leaderboard_id_str: string,
    owner_id_str: string,
    limit_int: number,
    expiry_str: string,
    cursor_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function list_matches(
    client: Client,
    limit_int: number,
    authoritative_bool: boolean,
    label_str: string,
    min_size_int: number,
    max_size_int: number,
    query_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function delete_notifications(
    client: Client,
    ids_arr: unknown[],
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function list_notifications(
    client: Client,
    limit_int: number,
    cacheable_cursor_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function rpc_func2(
    client: Client,
    id_str: string,
    payload_str: string,
    http_key_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function rpc_func(
    client: Client,
    id_str: string,
    payload: string,
    http_key_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function session_logout(
    client: Client,
    refreshToken: string,
    token: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function read_storage_objects(
    client: Client,
    objectIds: unknown[],
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function write_storage_objects(
    client: Client,
    objects: unknown[],
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function delete_storage_objects(
    client: Client,
    objectIds: unknown[],
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function list_storage_objects(
    client: Client,
    collection_str: string,
    user_id_str: string,
    limit_int: number,
    cursor_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function list_storage_objects2(
    client: Client,
    collection_str: string,
    user_id_str: string,
    limit_int: number,
    cursor_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function list_tournaments(
    client: Client,
    category_start_int: number,
    category_end_int: number,
    start_time_int: number,
    end_time_int: number,
    limit_int: number,
    cursor_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function delete_tournament_record(
    client: Client,
    tournament_id_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function list_tournament_records(
    client: Client,
    tournament_id_str: string,
    owner_ids_arr: unknown[],
    limit_int: number,
    cursor_str: string,
    expiry_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function write_tournament_record2(
    client: Client,
    tournament_id_str: string,
    metadata: string,
    operator: unknown,
    score: string,
    subscore: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function write_tournament_record(
    client: Client,
    tournament_id_str: string,
    metadata: string,
    operator: unknown,
    score: string,
    subscore: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function join_tournament(
    client: Client,
    tournament_id_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function list_tournament_records_around_owner(
    client: Client,
    tournament_id_str: string,
    owner_id_str: string,
    limit_int: number,
    expiry_str: string,
    cursor_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function get_users(
    client: Client,
    ids_arr: unknown[],
    usernames_arr: unknown[],
    facebook_ids_arr: unknown[],
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function list_user_groups(
    client: Client,
    user_id_str: string,
    limit_int: number,
    state_int: number,
    cursor_str: string,
    callback?: (result: unknown) => void,
    retry_policy?: RetryPolicy,
    cancellation_token?: CancellationToken,
  ): void;
  export function create_client(config: ClientConfig): Client;
  export function create_socket(client: Client): unknown;
  export function set_bearer_token(client: Client, token: SessionToken): void;
}

/** @noSelfInFile */
/** @noResolution */
declare module 'bridge.bridge' {
  /**
   * Functions and constants for interacting with bridge
   */
  export namespace bridge {
    namespace achievements {
      /**
       * Returns the achievement list in JSON.
       *
       * @param on_success - function(_, list)
       * @param on_failure - function(_, error)
       */
      function get_achievements(on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Unlocks achievement for a player.
       *
       * @param on_success - function(_, result)
       * @param on_failure - function(_, error)
       */
      function unlock(id: string, on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
    }
    namespace advertisement {
      /**
       * Track the state of the advanced banners to manage ad display and user experience.
       */
      function advanced_banners_state(): void;
      /**
       * Hide the currently displayed banner ad when it is no longer needed.
       */
      function banner_state(): void;
      /**
       * Check if the ad blocker is enabled.
       *
       * @param on_success - function(_, bool)
       * @param on_failure - function(_, error)
       */
      function check_ad_block(on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Hide the currently displayed advanced banners when they are no longer needed.
       */
      function hide_advanced_banners(): void;
      /**
       * Hide the currently displayed banner ad when it is no longer needed.
       */
      function hide_banner(): void;
      /**
       * Track the state of the interstitial ad to manage ad display and user experience.
       */
      function interstitial_state(): void;
      /**
       * Check if the platform supports displaying advanced banner ads.
       */
      function is_advanced_banners_supported(): string;
      /**
       * Check if the platform supports displaying banner ads. Use this to determine if you can include banner advertisements in your game.
       */
      function is_banner_supported(): string;
      /**
       * Check if the platform supports displaying interstitial ads. Use this to determine if you can include interstitial advertisements in your game.
       */
      function is_interstitial_supported(): string;
      /**
       * Check if the platform supports displaying rewarded ads. Use this to determine if you can include rewarded advertisements in your game.
       */
      function is_rewarded_supported(): string;
      /**
       * Minimum time interval between interstitial ad displays to comply with platform requirements and improve user experience.
       */
      function minimum_delay_between_interstitial(): number;
      /**
       * State changed events.
       *
       * @param callback - function(_, state)
       */
      function on(event_name: string, callback: (...args: unknown[]) => unknown): void;
      /**
       * Monitor the placement of the rewarded ad to manage the reward process.
       */
      function rewarded_placement(): void;
      /**
       * Monitor the state of the rewarded ad (loading, opened, closed, rewarded, failed) to manage the reward process.
       */
      function rewarded_state(): void;
      /**
       * Set the minimum time interval between interstitial ad displays to comply with platform requirements and improve user experience.
       *
       * @param delay - 60 from default
       */
      function set_minimum_delay_between_interstitial(delay: number): void;
      /**
       * Display advanced banners at appropriate moments of the game.
       */
      function show_advanced_banners(placement: string): void;
      /**
       * Display a banner ad within your game to generate revenue through advertising.
       */
      function show_banner(position: string, placement: string): void;
      /**
       * Display an interstitial ad at appropriate moments, such as during level transitions or game over screens.
       */
      function show_interstitial(placement: string): void;
      /**
       * Display a rewarded ad and provide incentives to players for watching the entire ad.
       */
      function show_rewarded(placement: string): void;
    }
    namespace cross_promo {
      /**
       * Get the cross-promo games list. Resolves to an empty array when unsupported. Each game has the shape { id, name, url, icon_url, cover_url, payload }.
       *
       * @param on_success - function(_, games)
       * @param on_failure - function(_, error)
       */
      function get_games(on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Hide the built-in cross-promo HTML overlay.
       */
      function hide(): void;
      /**
       * Check whether the cross-promo overlay is currently shown.
       */
      function is_visible(): boolean;
      /**
       * Show the built-in cross-promo HTML overlay.
       */
      function show(): void;
    }
    namespace daily_rewards {
      /**
       * Claims the reward available today. Calls on_success when claimed, on_failure otherwise.
       *
       * @param on_success - function(_)
       * @param on_failure - function(_, error)
       */
      function claim_current_reward(on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Returns the 0-based index of the reward the player is currently on.
       *
       * @param on_success - function(_, day)
       * @param on_failure - function(_, error)
       */
      function get_current_day(on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Returns the id of the reward claimable today, or nil when nothing can be claimed.
       *
       * @param on_success - function(_, reward)
       * @param on_failure - function(_, error)
       */
      function get_current_reward(on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Returns the configured ordered list of reward ids as a JSON string.
       *
       * @param on_success - function(_, rewards)
       * @param on_failure - function(_, error)
       */
      function get_rewards(on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
    }
    namespace device {
      /**
       * Determine the type of device (mobile, tablet, desktop, tv) the game is being played on to adjust the game`s interface and performance settings.
       */
      function type(): string;
    }
    namespace leaderboards {
      /**
       * Retrieve entries from the leaderboard, including the player's rank and score, to display a comprehensive leaderboard.
       *
       * @param on_success - function(_, entries)
       * @param on_failure - function(_, error)
       */
      function get_entries(id: string, on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Submit the player's score to the leaderboard to update their rank and position.
       *
       * @param on_success - function()
       * @param on_failure - function(_, error)
       */
      function set_score(id: string, score: number, on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Show native popup leaderboard.
       *
       * @param on_success - function()
       * @param on_failure - function(_, error)
       */
      function show_native_popup(id: string, on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Check the leaderboards type on the platform.
       */
      function type(): string;
    }
    namespace payments {
      /**
       * Consume purchased items, such as in-game currency, once they are used, to manage inventory and player progression.
       *
       * @param on_success - function(_, purchase)
       * @param on_failure - function(_, error)
       */
      function consume_purchase(id: string, on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Retrieve a list of all available in-game items that players can purchase to display in the game store.
       *
       * @param on_success - function(_, catalogItems)
       * @param on_failure - function(_, error)
       */
      function get_catalog(on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Retrieve a list of items that the player has purchased to manage their inventory and provide access to purchased content.
       *
       * @param on_success - function(nil, purchases)
       * @param on_failure - function(_, error)
       */
      function get_purchases(on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Check if in-game purchases are supported to offer items or upgrades within the game.
       */
      function is_supported(): boolean;
      /**
       * Allow players to buy items or upgrades in your game to enhance their gameplay experience.
       *
       * @param on_success - function(_, purchase)
       * @param on_failure - function(_, error)
       */
      function purchase(id: string, on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
    }
    namespace platform {
      /**
       * Server Time
       *
       * @param on_success - function(_, time)
       * @param on_failure - function(_, error)
       */
      function get_server_time(on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Identify the platform on which the game is currently running to customize features and settings accordingly.
       */
      function id(): string | undefined;
      /**
       * Check if the audio is enabled on the platform.
       */
      function is_audio_enabled(): boolean;
      /**
       * Check if external calls are supported on the platform.
       */
      function is_external_calls_supported(): boolean;
      /**
       * Check if external links are allowed on the platform.
       */
      function is_external_links_allowed(): boolean;
      /**
       * Get the language set by the user on the platform or the browser language if not provided by the platform, to localize game content.
       */
      function language(): string;
      /**
       * State changed events.
       *
       * @param callback - function(_, state)
       */
      function on(event_name: string, callback: (...args: unknown[]) => unknown): void;
      /**
       * Embed auxiliary information into the game URL to pass additional data or settings when launching the game.
       */
      function payload(): string | undefined;
      /**
       * Send a custom message with an arbitrary id to the platform.
       *
       * @param id - The custom message id.
       * @param options - Optional message-specific options (may be omitted).
       */
      function send_custom_message(id: string, options: Record<string | number, unknown>, on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Send predefined messages to the platform to trigger specific actions or events, such as signaling that the game is ready.
       *
       * @param message - One of message types: `game_ready` `in_game_loading_started`
       * @param options - Optional message-specific options (may be omitted).
       */
      function send_message(message: string, options: Record<string | number, unknown>, on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Retrieve the top-level domain of the platform to handle domain-specific configurations and behavior.
       */
      function tld(): string | undefined;
    }
    namespace player {
      /**
       * Authorize the player on the platform to access protected features and personalize the game experience. For example, prompting the player to log in to save their progress or unlock social sharing features.
       *
       * @param on_success - function()
       * @param on_failure - function(_, error)
       */
      function authorize(options: Record<string | number, unknown>, on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Get the extra information about player.
       */
      function extra(): Record<string | number, unknown>;
      /**
       * Get the player’s unique ID on the platform to manage user-specific data and settings. Use this ID to track player progress, achievements, and purchases.
       */
      function id(): string | undefined;
      /**
       * Check if the platform supports player authorization to enable features that require user authentication, such as saving game progress or accessing social features.
       */
      function is_authorization_supported(): boolean;
      /**
       * Verify if the player is currently authorized on the platform. This allows you to enable personalized features, such as saving high scores or providing user-specific content.
       */
      function is_authorized(): boolean;
      /**
       * Check if the player is unauthorized or running as a guest.
       */
      function is_guest(): boolean;
      /**
       * Retrieve the player's name to personalize the game experience. Display the name in leaderboards, friend lists, or when sending notifications and messages.
       */
      function name(): string | undefined;
      /**
       * Get the count of player avatars available. Use this to manage and display user profile images effectively, such as showing the avatar in multiplayer lobbies or profile screens.
       */
      function photos(): Record<string | number, unknown>;
    }
    namespace remote_config {
      /**
       * Encourage players to rate your game, providing valuable feedback and improving visibility.
       *
       * @param on_success - function(_, data)
       * @param on_failure - function(_)
       */
      function get(on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Check if remote configuration is supported to manage game settings without releasing updates.
       */
      function is_supported(): boolean;
      /**
       * Set dynamic game/player parameters used for config segmentation. Accumulates across calls; only used by platforms that support it.
       */
      function set_context(parameters: Record<string | number, unknown>): void;
    }
    namespace social {
      /**
       * Allow players to bookmark your game for easy access in the future.
       *
       * @param on_success - function(_)
       * @param on_failure - function(_)
       */
      function add_to_favorites(on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Enable players to add a shortcut to your game on their home screen for quick access.
       *
       * @param on_success - function(_)
       * @param on_failure - function(_)
       */
      function add_to_home_screen(on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Use this to let players create posts about their achievements or updates directly from the game.
       *
       * @param on_success - function(_)
       * @param on_failure - function(_)
       */
      function create_post(options: Record<string | number, unknown>, on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Allow players to invite their friends to play the game, helping to grow your player base organically.
       *
       * @param on_success - function(_)
       * @param on_failure - function(_)
       */
      function invite_friends(options: Record<string | number, unknown>, on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Check if the add to favorites functionality is supported on the platform.
       */
      function is_add_to_favorites_supported(): boolean;
      /**
       * Check if the add to home screen functionality is supported on the platform.
       */
      function is_add_to_home_screen_supported(): boolean;
      /**
       * Check if the create post functionality is supported on the platform.
       */
      function is_create_post_supported(): boolean;
      /**
       * Check if the invite friends functionality is supported on the platform.
       */
      function is_invite_friends_supported(): boolean;
      /**
       * Check if the join community functionality is supported on the platform.
       */
      function is_join_community_supported(): boolean;
      /**
       * Check if the rate game functionality is supported on the platform.
       */
      function is_rate_supported(): boolean;
      /**
       * Check if the share functionality is supported on the platform.
       */
      function is_share_supported(): boolean;
      /**
       * Use this to allow players to share game content or achievements on social media platforms.
       *
       * @param on_success - function(_)
       * @param on_failure - function(_)
       */
      function join_community(options: Record<string | number, unknown>, on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Encourage players to rate your game, providing valuable feedback and improving visibility.
       *
       * @param on_success - function(_)
       * @param on_failure - function(_)
       */
      function rate(on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Use this to allow players to share game content or achievements on social media platforms.
       *
       * @param on_success - function(_)
       * @param on_failure - function(_)
       */
      function share(options: Record<string | number, unknown>, on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
    }
    namespace storage {
      /**
       * Remove data from the storage by key to manage player data and settings effectively.
       *
       * @param on_success - function(_)
       * @param on_failure - function(_, error)
       */
      function _delete(table_keys: Record<string | number, unknown>, on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Retrieve stored data based on a key or multiple keys to restore player progress or settings.
       *
       * @param on_success - function(_, data)
       * @param on_failure - function(_, error)
       */
      export function get(table_keys: Record<string | number, unknown>, on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Save data to the storage with a key to retain player progress or settings.
       *
       * @param on_success - function(_)
       * @param on_failure - function(_, error)
       */
      export function set(table_data: Record<string | number, unknown>, on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      export { _delete as delete };
    }
    namespace tasks {
      /**
       * Advances every active target whose id equals the given metric, clamped to the target amount.
       *
       * @param metric - The metric id to advance.
       * @param amount - The amount to add (defaults to 1).
       * @param on_success - function(_)
       * @param on_failure - function(_, error)
       */
      function add_progress(metric: string, amount: number, on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Claims a completed task's rewards. Calls on_success with true when claimed, false otherwise.
       *
       * @param task_id - The id of the task to claim.
       * @param on_success - function(_, claimed)
       * @param on_failure - function(_, error)
       */
      function claim_reward(task_id: string, on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
      /**
       * Returns every active task across all groups, with live progress, as a JSON string.
       *
       * @param on_success - function(_, tasks)
       * @param on_failure - function(_, error)
       */
      function get_tasks(on_success: (...args: unknown[]) => unknown, on_failure: (...args: unknown[]) => unknown): void;
    }
  }
}

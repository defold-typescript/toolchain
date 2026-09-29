import type { IndexSlotClassification } from "./index-slot-classifications";

// The class records the base the library itself counts from, which TypeScript
// passes through unchanged, exactly as `INDEX_SLOT_CLASSIFICATIONS` records
// Defold's.
type LibraryIndexSlotClassification = Pick<IndexSlotClassification, "class" | "evidence">;

const RIVE_LIST_INDEX =
  "passes the index to rive::CommandQueue unchanged, which counts list entries from 0 (-1 appends)";

const SPINE_GUI_TRACK_PROSE: Readonly<Record<string, string>> = {
  "gui.cancel_spine": "The track number to cancel (1-based)",
  "gui.get_spine_animation": "The track number to get animation from (1-based)",
  "gui.set_spine_cursor": "The track number to set cursor for (1-based)",
  "gui.get_spine_cursor": "The track number to get cursor from (1-based)",
  "gui.set_spine_playback_rate": "The track number to set playback rate for (1-based)",
  "gui.get_spine_playback_rate": "The track number to get playback rate from (1-based)",
};

// Keyed `<page>/<element>:<param|return|field>:<slot>[:<field>]`, `<page>` being
// the library page key (`gooey`, `spine.gui`, `rive.cmd`), so a library slot
// never shares a key with an engine one (`spine.gui` documents `gui.*`). A class
// field is keyed `<page>/<Typedef>:field:<member>`, and a callback argument as a
// field of its callback slot. A typedef method is keyed by its bare name, so one
// key covers every class of the page that declares that method.
// `docs-site/app/lib/library-index-slot-gate.test.ts` reds on a scanned slot
// missing here and on an entry no library page declares.
export const LIBRARY_INDEX_SLOT_CLASSIFICATIONS: ReadonlyMap<
  string,
  LibraryIndexSlotClassification
> = new Map<string, LibraryIndexSlotClassification>([
  [
    "boom/z:param:index",
    { class: "not-a-position", evidence: "a draw order: a bigger z draws on top" },
  ],
  [
    "bridge/bridge.daily_rewards.get_current_day:param:on_success:day",
    {
      class: "native-0",
      evidence: "Returns the 0-based index of the reward the player is currently on",
    },
  ],
  [
    "crazygames/crazygames.list_friends:param:page",
    { class: "native-1", evidence: "Page number, starting at 1" },
  ],
  [
    "decore/system:field:index",
    {
      class: "native-1",
      evidence: "internal/ecs.lua:tiny_manageSystems sets systems[j].index = j",
    },
  ],
  [
    "druid/scroll_to_index:param:index",
    {
      class: "native-1",
      evidence:
        "scroll.lua:scroll_to_index clamps to 1 .. #points; data_list.lua:scroll_to_index hands it to grid:get_pos",
    },
  ],
  [
    "druid/get_pos:param:index",
    {
      class: "native-1",
      evidence: "static_grid.lua:get_pos places index 1 at row 0, column 0",
    },
  ],
  [
    "druid/get_index_xy:return:",
    {
      class: "native-1",
      evidence: "static_grid.lua:get_index_xy returns (col + 1) + row * in_row",
    },
  ],
  [
    "druid/get_index:return:",
    {
      class: "native-1",
      evidence: "static_grid.lua:get_index returns get_index_xy's index",
    },
  ],
  [
    "druid/get_index_by_node:return:",
    {
      class: "native-1",
      evidence: "static_grid.lua:get_index_by_node returns the node's key in the nodes array",
    },
  ],
  [
    "druid/add:param:index",
    {
      class: "native-1",
      evidence:
        "static_grid.lua:add and data_list.lua:add insert with helper.insert_with_shift, defaulting to the count + 1",
    },
  ],
  [
    "druid/remove:param:index",
    {
      class: "native-1",
      evidence:
        "static_grid.lua:remove and data_list.lua:remove call helper.remove_with_shift at index",
    },
  ],
  ...["druid/init:param:create_function", "druid/new_data_list:param:create_function"].map(
    (key): [string, LibraryIndexSlotClassification] => [
      key,
      {
        class: "not-a-position",
        evidence: "a callback; data_list.lua passes it the 1-based data index",
      },
    ],
  ),
  ...["cursor_index", "start_index", "end_index"].map(
    (slot): [string, LibraryIndexSlotClassification] => [
      `druid/select_cursor:param:${slot}`,
      {
        class: "native-0",
        evidence:
          "input.lua:select_cursor clamps to 0 .. utf8.len(value); 0 is before the first character",
      },
    ],
  ),
  ...["druid/druid_grid:field:first_index", "druid/druid_grid:field:last_index"].map(
    (key): [string, LibraryIndexSlotClassification] => [
      key,
      {
        class: "native-1",
        evidence:
          "static_grid.lua:_update_indexes takes the least and greatest key of the nodes array",
      },
    ],
  ),
  ...["druid/druid_data_list:field:top_index", "druid/druid_data_list:field:last_index"].map(
    (key): [string, LibraryIndexSlotClassification] => [
      key,
      { class: "native-1", evidence: "data_list.lua:init starts both at 1, the first data index" },
    ],
  ),
  [
    "druid/set_node_index:param:node",
    { class: "not-a-position", evidence: "the node to move; its prose reads `the index of`" },
  ],
  [
    "druid/set_node_index:param:index",
    {
      class: "native-1",
      evidence: "layout.lua:set_node_index calls table.insert(self.entities, index, node)",
    },
  ],
  [
    "event/is_subscribed:return:",
    {
      class: "not-a-position",
      evidence:
        "both unnamed returns share this key: a boolean, then the 1-based callback index (event.lua:is_subscribed); no note fits both",
    },
  ],
  [
    "gooey/set_focus:param:index",
    {
      class: "native-1",
      evidence:
        "gooey.lua:set_focus reads group.components[index]; focus moves over 1 .. #components",
    },
  ],
  [
    "imgui/imgui.set_mouse_button:param:index",
    {
      class: "native-0",
      evidence: "extension_imgui.cpp:imgui_SetMouseButton writes io.MouseDown[index]",
    },
  ],
  [
    "imgui/imgui.table_set_column_index:param:column_index",
    {
      class: "native-0",
      evidence:
        "extension_imgui.cpp:imgui_TableSetColumnIndex passes it to ImGui::TableSetColumnIndex unchanged",
    },
  ],
  ...["imgui.set_style_color", "imgui.push_style_color"].map(
    (fn): [string, LibraryIndexSlotClassification] => [
      `imgui/${fn}:param:color_index`,
      { class: "not-a-position", evidence: "an `imgui.ImGuiCol_*` constant" },
    ],
  ),
  ...[
    "imgui/imgui.font_add_ttf_file:return:font_index",
    "imgui/imgui.font_add_ttf_data:return:font_index",
    "imgui/imgui.font_push:param:font_index",
  ].map((key): [string, LibraryIndexSlotClassification] => [
    key,
    {
      class: "native-0",
      evidence:
        "extension_imgui.cpp:imgui_StoreFont returns Size() - 1, and imgui_GetFont accepts 0 .. Size() - 1",
    },
  ]),
  ...[
    "node_repeat/NodeRepeatAnimation:field:current_frame",
    "sprite_repeat/SpriteRepeatAnimation:field:current_frame",
  ].map((key): [string, LibraryIndexSlotClassification] => [
    key,
    { class: "native-1", evidence: "The 1-based index of the frame shown next" },
  ]),
  [
    "narrator/choose:param:index",
    { class: "native-1", evidence: "story.lua:choose asserts index within 1 .. #choices" },
  ],
  [
    "panthera/panthera_animation:field:animation_keys_index",
    {
      class: "native-1",
      evidence: "panthera.lua:update_animation walks keys from animation_keys_index to #keys",
    },
  ],
  ...[
    ["referenceListViewModelInstance", "index"],
    ["insertViewModelInstanceListViewModel", "index"],
    ["swapViewModelInstanceListValues", "indexa"],
    ["swapViewModelInstanceListValues", "indexb"],
    ["removeViewModelInstanceListViewModelIndex", "index"],
  ].map(([fn, slot]): [string, LibraryIndexSlotClassification] => [
    `rive.cmd/rive.cmd.${fn}:param:${slot}`,
    { class: "native-0", evidence: `script_rive_cmd.cpp:Script_${fn} ${RIVE_LIST_INDEX}` },
  ]),
  ...[
    "get_bundle_list",
    "get_bundle_list_in_group",
    "get_games_list",
    "get_games_group",
    "get_game_keys_group",
    "get_user_games",
    "get_virtual_items",
    "get_virtual_currency",
    "get_virtual_currency_package",
    "get_virtual_items_group",
    "get_sellable_items",
    "get_sellable_items_group",
    "get_reward_chains_list",
  ].map((fn): [string, LibraryIndexSlotClassification] => [
    `shop/shop.${fn}:param:offset`,
    { class: "native-0", evidence: "the count starts from 0" },
  ]),
  [
    "spine/spine.play_anim:param:options:track",
    {
      class: "native-1",
      evidence: "script_spine.cpp defaults track to 1; comp_spine_model.cpp plays on m_Track - 1",
    },
  ],
  [
    "spine/spine.cancel:param:options:track",
    { class: "native-1", evidence: "comp_spine_model.cpp cancels on m_Track - 1" },
  ],
  [
    "spine/spine.play_anim:param:callback_function:message:track",
    { class: "native-1", evidence: "comp_spine_model.cpp sends entry->trackIndex + 1" },
  ],
  [
    "spine.gui/gui.play_spine_anim:param:play_properties:track",
    { class: "native-1", evidence: "The track number for the animation (1-based)" },
  ],
  [
    "spine.gui/gui.play_spine_anim:param:callback_function:message:track",
    { class: "native-1", evidence: "gui_node_spine.cpp sends entry->trackIndex + 1" },
  ],
  ...Object.entries(SPINE_GUI_TRACK_PROSE).map(
    ([fn, evidence]): [string, LibraryIndexSlotClassification] => [
      `spine.gui/${fn}:param:options:track`,
      { class: "native-1", evidence },
    ],
  ),
  [
    "steam/steam.friends_get_friend_by_index:param:iFriend",
    { class: "native-0", evidence: "Is a index of range [0, GetFriendCount())" },
  ],
  [
    "steam/steam.matchmaking_get_lobby_by_index:param:index",
    { class: "native-0", evidence: "from 0 to LobbyMatchList_t.m_nLobbiesMatching" },
  ],
  ...[
    ["matchmaking_get_lobby_member_by_index", "steam_matchmaking.cpp", "GetLobbyMemberByIndex"],
    ["matchmaking_get_lobby_data_by_index", "steam_matchmaking.cpp", "GetLobbyDataByIndex"],
    [
      "user_stats_get_downloaded_leaderboard_entry",
      "steam_userstats.cpp",
      "GetDownloadedLeaderboardEntry",
    ],
  ].map(([fn, file, call]): [string, LibraryIndexSlotClassification] => [
    `steam/steam.${fn}:param:index`,
    { class: "native-0", evidence: `${file} passes it to Steamworks ${call}, which counts from 0` },
  ]),
  [
    "steam/steam.user_stats_get_achievement_name:param:index",
    { class: "native-0", evidence: "Get achievement name iAchievement in [0,GetNumAchievements)" },
  ],
  [
    "steam/steam.matchmaking_get_lobby_chat_entry:param:index",
    { class: "not-a-position", evidence: "the `m_iChatID` a `LobbyChatMsg_t` callback carries" },
  ],
  [
    "tile_raycast/cast:return:",
    {
      class: "native-1",
      evidence: "the module states tile coordinates and array indices are 1-based",
    },
  ],
  ...(["set_at", "get_at"] as const).flatMap((fn) =>
    (["tile_x", "tile_y"] as const).map((slot): [string, LibraryIndexSlotClassification] => [
      `tile_raycast/${fn}:param:${slot}`,
      { class: "native-1", evidence: "tileraycast.cpp subtracts 1 from the checked coordinate" },
    ]),
  ),
]);

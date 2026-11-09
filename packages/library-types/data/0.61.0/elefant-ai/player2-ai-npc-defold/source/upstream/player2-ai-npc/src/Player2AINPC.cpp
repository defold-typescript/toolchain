
#include <iostream>
#include <algorithm>

#include "ExtensionSettings.hpp"
#include "Player2AINPC.hpp"
#include "CallbackQueue.hpp"
#include "HttpShorthands.hpp"
#include "LuaTableToJson.hpp"
#include "StringReplace.hpp"

#include "json.hpp"

#include <dmsdk/sdk.h>

using json = nlohmann::json;
// using namespace nlohmann::literals;

// return whether json parse was success or not
bool PushLuaTableFromJsonString(lua_State *L, std::string str) {
    // it's that simple
    return dmScript::JsonToLua(L, str.c_str(), str.length());
}

int TestJsonDecode(lua_State* L) {
    DM_LUA_STACK_CHECK(L, 1);
    return 1;
}

int PostAPICall(lua_State *L, const char *path, int offsetArgs = 0, bool has_body = true) {
    DM_LUA_STACK_CHECK(L, 0);

    // Read input as json string
    std::string json_string = has_body ? ReadJsonString(L, offsetArgs + 1) : "";

    auto callback = RegisterCallback(L, offsetArgs + (has_body ? 2 : 1));
    auto callback_fail = RegisterCallback(L, offsetArgs + (has_body ? 3 : 2));

    bool json_input = true; // All content is json yeah

    httplib::Headers headers;
    if (json_input) {
        httplib::Headers merge_headers = {
            { "Content-Type", "application/json" }
        };
        headers.insert(merge_headers.begin(), merge_headers.end());
    }

    PerformPost(path, json_string.c_str(), "application/json", headers, [callback, L] (std::string data, httplib::Headers headers) {

        // printf("GOT REPLY: %s\n", data.c_str());

        // are we json?
        bool json_reply = false; // by default no
        for (auto v = headers.find("content-type"); v != headers.end(); ++v) {
            std::string val = v->second;
            std::transform(val.begin(), val.end(), val.begin(), ::tolower);
            if (val == "application/json") {
                json_reply = true;
                break;
            }
        }


        // on receive
        InvokeCallback(L, callback, [data, json_reply] (lua_State *L) {
            DM_LUA_STACK_CHECK(L, 1);

            if (json_reply) {
                if (!PushLuaTableFromJsonString(L, data)) {
                    // We failed to parse json, just default to string.
                    lua_pushstring(L, data.c_str());
                }
            } else {
                lua_pushstring(L, data.c_str());
            }

            return 1;
        });
    }, [callback_fail, L](std::string data, int error_code) {
        // on fail
        InvokeCallback(L, callback_fail, [data, error_code] (lua_State *L) {
            DM_LUA_STACK_CHECK(L, 2);

            // printf("failed %s\n", data.c_str());

            lua_pushstring(L, data.c_str());
            lua_pushinteger(L, error_code);

            return 2;
        });
    });

    return 0;
}

typedef std::function<void(lua_State *L, std::string game_id, std::string npc_id, int argOffset)> PostAPICallFirstGameIdOrNpcIdPreprocess;

// Post but allow for game_id as an optional param and replace game_id and npc_id in the query path
int PostAPICallFirstGameIdOrNpcId(lua_State *L, const char *path, bool gameid_only = false, bool has_body = true, PostAPICallFirstGameIdOrNpcIdPreprocess preprocess = 0) {
    // Here's how it works:
    // game id first
    // npc id second
    // OR
    // npc id first
    // UNLESS gameid_only = true, where:
    // game id first
    int argOffset;
    std::string game_id = "{game_id}";
    std::string npc_id = "{npc_id}";
    bool first = lua_isstring(L, 1);
    bool second = lua_isstring(L, 2);

    if (gameid_only) {
        // OPTIONAL game id
        if (first) {
            argOffset = 1;
            game_id = luaL_checkstring(L, 1);
        } else {
            argOffset = 0;
            game_id = "DEFAULT";
        }
    } else {
        if (second) {
            // OPTIONAL game id present
            argOffset = 2;
            game_id = luaL_checkstring(L, 1);
            npc_id = luaL_checkstring(L, 2);
        } else {
            // MANDATORY npc id
            argOffset = 1;
            npc_id = luaL_checkstring(L, 1);
            game_id = "DEFAULT";
        }
    }

    // replace params
    std::string path_result = path;
    path_result = replace_all(path, "{game_id}", game_id);
    path_result = replace_all(path, "{npc_id}", npc_id);

    if (preprocess) {
        preprocess(L, game_id, npc_id, argOffset);
    }

    // printf("CREATING NPC: %s with arg offsets: %d\n", path_result.c_str(), argOffset);

    return PostAPICall(L, path_result.c_str(), argOffset, has_body);
}

// chat_completion(table/string, function, function?)
int FuncChatCompletion(lua_State* L) {
    // Optional string only to talk to the agent
    if (lua_isstring(L, 1)) {
        std::string message = luaL_checkstring(L, 1);
        std::string json = "{";
            json += "\"messages\": [";
                json += "{";
                    json += "\"content\": ";
                        json += "\"";
                        json += message;
                        json += "\"";
                    json += ",";
                    json += "\"role\": ";
                        json += "\"user\"";
                json += "}";
            json += "]";
        json += "}";

        lua_pushstring(L, json.c_str());
        // replace the old string to the new string we just made and remove the pushed string from the top
        lua_insert(L, 1);
        lua_remove(L, 2);
    }
    return PostAPICall(L, g_ExtensionSettings.chat_completion.c_str());
}

// npc_spawn(game_id, table, function, function)
// npc_spawn(table, function, function)
int FuncNpcSpawn(lua_State* L) {
    return PostAPICallFirstGameIdOrNpcId(L, g_ExtensionSettings.npc_spawn.c_str(), true);
}
// npc_chat(game_id, npc_id, table/string, function? function?)
// npc_chat(npc_id, table/string, function?, function?)
int FuncNpcChat(lua_State* L) {
    return PostAPICallFirstGameIdOrNpcId(L, g_ExtensionSettings.npc_chat.c_str(), false, true, [](lua_State *L, std::string game_id, std::string npc_id, int arg_offset) {

        // Optional string only to talk to the agent

        // the arg AFTER arg offset is the string
        int string_index = arg_offset + 1;
        if (lua_isstring(L, string_index)) {
            std::string message = luaL_checkstring(L, arg_offset + 1);

            // Add table to stack
            lua_createtable(L, 0, 2);
            lua_pushstring(L, message.c_str());
            lua_setfield(L, -2, "sender_message");
            lua_pushstring(L, "");
            lua_setfield(L, -2, "sender_name");

            // replace the string from the table we just made and remove the table from the top
            lua_insert(L, string_index);
            lua_remove(L, string_index + 1);
        }
    });
}
// npc_kill(game_id, npc_id, function?, function?)
// npc_kill(npc_id, function?, function?)
int FuncNpcKill(lua_State* L) {
    return PostAPICallFirstGameIdOrNpcId(L, g_ExtensionSettings.npc_kill.c_str(), false, false);
}

// npc_responses(game_id, function, function?, function?)
// npc_responses(function, function?, function?)
int FuncNpcResponses(lua_State* L) {
    DM_LUA_STACK_CHECK(L, 1);

    // optional game_id
    int arg_offset = 0;
    std::string game_id = "{game_id}";
    if (lua_isstring(L, 1)) {
        game_id = luaL_checkstring(L, 1);
        arg_offset = 1;
    }

    std::string path = g_ExtensionSettings.npc_responses;
    path = replace_all(path, "{game_id}", game_id);

    // Callbacks
    auto callback = RegisterCallback(L, arg_offset + 1);
    auto callback_finish = RegisterCallback(L, arg_offset + 2);
    auto callback_fail = RegisterCallback(L, arg_offset + 3);

    // TODO: delete this if it is not necessary
    // Headers
    // httplib::Headers headers;
    // httplib::Headers merge_headers = {
    //     { "Content-Type", "application/json" }
    // };
    // headers.insert(merge_headers.begin(), merge_headers.end());
    StreamId id = PerformGetStream(path.c_str(), [L, callback](std::string data) {
        // on receive
        InvokeCallback(L, callback, [data] (lua_State *L) {
            DM_LUA_STACK_CHECK(L, 1);

            bool json_reply = true; // All content is json yeah
            if (json_reply) {
                if (!PushLuaTableFromJsonString(L, data)) {

                    printf("Failed to parse json reply: %s", data.c_str());
                    lua_pushstring(L, data.c_str());
                }
            } else {
                lua_pushstring(L, data.c_str());
            }

            return 1;
        });
    }, [L, callback_finish](httplib::Headers headers) {
        // on finish
        InvokeCallback(L, callback_finish, [] (lua_State *L) {
            DM_LUA_STACK_CHECK(L, 0);
            return 0;
        });
    }, [L, callback_fail](std::string data, int error_code) {
        // on fail
        InvokeCallback(L, callback_fail, [data, error_code] (lua_State *L) {
            DM_LUA_STACK_CHECK(L, 2);

            lua_pushstring(L, data.c_str());
            lua_pushinteger(L, error_code);
            return 2;
        });
    });

    // Push result
    lua_pushinteger(L, id);

    return 1;
}

// stop_npc_responses(int)
int StopFuncNpcResponses(lua_State* L) {
    DM_LUA_STACK_CHECK(L, 0);

    StreamId id = luaL_checkinteger(L, 1);
    StopGetStream(id);

    return 0;
}

// Functions exposed to Lua
const luaL_reg Module_methods[] =
{
    {"chat_completion", FuncChatCompletion},
    {"npc_spawn", FuncNpcSpawn},
    {"npc_kill", FuncNpcKill},
    {"npc_chat", FuncNpcChat},
    {"npc_responses", FuncNpcResponses},
    {"stop_npc_responses", StopFuncNpcResponses},
    {0, 0}
};

void LuaInit(lua_State* L)
{
    int top = lua_gettop(L);

    // Register lua names
    luaL_register(L, MODULE_NAME, Module_methods);

    lua_pop(L, 1);
    assert(top == lua_gettop(L));
}

dmExtension::Result AppInitializePlayer2AINPC(dmExtension::AppParams* params)
{
    LoadExtensionSettings(params);

    return dmExtension::RESULT_OK;
}

dmExtension::Result InitializePlayer2AINPC(dmExtension::Params* params)
{
    // Init Lua
    LuaInit(params->m_L);

    printf("Registered %s Extension\n", MODULE_NAME);

    // Init other things
    InitQueue();
    InitHttpShorthands();

    return dmExtension::RESULT_OK;
}

dmExtension::Result AppFinalizePlayer2AINPC(dmExtension::AppParams* params)
{
    return dmExtension::RESULT_OK;
}

dmExtension::Result FinalizePlayer2AINPC(dmExtension::Params* params)
{
    return dmExtension::RESULT_OK;
}

static dmExtension::Result UpdatePlayer2AINPC(dmExtension::Params *params)
{
    // Flush/execute queue calls
    RunQueue();
    return dmExtension::RESULT_OK;

}


DM_DECLARE_EXTENSION(Player2AINPC, LIB_NAME, AppInitializePlayer2AINPC, AppFinalizePlayer2AINPC, InitializePlayer2AINPC, UpdatePlayer2AINPC, 0, FinalizePlayer2AINPC)
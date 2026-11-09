// stamp.cpp
#define LIB_NAME "stamp"
#define MODULE_NAME "stamp"

#include <dmsdk/sdk.h>

static int issue(lua_State *L)
{
    lua_pushstring(L, "stamp");
    return 1;
}

static int at(lua_State *L)
{
    luaL_checkinteger(L, 1);
    lua_pushstring(L, "stamp");
    return 1;
}

// Functions exposed to Lua
static const luaL_reg Module_methods[] =
    {
        {"issue", issue},
        {"at", at},
        {0, 0}};

static void LuaInit(lua_State *L)
{
    int top = lua_gettop(L);
    luaL_register(L, MODULE_NAME, Module_methods);
    lua_pop(L, 1);
    assert(top == lua_gettop(L));
}

dmExtension::Result Initializestamp(dmExtension::Params *params)
{
    LuaInit(params->m_L);
    return dmExtension::RESULT_OK;
}

DM_DECLARE_EXTENSION(stamp, LIB_NAME, 0, 0, Initializestamp, 0, 0, 0)

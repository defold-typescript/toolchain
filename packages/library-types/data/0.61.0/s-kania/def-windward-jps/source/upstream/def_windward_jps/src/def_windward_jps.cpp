// def_windward_jps.cpp
// Extension lib defines
#define LIB_NAME "DefWindwardJps"
#define MODULE_NAME "def_windward_jps"

// include the Defold SDK
#include <dmsdk/sdk.h>

// include JPS algorithm components
#include "jps.hpp"
#include "grid.hpp"

#include "tools.hpp"

#include <string.h>
#include <new>

// Helper function to read Location from Lua table at given index
static Location ReadLocation(lua_State* L, int index)
{
    Location loc;

    // Convert to absolute index to keep referencing the table
    int abs_index = index;
    if (abs_index < 0) {
        abs_index = lua_gettop(L) + abs_index + 1;
    }

    lua_pushinteger(L, 1); // key for x
    lua_gettable(L, abs_index);
    loc.x = luaL_checkinteger(L, -1) - 1;
    lua_pop(L, 1);

    lua_pushinteger(L, 2); // key for y
    lua_gettable(L, abs_index);
    loc.y = luaL_checkinteger(L, -1) - 1;
    lua_pop(L, 1);

    return loc;
}

// Helper function to push Location to Lua as table {x, y}
static void PushLocation(lua_State* L, const Location& loc)
{
    lua_newtable(L);
    
    lua_pushinteger(L, loc.x + 1);
    lua_rawseti(L, -2, 1);
    
    lua_pushinteger(L, loc.y + 1);
    lua_rawseti(L, -2, 2);
}

// GridWrapper to hold Grid instance in Lua userdata
struct GridWrapper
{
    Grid grid;
    bool initialized;

    GridWrapper() : initialized(false) {}
};

static const char* GRID_MT_NAME = "def_windward_jps.Grid";

// Helper to check and retrieve GridWrapper from userdata
static GridWrapper* CheckGridWrapper(lua_State* L, int index)
{
    void* ud = luaL_checkudata(L, index, GRID_MT_NAME);
    luaL_argcheck(L, ud != 0, index, "Grid expected");
    return (GridWrapper*)ud;
}

// Create a new Grid instance
// Parameters: width, height, walls_table
// Returns: userdata (Grid instance)
static int CreateGrid(lua_State* L)
{
    DM_LUA_STACK_CHECK(L, 1);

    int width = luaL_checkinteger(L, 1);
    int height = luaL_checkinteger(L, 2);
    luaL_checktype(L, 3, LUA_TTABLE);

    // Allocate userdata for GridWrapper
    GridWrapper* wrapper = (GridWrapper*)lua_newuserdata(L, sizeof(GridWrapper));
    
    // Placement new to call constructor (C++98 compatible)
    new (wrapper) GridWrapper();

    // Set metatable
    luaL_getmetatable(L, GRID_MT_NAME);
    lua_setmetatable(L, -2);

    // Initialize grid
    wrapper->grid.reset(width, height);

    // Set walls from table
    int walls_count = lua_objlen(L, 3);
    for(int i = 1; i <= walls_count; ++i) {
        lua_rawgeti(L, 3, i);
        Location wall = ReadLocation(L, -1);
        wrapper->grid.set_blocked(wall, true);
        lua_pop(L, 1);
    }

    wrapper->initialized = true;
    return 1;
}

// Main pathfinding function exposed to Lua as method on Grid instance
// Parameters: self (Grid userdata), start_table, goal_table, heuristic_name (optional)
// Returns: path table or nil plus error message
static int FindPath(lua_State* L)
{
    DM_LUA_STACK_CHECK(L, 2);

    // Get Grid instance from self (first parameter)
    GridWrapper* wrapper = CheckGridWrapper(L, 1);
    
    if(!wrapper->initialized) {
        lua_pushnil(L);
        lua_pushstring(L, "grid not initialized");
        return 2;
    }

    luaL_checktype(L, 2, LUA_TTABLE);
    Location start = ReadLocation(L, 2);

    luaL_checktype(L, 3, LUA_TTABLE);
    Location goal = ReadLocation(L, 3);

    heuristic_fn* heuristic = Tool::octile;
    if(lua_gettop(L) >= 4 && lua_isstring(L, 4)) {
        const char* heuristic_name = lua_tostring(L, 4);
        if(strcmp(heuristic_name, "manhattan") == 0) {
            heuristic = Tool::manhattan;
        } else if(strcmp(heuristic_name, "euclidean") == 0) {
            heuristic = Tool::euclidean;
        } else if(strcmp(heuristic_name, "octile") == 0) {
            heuristic = Tool::octile;
        }
    }

    Grid& grid = wrapper->grid;

    if(!grid.in_bounds(start) || !grid.passable(start)) {
        lua_pushnil(L);
        lua_pushstring(L, "start position is invalid or blocked");
        return 2;
    }

    if(!grid.in_bounds(goal) || !grid.passable(goal)) {
        lua_pushnil(L);
        lua_pushstring(L, "goal position is invalid or blocked");
        return 2;
    }

    int max_nodes = grid.grid_size();
    Location* path_buffer = new Location[max_nodes];
    struct PathBufferGuard
    {
        Location* ptr;
        PathBufferGuard(Location* p) : ptr(p) {}
        ~PathBufferGuard() { if(ptr != 0) delete[] ptr; }
        void release() { ptr = 0; }
    } path_guard(path_buffer);

    int path_length = jps_find_path(grid, start, goal, heuristic, path_buffer, max_nodes);

    if(path_length <= 0) {
        lua_pushnil(L);
        lua_pushstring(L, "no path found");
        return 2;
    }

    lua_newtable(L);
    int i;
    for(i = 0; i < path_length; ++i) {
        PushLocation(L, path_buffer[i]);
        lua_rawseti(L, -2, i + 1);
    }
    path_guard.release();
    lua_pushnil(L);
    return 2;
}

// Check if a point is walkable (not blocked)
// Parameters: self (Grid userdata), point_table
// Returns: boolean
static int IsWalkable(lua_State* L)
{
    DM_LUA_STACK_CHECK(L, 1);

    GridWrapper* wrapper = CheckGridWrapper(L, 1);
    
    if(!wrapper->initialized) {
        lua_pushboolean(L, 0);
        return 1;
    }

    luaL_checktype(L, 2, LUA_TTABLE);
    Location point = ReadLocation(L, 2);

    Grid& grid = wrapper->grid;
    bool walkable = grid.passable(point);
    
    lua_pushboolean(L, walkable ? 1 : 0);
    return 1;
}

// Garbage collection for GridWrapper
static int GridGC(lua_State* L)
{
    GridWrapper* wrapper = (GridWrapper*)luaL_checkudata(L, 1, GRID_MT_NAME);
    if(wrapper) {
        // Explicitly call destructor
        wrapper->GridWrapper::~GridWrapper();
    }
    return 0;
}

// Module-level functions
static const luaL_reg Module_methods[] =
{
    {"create_grid", CreateGrid},
    {0, 0}
};

// Grid instance methods
static const luaL_reg Grid_methods[] =
{
    {"find_path", FindPath},
    {"is_walkable", IsWalkable},
    {"__gc", GridGC},
    {0, 0}
};

static void LuaInit(lua_State* L)
{
    int top = lua_gettop(L);

    // Create metatable for Grid userdata
    luaL_newmetatable(L, GRID_MT_NAME);
    
    // Set __index to point to itself (methods lookup)
    lua_pushvalue(L, -1);
    lua_setfield(L, -2, "__index");
    
    // Register Grid methods
    luaL_register(L, 0, Grid_methods);
    lua_pop(L, 1);

    // Register module-level functions
    luaL_register(L, MODULE_NAME, Module_methods);

    lua_pop(L, 1);
    assert(top == lua_gettop(L));
}

static dmExtension::Result InitializeDefWindwardJps(dmExtension::Params* params)
{
    // Init Lua
    LuaInit(params->m_L);
    dmLogInfo("Registered %s Extension", MODULE_NAME);
    return dmExtension::RESULT_OK;
}

static dmExtension::Result AppInitializeDefWindwardJps(dmExtension::Params* params)
{
    return dmExtension::RESULT_OK;
}

static dmExtension::Result FinalizeDefWindwardJps(dmExtension::Params* params)
{
    (void)params;
    jps_shutdown();
    return dmExtension::RESULT_OK;
}

// Defold SDK uses a macro for setting up extension entry points:
//
// DM_DECLARE_EXTENSION(symbol, name, app_init, app_final, init, update, on_event, final)

// DefWindwardJps is the C++ symbol that holds all relevant extension data.
// It must match the name field in the `ext.manifest`
DM_DECLARE_EXTENSION(DefWindwardJps, LIB_NAME, AppInitializeDefWindwardJps, FinalizeDefWindwardJps, InitializeDefWindwardJps, 0, 0, 0)

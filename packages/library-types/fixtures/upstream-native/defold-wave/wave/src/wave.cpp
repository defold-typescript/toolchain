// wave.cpp
// Extension lib defines

#include "dmsdk/dlib/vmath.h"
#include "dmsdk/script/script.h"
#define LIB_NAME "Wave"
#define MODULE_NAME "wave"

#include <dmsdk/sdk.h>
#include "wave_helper.h"
#include "dmsdk/gameobject/gameobject.h"
#include <cstdint>

static int wave_init(lua_State* L)
{
    float            wave1_direction = luaL_checknumber(L, 1);
    float            wave1_amplitude = luaL_checknumber(L, 2);
    float            wave1_wavelength = luaL_checknumber(L, 3);
    float            wave1_speed = luaL_checknumber(L, 4);

    float            wave2_direction = luaL_checknumber(L, 5);
    float            wave2_amplitude = luaL_checknumber(L, 6);
    float            wave2_wavelength = luaL_checknumber(L, 7);
    float            wave2_speed = luaL_checknumber(L, 8);

    float            time_speed = luaL_checknumber(L, 9);
    uint32_t         gameobject_capacity = luaL_checkinteger(L, 10);

    wave::WaveConfig wave1_config;
    wave1_config.m_Direction = wave1_direction;
    wave1_config.m_Amplitude = wave1_amplitude;
    wave1_config.m_Wavelength = wave1_wavelength;
    wave1_config.m_Speed = wave1_speed;

    wave::WaveConfig wave2_config;
    wave2_config.m_Direction = wave2_direction;
    wave2_config.m_Amplitude = wave2_amplitude;
    wave2_config.m_Wavelength = wave2_wavelength;
    wave2_config.m_Speed = wave2_speed;

    wave::init(wave1_config, wave2_config, time_speed, gameobject_capacity);

    return 0;
}

static int wave_update_wave1(lua_State* L)
{
    float             wave1_direction = luaL_checknumber(L, 1);
    float             wave1_amplitude = luaL_checknumber(L, 2);
    float             wave1_wavelength = luaL_checknumber(L, 3);
    float             wave1_speed = luaL_checknumber(L, 4);

    wave::WaveConfig* wave1_config = wave::get_wave1();
    wave1_config->m_Direction = wave1_direction;
    wave1_config->m_Amplitude = wave1_amplitude;
    wave1_config->m_Wavelength = wave1_wavelength;
    wave1_config->m_Speed = wave1_speed;
    wave::update_wave1();
    return 0;
}

static int wave_update_wave2(lua_State* L)
{
    float             wave2_direction = luaL_checknumber(L, 1);
    float             wave2_amplitude = luaL_checknumber(L, 2);
    float             wave2_wavelength = luaL_checknumber(L, 3);
    float             wave2_speed = luaL_checknumber(L, 4);

    wave::WaveConfig* wave2_config = wave::get_wave2();
    wave2_config->m_Direction = wave2_direction;
    wave2_config->m_Amplitude = wave2_amplitude;
    wave2_config->m_Wavelength = wave2_wavelength;
    wave2_config->m_Speed = wave2_speed;
    wave::update_wave2();
    return 0;
}

static int wave_set_yaw(lua_State* L)
{
    uint32_t wave_id = luaL_checkinteger(L, 1);
    float    yaw = luaL_checknumber(L, 2);
    wave::set_yaw(wave_id, yaw);
    return 0;
}

static int wave_move_gameobject(lua_State* L)
{
    uint32_t wave_id = luaL_checkinteger(L, 1);
    float    max_speed = luaL_checknumber(L, 2);
    float    speed_factor = luaL_checknumber(L, 3);
    wave::move(wave_id, max_speed, speed_factor);

    return 0;
}

static int wave_stop(lua_State* L)
{
    uint32_t wave_id = luaL_checkinteger(L, 1);

    wave::stop(wave_id);

    return 0;
}

static int wave_pause(lua_State* L)
{
    bool state = lua_toboolean(L, 1);
    wave::pause(state);
    return 0;
}

static int wave_is_pause(lua_State* L)
{
    DM_LUA_STACK_CHECK(L, 1);
    bool state = lua_toboolean(L, 1);

    lua_pushboolean(L, wave::is_pause());
    return 1;
}

static int wave_add_gameobject(lua_State* L)
{
    DM_LUA_STACK_CHECK(L, 1);

    dmGameObject::HInstance gameobject_instance = dmScript::CheckGOInstance(L, 1);

    float                   float_offset = luaL_checknumber(L, 2);
    float                   water_base_y = luaL_checknumber(L, 3);
    float                   sample_Distance = luaL_checknumber(L, 4);
    float                   rotation_smoothing = luaL_optnumber(L, 5, 0.0f);
    bool                    use_world_transform = lua_toboolean(L, 6);

    wave::Entity            entity;

    entity.m_Id = 0;
    entity.m_GameObjectInstance = gameobject_instance;
    entity.m_Position = use_world_transform ? dmGameObject::GetWorldPosition(gameobject_instance) : dmGameObject::GetPosition(gameobject_instance);

    entity.m_Rotation = use_world_transform ? dmGameObject::GetWorldRotation(gameobject_instance) : dmGameObject::GetRotation(gameobject_instance);
    entity.m_FloatOffset = float_offset;
    entity.m_WaterBaseY = water_base_y;
    entity.m_SampleDistance = sample_Distance;

    entity.m_RotationSmoothing = rotation_smoothing;
    entity.m_EnableRotation = true;
    if (rotation_smoothing <= 0.0)
    {
        entity.m_EnableRotation = false;
    }
    entity.m_UseWorldTransform = use_world_transform;

    if (lua_gettop(L) >= 7 && !lua_isnil(L, 7))
    {
        dmVMath::Vector3* lf = dmScript::CheckVector3(L, 7);
        dmVMath::Quat     inv_rot = dmVMath::Conjugate(entity.m_Rotation);
        entity.m_LocalForward = dmVMath::Normalize(dmVMath::Rotate(inv_rot, *lf));
    }

    uint32_t id = wave::add_gameobject(entity);

    lua_pushinteger(L, id);
    return 1;
}

static int wave_shutdown(lua_State* L)
{
    wave::shutdown();
    return 0;
}

static int wave_get_wave1_height(lua_State* L)
{
    DM_LUA_STACK_CHECK(L, 1);

    float pos_x = luaL_checknumber(L, 1);
    float pos_z = luaL_checknumber(L, 2);
    float time = luaL_checknumber(L, 3);

    float height = wave::get_wave1_height(pos_x, pos_z);

    lua_pushnumber(L, height);
    return 1;
}

static int wave_get_wave2_height(lua_State* L)
{
    DM_LUA_STACK_CHECK(L, 1);

    float pos_x = luaL_checknumber(L, 1);
    float pos_z = luaL_checknumber(L, 2);
    float time = luaL_checknumber(L, 3);

    float height = wave::get_wave2_height(pos_x, pos_z);

    lua_pushnumber(L, height);
    return 1;
}

// Functions exposed to Lua
static const luaL_reg Module_methods[] = {
    { "init", wave_init },
    { "add_gameobject", wave_add_gameobject },
    { "update_wave1", wave_update_wave1 },
    { "update_wave2", wave_update_wave2 },

    { "get_wave1_height", wave_get_wave1_height },
    { "get_wave2_height", wave_get_wave2_height },

    { "set_yaw", wave_set_yaw },
    { "move", wave_move_gameobject },
    { "stop", wave_stop },
    { "pause", wave_pause },
    { "is_pause", wave_is_pause },

    { "shutdown", wave_shutdown },

    { 0, 0 }
};

static void LuaInit(lua_State* L)
{
    int top = lua_gettop(L);

    // Register lua names
    luaL_register(L, MODULE_NAME, Module_methods);

    lua_pop(L, 1);
    assert(top == lua_gettop(L));
}

static dmExtension::Result AppInitializeWave(dmExtension::AppParams* params)
{
    dmLogInfo("AppInitializeWave");
    uint8_t update_frequency = dmConfigFile::GetInt(params->m_ConfigFile, "display.update_frequency", 0);
    float   m_MaxTimeStep = dmConfigFile::GetFloat(params->m_ConfigFile, "engine.max_time_step", 1.0f / 30);
    wave::set_update_frequency(update_frequency);
    wave::set_max_time_step(m_MaxTimeStep);
    return dmExtension::RESULT_OK;
}

static dmExtension::Result InitializeWave(dmExtension::Params* params)
{
    // Init Lua
    LuaInit(params->m_L);
    dmLogInfo("Registered %s Extension", MODULE_NAME);
    return dmExtension::RESULT_OK;
}

static dmExtension::Result AppFinalizeWave(dmExtension::AppParams* params)
{
    dmLogInfo("AppFinalizeWave");
    return dmExtension::RESULT_OK;
}

static dmExtension::Result FinalizeWave(dmExtension::Params* params)
{
    wave::shutdown();
    return dmExtension::RESULT_OK;
}

static dmExtension::Result OnUpdateWave(dmExtension::Params* params)
{
    wave::update();
    return dmExtension::RESULT_OK;
}

// Defold SDK uses a macro for setting up extension entry points:
//
// DM_DECLARE_EXTENSION(symbol, name, app_init, app_final, init, update, on_event, final)

// Wave is the C++ symbol that holds all relevant extension data.
// It must match the name field in the `ext.manifest`
DM_DECLARE_EXTENSION(Wave, LIB_NAME, AppInitializeWave, AppFinalizeWave, InitializeWave, OnUpdateWave, 0, FinalizeWave)

#pragma once

#define LIB_NAME "Player2AINPC"
#define MODULE_NAME "ainpc"
#define DLIB_LOG_DOMAIN "player2"

// TODO: try to add this in later cause why not
// #ifndef WIN32_LEAN_AND_MEAN
// #define WIN32_LEAN_AND_MEAN
// #endi

// debugging utility
static void stackDump (lua_State *L) {
      int i;
      int top = lua_gettop(L);
      printf("lmfao stack %d: ", top);
      for (i = 1; i <= top; i++) {  /* repeat for each level */
        int t = lua_type(L, i);
        switch (t) {
    
          case LUA_TSTRING:  /* strings */
            printf("`%s'", lua_tostring(L, i));
            break;
    
          case LUA_TBOOLEAN:  /* booleans */
            printf(lua_toboolean(L, i) ? "true" : "false");
            break;
    
          case LUA_TNUMBER:  /* numbers */
            printf("%g", lua_tonumber(L, i));
            break;
    
          default:  /* other values */
            printf("%s", lua_typename(L, t));
            break;
    
        }
        printf("  ");  /* put a separator */
      }
      printf("\n");  /* end the listing */
    }
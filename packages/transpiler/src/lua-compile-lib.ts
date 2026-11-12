// Already-resolved CompilerOptions, so the value is the lib file name, not the
// tsconfig spelling "ES2022". Drops the default `lib.dom`, whose `declare var
// window` shadows Defold's `window` namespace.
export const LUA_COMPILE_LIB: readonly string[] = ["lib.es2022.d.ts"];

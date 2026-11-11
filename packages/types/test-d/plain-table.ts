/// <reference path="../index.d.ts" />

// `PlainTable` is any value Lua holds as a plain table: an object literal, a
// value typed by an interface or a type alias, a Lua table or an array. Engine
// userdata and functions are not tables, so each is rejected.
declare function _ptTakesTable(t: PlainTable): void;

interface PlainTableInterfaceValue {
  level: number;
  name: string;
}
type PlainTableAliasValue = { level: number; name: string };
declare const _ptInterface: PlainTableInterfaceValue;
declare const _ptAlias: PlainTableAliasValue;

_ptTakesTable(_ptInterface);
_ptTakesTable(_ptAlias);
_ptTakesTable({ level: 3, name: "hero" });
_ptTakesTable({ position: vmath.vector3() });
_ptTakesTable(new LuaMap<string, number>());
_ptTakesTable(new LuaTable<string, number>());
_ptTakesTable([1, 2, 3]);

declare const _ptNode: Opaque<"node">;
declare const _ptSocketClient: socket.SocketClient;
declare const _ptConstantArray: ConstantArray<number>;
declare function _ptDeclaredFunction(): void;

// @ts-expect-error a Vector3 is not a table
_ptTakesTable(vmath.vector3());
// @ts-expect-error a Vector4 is not a table
_ptTakesTable(vmath.vector4());
// @ts-expect-error a Quaternion is not a table
_ptTakesTable(vmath.quat());
// @ts-expect-error a Matrix4 is not a table
_ptTakesTable(vmath.matrix4());
// @ts-expect-error a Vector is not a table
_ptTakesTable(vmath.vector([1, 2]));
// @ts-expect-error a Hash is not a table
_ptTakesTable(hash("x"));
// @ts-expect-error a Url is not a table
_ptTakesTable(msg.url());
// @ts-expect-error an Opaque handle is not a table
_ptTakesTable(_ptNode);
// @ts-expect-error a socket handle is not a table
_ptTakesTable(_ptSocketClient);
// @ts-expect-error a ConstantArray is not a table
_ptTakesTable(_ptConstantArray);
// @ts-expect-error an arrow function is not a table
_ptTakesTable(() => 1);
// @ts-expect-error a declared function is not a table
_ptTakesTable(_ptDeclaredFunction);
// @ts-expect-error a number is not a table
_ptTakesTable(42);

declare const _ptThread: LuaThread;
declare const _ptUserdata: LuaUserdata;

// @ts-expect-error a Lua file handle is not a table
_ptTakesTable(io.stdout);
// @ts-expect-error a LuaThread is not a table
_ptTakesTable(_ptThread);
// @ts-expect-error a LuaUserdata is not a table
_ptTakesTable(_ptUserdata);
// @ts-expect-error a coroutine is not a table
_ptTakesTable(coroutine.create(() => {}));

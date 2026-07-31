/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as defsave from "defsave.defsave";

// Compile-only proof (mirroring boom-usage.test-d.ts) that the forked defsave
// golden keeps everything ts-defold declared while adding the members it
// omitted and narrowing the three returns it got wrong. This replaces the
// defsave block retired from library-types.test-d.ts when the
// `./defsave.defsave` subpath went away. No assertions execute; `tsc --noEmit`
// under tsconfig.dts-check.json (skipLibCheck: false) is the gate.

// The surface ts-defold already declared still compiles unchanged.
const appname: string = defsave.appname;
defsave.set_appname("my-game");
const volume: unknown = defsave.get("settings", "volume");
defsave.update(1 / 60);
defsave.save_all(true);

// Members upstream exposes that ts-defold never declared.
const filePath: string | undefined = defsave.get_file_path("settings");
const scrambled: string = defsave.obfuscate("payload", "key");
// `key` defaults to `defsave.obfuscation_key` upstream, so it is optional.
const scrambledDefaultKey: string = defsave.obfuscate("payload");
const loadedFlag: boolean = defsave.is_loaded("settings");
// `key_exists` falls off the end (returning nil) when the file is loaded but
// the key is absent, so the honest return is wider than `boolean`.
const exists: boolean | undefined = defsave.key_exists("settings", "volume");
const alsoExists: boolean | undefined = defsave.isset("settings", "volume");
const reset: boolean | undefined = defsave.reset_to_default("settings");
defsave.final();

// The corrected returns: these three were declared `void`/`unknown` before.
const loaded: boolean | undefined = defsave.load("settings");
const saved: boolean | undefined = defsave.save("settings", true);
const wasSet: boolean | undefined = defsave.set("settings", "volume", 1);

// The public config fields carry their upstream types. A namespace import binds
// them read-only whatever the declaration says, so these pin the type by reading
// rather than by assigning.
const autosave: boolean = defsave.autosave;
const autosaveTimer: number = defsave.autosave_timer;
const obfuscationOn: boolean = defsave.enable_obfuscation;
const obfuscationKey: string = defsave.obfuscation_key;
const defaults: LuaMap<string, unknown> = defsave.default_data;
const systemName: string = defsave.sysinfo.system_name;

void appname;
void volume;
void filePath;
void scrambled;
void scrambledDefaultKey;
void loadedFlag;
void exists;
void alsoExists;
void reset;
void loaded;
void saved;
void wasSet;
void autosave;
void autosaveTimer;
void obfuscationOn;
void obfuscationKey;
void defaults;
void systemName;

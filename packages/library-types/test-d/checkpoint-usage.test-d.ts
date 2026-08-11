/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as checkpoint from "checkpoint.checkpoint";

// Compile-only proof for the hand-authored checkpoint surface. No assertions
// execute; `tsc --noEmit` under tsconfig.dts-check.json is the gate. Upstream
// ships plain Lua with no annotations, so this is where the declared shapes are
// held to being callable as written.

interface Settings {
  volume: number;
  name: string;
}

// `read` hands back the loaded value alone on success and `false, err` on every
// failure path, so the first slot has to be narrowed before it can be indexed.
// The type parameter is what lets a caller name the shape they saved.
const [_loaded, _readError] = checkpoint.read<Settings>("settings.json");
// @ts-expect-error `read`'s first slot is `Settings | false` until the failure arm is ruled out.
const _volumeUnchecked: number = _loaded.volume;
if (_loaded !== false) {
  const _volume: number = _loaded.volume;
  void _volume;
}
// The error slot is only populated on the failure path, so it is optional.
// @ts-expect-error the error string is absent on success, so it needs a null check.
const _errorLength: number = _readError.length;
const _checkedError: number = _readError === undefined ? 0 : _readError.length;

// Without a type argument the loaded value stays the honest `unknown`.
const [_unknownValue] = checkpoint.read("save.bin");

// `write` returns `true` on success and `false, err` on each failure path.
const [_written, _writeError] = checkpoint.write("settings.json", { volume: 0.5 });
const _ok: boolean = _written;
const _writeErrorChecked: string = _writeError ?? "";

// `lfs.attributes(...) and true or false` — a real boolean, so it reads directly
// as a condition rather than needing a truthiness cast.
if (checkpoint.exists("settings.json")) {
  const _first: string = checkpoint.list()[0] as string;
  void _first;
}

// Both constants resolve once at load, so they are plain strings.
const _title: string = checkpoint.project_title;
const _savePath: string = checkpoint.project_save_path;

void _loaded;
void _readError;
void _volumeUnchecked;
void _errorLength;
void _checkedError;
void _unknownValue;
void _written;
void _writeError;
void _ok;
void _writeErrorChecked;
void _title;
void _savePath;

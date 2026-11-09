/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import { beacon } from "beacon.beacon";

const cb = (...args: unknown[]): unknown => args;

const _language: string = beacon.platform.language();
const _payload: string | undefined = beacon.platform.payload();
// @ts-expect-error the return is nullable and must be narrowed before use
const _required: string = beacon.platform.payload();
beacon.platform.send("ready", cb, cb);
beacon.platform.send("ready", {}, cb, cb);

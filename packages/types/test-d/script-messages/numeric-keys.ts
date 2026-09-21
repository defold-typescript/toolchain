/// <reference path="../../index.d.ts" />

import { defineScript } from "../../src/lifecycle";

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// A numeric key is sent under its JavaScript property key, the id the
// transpiler hashes: `1e3` is "1000".
const numeric = defineScript({
  on_message: onMessage({
    42(_self, _message: { count: number }) {},
    1e3: (_self, _message: { n: number }) => {},
  }),
});

type M = ScriptMessages<typeof numeric>;
const _numeric: Exact<M, { "42": { count: number }; "1000": { n: number } }> = true;
void _numeric;

const target = msg.url<M>("#x");
msg.post(target, "42", { count: 3 });
// @ts-expect-error "42" declares `count` as a number
msg.post(target, "42", { count: "3" });

const quoted = defineScript({
  on_message: onMessage({
    "42"(_self, _message: { count: number }) {},
    "1000": (_self, _message: { n: number }) => {},
  }),
});

const _quoted: Exact<ScriptMessages<typeof quoted>, M> = true;
void _quoted;

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { type OpenApiDoc, type OpenApiElement, parseOpenApi } from "./parse-openapi-api";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const SWAGGER = readFileSync(
  join(PACKAGE_ROOT, "fixtures/openapi/nakama.nakama.swagger.json"),
  "utf8",
);
const PROTO = readFileSync(join(PACKAGE_ROOT, "fixtures/openapi/nakama.nakama.api.proto"), "utf8");

function element(doc: OpenApiDoc, name: string): OpenApiElement | undefined {
  return doc.elements.find((e) => e.name === name);
}

describe("parseOpenApi on the committed nakama swagger + realtime proto", () => {
  const doc = parseOpenApi(SWAGGER, PROTO);

  test("info.namespace is empty — the swagger/proto source carries no module alias", () => {
    // Unlike a README's `camera.` alias, neither the swagger nor the proto names a
    // publish namespace; the front-end retargets bare names onto `nakama` later.
    expect(doc.info.namespace).toBe("");
    expect(doc.elements.every((e) => e.type === "FUNCTION")).toBe(true);
  });

  test("codegens a swagger REST operation into a snake_case client function", () => {
    // operationId `Nakama_AuthenticateCustom` -> strip the service prefix, snake.
    const fn = element(doc, "authenticate_custom");
    expect(fn).toBeDefined();
    const params = fn?.parameters.map((p) => p.name) ?? [];
    // `account` is the body param, `create`/`username` the query params.
    expect(params).toContain("account");
    expect(params).toContain("create");
    expect(params).toContain("username");
    // A non-required query param carries optionality; the required body does not.
    const create = fn?.parameters.find((p) => p.name === "create");
    expect(create?.is_optional).toBe("True");
    const account = fn?.parameters.find((p) => p.name === "account");
    expect(account?.is_optional).toBeUndefined();
    // The 200 response `$ref` resolves to an object token, never an empty slot.
    expect(fn?.returnvalues.every((r) => r.types.length > 0)).toBe(true);
  });

  test("codegens a swagger definition into a `create_<snake>` constructor", () => {
    // definition `apiAccountCustom` -> `create_api_account_custom`.
    const ctor = element(doc, "create_api_account_custom");
    expect(ctor).toBeDefined();
    expect(ctor?.parameters.map((p) => p.name)).toEqual(["id", "vars"]);
    const id = ctor?.parameters.find((p) => p.name === "id");
    expect(id?.types).toEqual(["string"]);
  });

  test("surfaces a proto realtime message as a `create_<snake>_message` constructor", () => {
    expect(element(doc, "create_match_create_message")).toBeDefined();
    const send = element(doc, "create_channel_message_send_message");
    expect(send).toBeDefined();
    // proto `string channel_id = 1; string content = 2;`.
    expect(send?.parameters.map((p) => p.name)).toEqual(["channel_id", "content"]);
    expect(send?.parameters.every((p) => p.types.length > 0)).toBe(true);
  });

  test("no slot is left with an empty type token (no silent swallow)", () => {
    for (const el of doc.elements) {
      for (const slot of [...el.parameters, ...el.returnvalues]) {
        expect(slot.types.length).toBeGreaterThan(0);
      }
    }
  });

  test("an inline empty message does not swallow the following message", () => {
    const inline = parseOpenApi(
      "{}",
      "message Ping {}\nmessage Status {\n  repeated string user_ids = 1;\n}\n",
    );
    const ping = element(inline, "create_ping_message");
    expect(ping).toBeDefined();
    expect(ping?.parameters).toEqual([]);
    const status = element(inline, "create_status_message");
    expect(status).toBeDefined();
    expect(status?.parameters.map((p) => p.name)).toEqual(["user_ids"]);
    expect(status?.parameters[0]?.types).toEqual(["table"]);
  });

  test("the message tail after `Ping {}` is no longer dropped", () => {
    // Ping (line 583) and every following top-level message through UserPresence
    // used to accumulate into the never-closed Ping frame and disappear.
    for (const name of [
      "create_ping_message",
      "create_pong_message",
      "create_status_follow_message",
      "create_status_unfollow_message",
      "create_status_update_message",
      "create_stream_message",
      "create_stream_data_message",
      "create_user_presence_message",
    ]) {
      expect(element(doc, name)).toBeDefined();
    }
  });

  test("a direct `oneof` alternative is a parent field, marked optional", () => {
    // MatchJoin: `oneof id { string match_id = 1; string token = 2; }` plus the
    // depth-1 `map<string,string> metadata = 3;`.
    const join = element(doc, "create_match_join_message");
    expect(join).toBeDefined();
    const names = join?.parameters.map((p) => p.name) ?? [];
    expect(names).toContain("match_id");
    expect(names).toContain("token");
    expect(names).toContain("metadata");
    expect(join?.parameters.find((p) => p.name === "match_id")?.is_optional).toBe("True");
    expect(join?.parameters.find((p) => p.name === "token")?.is_optional).toBe("True");
  });

  test("a nested `message` block is isolated, not flattened into its parent", () => {
    // MatchmakerMatched nests `message MatchmakerUser`; its `presence`/`party_id`
    // fields must not leak into the parent constructor.
    const matched = element(doc, "create_matchmaker_matched_message");
    expect(matched).toBeDefined();
    const names = matched?.parameters.map((p) => p.name) ?? [];
    expect(names).not.toContain("presence");
    expect(names).not.toContain("party_id");
    // The parent's own oneof alternatives are still present.
    expect(names).toContain("match_id");
    expect(names).toContain("token");
  });
});

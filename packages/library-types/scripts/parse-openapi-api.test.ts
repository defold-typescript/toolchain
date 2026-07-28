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
});

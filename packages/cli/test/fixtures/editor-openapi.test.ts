import { describe, expect, test } from "bun:test";
import { type EditorPaths, evalRouteOf } from "./editor-openapi";

const evalLike = {
  security: [{ bearer: [] }],
  requestBody: { content: { "text/plain": { example: "return editor.version" } } },
  responses: { "200": { content: { "text/plain": { example: "=> 1.13.1\n" } } } },
};

describe("evalRouteOf", () => {
  test("throws naming the recording when no operation matches", () => {
    const paths: EditorPaths = {
      "/prefs/{path}": {
        post: {
          requestBody: { content: { "application/json": { example: "1" } } },
          responses: { "200": {} },
        },
      },
      "/command/{command}": { post: { responses: { "200": {} } } },
    };

    expect(() => evalRouteOf({ paths })).toThrow(/editor-openapi\.json[\s\S]*\b0\b/);
  });

  test("throws naming every match when more than one operation matches", () => {
    const paths: EditorPaths = {
      "/eval": { post: { ...evalLike } },
      "/evaluate": { post: { ...evalLike } },
    };

    let message = "";
    try {
      evalRouteOf({ paths });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("editor-openapi.json");
    expect(message).toContain("/eval");
    expect(message).toContain("/evaluate");
  });
});

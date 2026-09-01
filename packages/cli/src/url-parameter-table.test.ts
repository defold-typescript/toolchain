import { describe, expect, test } from "bun:test";
import { classifyUrlParameter } from "@defold-typescript/types";
import { loadUrlParameterTable } from "./url-parameter-table";

describe("loadUrlParameterTable", () => {
  test("resolves the shipped table", () => {
    const table = loadUrlParameterTable();

    // The expected answer comes from the production classifier reading the
    // shipped file, never from a table written into this test.
    expect(classifyUrlParameter(table, "msg.post", "receiver")).toBe("either");
    expect(classifyUrlParameter(table, "go.get_position", "id")).toBe("game-object");
  });

  test("a slot the table does not classify stays `none`", () => {
    const table = loadUrlParameterTable();

    expect(classifyUrlParameter(table, "msg.post", "message_id")).toBe("none");
  });
});

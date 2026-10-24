import { describe, expect, test } from "bun:test";
import { scanEmittedRequires } from "./lua-require-scan";

describe("scanEmittedRequires call spans", () => {
  test("a plain require yields a span covering exactly the call", () => {
    const lua = 'local x = require("a.b")\n';

    const sites = scanEmittedRequires(lua);

    expect(sites).toHaveLength(1);
    const site = sites[0];
    expect(site?.path).toBe("a.b");
    expect(site?.callStart).toBeDefined();
    expect(site?.callEnd).toBeDefined();
    expect(lua.slice(site?.callStart, site?.callEnd)).toBe('require("a.b")');
  });

  test("whitespace and newlines inside the call are inside the span", () => {
    const lua = 'local x = require (\n  "a.b"\n )\nlocal y = 2\n';

    const sites = scanEmittedRequires(lua);

    expect(sites).toHaveLength(1);
    const site = sites[0];
    expect(lua.slice(site?.callStart, site?.callEnd)).toBe('require (\n  "a.b"\n )');
  });

  test("a comment between require and the paren omits the span", () => {
    const lua = 'local x = require --[[c]] ("a.b")\n';

    const sites = scanEmittedRequires(lua);

    expect(sites).toHaveLength(1);
    expect(sites[0]?.path).toBe("a.b");
    expect(sites[0]?.callStart).toBeUndefined();
    expect(sites[0]?.callEnd).toBeUndefined();
  });

  test("a comment between the paren and the literal omits the span", () => {
    const lua = 'local x = require( --[[c]] "a.b")\n';

    const sites = scanEmittedRequires(lua);

    expect(sites).toHaveLength(1);
    expect(sites[0]?.path).toBe("a.b");
    expect(sites[0]?.callStart).toBeUndefined();
    expect(sites[0]?.callEnd).toBeUndefined();
  });

  test("a method-position require yields no site", () => {
    expect(scanEmittedRequires('local x = foo.require("a.b")\n')).toHaveLength(0);
  });

  test("a require spelled inside a string yields no site", () => {
    expect(scanEmittedRequires("local doc = 'require(\"a.b\")'\n")).toHaveLength(0);
  });

  test("a require spelled inside a comment yields no site", () => {
    expect(scanEmittedRequires('-- local x = require("a.b")\n')).toHaveLength(0);
  });
});

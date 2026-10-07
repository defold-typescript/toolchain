const IDENTIFIER = /[A-Za-z_$][\w$]*/y;
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const STRING = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/y;
const WORDS = new Map<string, unknown>([
  ["true", true],
  ["false", false],
  ["null", null],
]);

/**
 * Reads a JSON value, or the same value written as a TypeScript literal:
 * bare keys, single-quoted strings and trailing commas.
 */
export function parseLiteral(text: string): unknown {
  let at = 0;

  const fail = (message: string): never => {
    throw new SyntaxError(`${message} at column ${at + 1}`);
  };

  const skip = (): void => {
    while (at < text.length && /\s/.test(text[at] as string)) {
      at += 1;
    }
  };

  const take = (char: string): boolean => {
    skip();
    if (text[at] !== char) {
      return false;
    }
    at += 1;
    return true;
  };

  const match = (pattern: RegExp): string | undefined => {
    pattern.lastIndex = at;
    const found = pattern.exec(text)?.[0];
    if (found !== undefined) {
      at += found.length;
    }
    return found;
  };

  const string = (): string => {
    const start = at;
    const raw = match(STRING);
    if (raw === undefined) {
      return fail("unclosed string");
    }
    const quoted = raw.startsWith('"')
      ? raw
      : `"${raw.slice(1, -1).replace(/\\.|"/g, (piece) => {
          if (piece === "\\'") {
            return "'";
          }
          return piece === '"' ? '\\"' : piece;
        })}"`;
    try {
      return JSON.parse(quoted) as string;
    } catch {
      at = start;
      return fail("bad string");
    }
  };

  const isQuote = (): boolean => text[at] === '"' || text[at] === "'";

  const object = (): Record<string, unknown> => {
    at += 1;
    const entries: [string, unknown][] = [];
    while (!take("}")) {
      skip();
      const key = isQuote() ? string() : (match(IDENTIFIER) ?? fail("expected a key"));
      if (!take(":")) {
        fail('expected ":"');
      }
      entries.push([key, value()]);
      if (!take(",")) {
        if (!take("}")) {
          fail('expected "," or "}"');
        }
        break;
      }
    }
    return Object.fromEntries(entries);
  };

  const array = (): unknown[] => {
    at += 1;
    const items: unknown[] = [];
    while (!take("]")) {
      items.push(value());
      if (!take(",")) {
        if (!take("]")) {
          fail('expected "," or "]"');
        }
        break;
      }
    }
    return items;
  };

  const value = (): unknown => {
    skip();
    if (text[at] === "{") {
      return object();
    }
    if (text[at] === "[") {
      return array();
    }
    if (isQuote()) {
      return string();
    }
    const number = match(NUMBER);
    if (number !== undefined) {
      return Number(number);
    }
    const start = at;
    const word = match(IDENTIFIER);
    if (word !== undefined && WORDS.has(word)) {
      return WORDS.get(word);
    }
    at = start;
    return fail("expected a value");
  };

  const result = value();
  skip();
  if (at < text.length) {
    fail("unexpected text");
  }
  return result;
}

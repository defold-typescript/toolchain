// Defold's `.go`/`.collection` sources are protobuf text format. A message is a
// tree of `key: <scalar>` and `key { … }` entries where any key may repeat, so
// scalars and sub-messages are kept in separate multi-value maps — the format
// never uses one name as both.
export interface SceneMessage {
  readonly fields: ReadonlyMap<string, readonly string[]>;
  readonly messages: ReadonlyMap<string, readonly SceneMessage[]>;
}

export class SceneTextFormatError extends Error {
  readonly line: number;

  constructor(message: string, line: number) {
    super(`${message} (line ${line})`);
    this.name = "SceneTextFormatError";
    this.line = line;
  }
}

const IDENTIFIER_PART = /[A-Za-z0-9_]/;

function append<T>(target: Map<string, T[]>, key: string, value: T): void {
  const existing = target.get(key);
  if (existing === undefined) {
    target.set(key, [value]);
    return;
  }
  existing.push(value);
}

// Parses one document. Nothing here knows that `data:` holds a payload: an
// embedded `.go` is reached by the caller re-invoking this function on the
// decoded value, which keeps exactly one decode pass per nesting level. A
// greedy unescape would resolve the deeper level's `\\\"` too and leave the
// payload unparseable.
export function parseSceneTextFormat(text: string): SceneMessage {
  let pos = 0;
  let line = 1;

  function fail(message: string, at: number): never {
    throw new SceneTextFormatError(message, at);
  }

  function advance(): string {
    const ch = text.charAt(pos);
    pos += 1;
    if (ch === "\n") line += 1;
    return ch;
  }

  function skipWhitespace(): void {
    while (pos < text.length) {
      const ch = text.charAt(pos);
      if (ch !== " " && ch !== "\t" && ch !== "\r" && ch !== "\n") return;
      advance();
    }
  }

  function skipInlineWhitespace(): void {
    while (pos < text.length) {
      const ch = text.charAt(pos);
      if (ch !== " " && ch !== "\t") return;
      pos += 1;
    }
  }

  function readIdentifier(at: number): string {
    const start = pos;
    while (pos < text.length && IDENTIFIER_PART.test(text.charAt(pos))) {
      pos += 1;
    }
    if (pos === start) {
      fail(`unexpected \`${text.charAt(start)}\``, at);
    }
    return text.slice(start, pos);
  }

  // One or more double-quoted literals, adjacent across whitespace and
  // newlines, concatenated with no separator. `\"`, `\\`, `\n`, `\r` and `\t`
  // resolve; every other backslash pair survives verbatim because it is the
  // next level's escaping.
  function readQuotedScalar(): string {
    let value = "";
    for (;;) {
      const openedAt = line;
      advance();
      let closed = false;
      while (pos < text.length) {
        const ch = advance();
        if (ch === "\\") {
          if (pos >= text.length) break;
          const escaped = advance();
          if (escaped === '"') value += '"';
          else if (escaped === "\\") value += "\\";
          else if (escaped === "n") value += "\n";
          else if (escaped === "r") value += "\r";
          else if (escaped === "t") value += "\t";
          else value += `\\${escaped}`;
          continue;
        }
        if (ch === '"') {
          closed = true;
          break;
        }
        if (ch === "\n") break;
        value += ch;
      }
      if (!closed) {
        fail("unterminated string literal", openedAt);
      }
      const resumePos = pos;
      const resumeLine = line;
      skipWhitespace();
      if (text.charAt(pos) === '"') {
        continue;
      }
      pos = resumePos;
      line = resumeLine;
      return value;
    }
  }

  function readUnquotedScalar(): string {
    const newline = text.indexOf("\n", pos);
    const end = newline === -1 ? text.length : newline;
    const raw = text.slice(pos, end);
    pos = end;
    return raw.trim();
  }

  function parseBody(nested: boolean, openedAt: number): SceneMessage {
    const fields = new Map<string, string[]>();
    const messages = new Map<string, SceneMessage[]>();
    for (;;) {
      skipWhitespace();
      if (pos >= text.length) {
        if (nested) {
          fail("unclosed `{`", openedAt);
        }
        break;
      }
      if (text.charAt(pos) === "}") {
        if (!nested) {
          fail("unexpected `}`", line);
        }
        advance();
        break;
      }
      const keyLine = line;
      const key = readIdentifier(keyLine);
      skipInlineWhitespace();
      const delimiter = text.charAt(pos);
      if (delimiter === "{") {
        const braceLine = line;
        advance();
        append(messages, key, parseBody(true, braceLine));
        continue;
      }
      if (delimiter === ":") {
        advance();
        skipInlineWhitespace();
        append(fields, key, text.charAt(pos) === '"' ? readQuotedScalar() : readUnquotedScalar());
        continue;
      }
      fail(`expected \`:\` or \`{\` after \`${key}\``, keyLine);
    }
    return { fields, messages };
  }

  return parseBody(false, 1);
}

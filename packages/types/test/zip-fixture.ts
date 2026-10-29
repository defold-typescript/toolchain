import { crc32, deflateRawSync } from "node:zlib";

// A spec-following zip writer for tests: local headers, a central directory
// and an end record, nothing more. It shares no code with the production
// reader, so an archive it writes is independent evidence of what the reader
// parses. A name ending in `/` is a directory entry, as an archiver lists it.
// `bytes` stands in for `text` when an entry is not UTF-8, as an image is.
export interface ZipFixtureEntry {
  readonly name: string;
  readonly text?: string;
  readonly bytes?: Uint8Array;
  readonly stored?: boolean;
}

// The archive comment follows the end record, and the record's last field
// carries its byte length, the way `git archive` stores the commit id there.
export interface ZipFixtureOptions {
  readonly comment?: string;
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_RECORD_SIGNATURE = 0x06054b50;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
const VERSION_NEEDED = 20;

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export function writeZipArchive(
  entries: readonly ZipFixtureEntry[],
  options: ZipFixtureOptions = {},
): Uint8Array {
  const encoder = new TextEncoder();
  const comment = encoder.encode(options.comment ?? "");
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const directory = entry.name.endsWith("/");
    const raw = directory ? new Uint8Array(0) : (entry.bytes ?? encoder.encode(entry.text ?? ""));
    const deflate = !directory && entry.stored !== true;
    const data = deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const method = deflate ? METHOD_DEFLATE : METHOD_STORED;
    const crc = crc32(raw);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, LOCAL_HEADER_SIGNATURE, true);
    local.setUint16(4, VERSION_NEEDED, true);
    local.setUint16(6, 0, true);
    local.setUint16(8, method, true);
    local.setUint16(10, 0, true);
    local.setUint16(12, 0, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    const localRecord = concat([new Uint8Array(local.buffer), name, data]);
    locals.push(localRecord);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, CENTRAL_HEADER_SIGNATURE, true);
    central.setUint16(4, VERSION_NEEDED, true);
    central.setUint16(6, VERSION_NEEDED, true);
    central.setUint16(8, 0, true);
    central.setUint16(10, method, true);
    central.setUint16(12, 0, true);
    central.setUint16(14, 0, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, raw.length, true);
    central.setUint16(28, name.length, true);
    central.setUint16(30, 0, true);
    central.setUint16(32, 0, true);
    central.setUint16(34, 0, true);
    central.setUint16(36, 0, true);
    central.setUint32(38, directory ? 0x10 : 0, true);
    central.setUint32(42, offset, true);
    centrals.push(concat([new Uint8Array(central.buffer), name]));

    offset += localRecord.length;
  }

  const centralDirectory = concat(centrals);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, END_RECORD_SIGNATURE, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralDirectory.length, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, comment.length, true);

  return concat([...locals, centralDirectory, new Uint8Array(end.buffer), comment]);
}

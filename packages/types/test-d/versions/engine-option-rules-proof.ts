export {};

// The ref-doc tokens behind these slots differ per target, so every committed
// surface compiles one call each engine rule takes and one it raises on.

declare const id: ReturnType<typeof go.get_id>;
declare const decl: Parameters<typeof buffer.create>[1][number];
declare const buf: ReturnType<typeof buffer.create>;

go.delete(id, true);
// @ts-expect-error a boolean id takes no second argument
go.delete(true, true);
// @ts-expect-error a nil id raises once recursive is popped
go.delete(undefined, true);

resource.create_sound_data("/a.wavc", { data: "", partial: true, filesize: 1 });
// @ts-expect-error a partial chunk reads filesize with no default
resource.create_sound_data("/a.wavc", { data: "", partial: true });

buffer.create(1, [decl]);
// @ts-expect-error the binding raises on an empty declaration list
buffer.create(1, []);

buffer.set_metadata(buf, id, [1], buffer.VALUE_TYPE_FLOAT32);
// @ts-expect-error the binding raises on empty values
buffer.set_metadata(buf, id, [], buffer.VALUE_TYPE_FLOAT32);
// @ts-expect-error 64-bit metadata raises
buffer.set_metadata(buf, id, [1], buffer.VALUE_TYPE_INT64);

go.get(id, "p", { index: 1, key: undefined });
// @ts-expect-error the options table names at most one of index, key and keys
go.get(id, "p", { index: 1, key: "k" });
// @ts-expect-error the options table names at most one of index, key and keys
go.set(id, "p", 1, { key: "k", keys: ["e"] });

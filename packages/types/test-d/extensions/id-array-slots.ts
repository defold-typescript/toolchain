// The prose-only "table (array) of ids" slot is an array shape the field parser
// cannot read; its element token is hand-curated in HOMOGENEOUS_ARRAY_SLOTS and
// emitted as a plain array. iap.list's element is the single token `string`.

// iap.list accepts a string[] of product identifiers.
iap.list(["sku.a", "sku.b"], () => {});

// @ts-expect-error iap.list wants a string[], not a number[]
iap.list([1, 2], () => {});

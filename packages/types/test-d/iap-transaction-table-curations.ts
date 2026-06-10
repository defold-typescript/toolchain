/// <reference path="../index.d.ts" />

// iap.finish and iap.acknowledge take the same prose-only transaction object the
// field parser cannot read; it is hand-curated as a param-side object curation,
// so every field is optional. A value shaped like the curated transaction is
// accepted by both, and a concrete field reads as `string | undefined` without a
// cast.

type FinishTransaction = Parameters<typeof iap.finish>[0];
type AcknowledgeTransaction = Parameters<typeof iap.acknowledge>[0];

const transaction: FinishTransaction = {
  ident: "com.example.coins",
  state: 4,
  trans_ident: "trans-1",
  date: "2024-01-01",
  original_trans: "orig-1",
  receipt: "deadbeef",
  signature: "sig",
  user_id: "user-1",
};

iap.finish(transaction);

const sameShape: AcknowledgeTransaction = transaction;
iap.acknowledge(sameShape);

const _ident: string | undefined = transaction.ident;
void _ident;

// @ts-expect-error ident is string | undefined, not number
const _badIdent: number = transaction.ident;
void _badIdent;

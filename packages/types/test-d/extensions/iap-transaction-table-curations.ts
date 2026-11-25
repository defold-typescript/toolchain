import * as iap from "iap";

// iap.finish and iap.acknowledge take "the transaction table parameter as
// supplied in listener callback", so the listener hands its transaction on as it
// is, and a table missing the listener's fields is no transaction.

iap.set_listener((_self, transaction) => {
  iap.finish(transaction);
  iap.acknowledge(transaction);
  const _ident: string = transaction.ident;
  void _ident;
});

// @ts-expect-error a table with only an ident is not the listener's transaction
iap.finish({ ident: "com.example.coins" });

// @ts-expect-error a table with only an ident is not the listener's transaction
iap.acknowledge({ ident: "com.example.coins" });

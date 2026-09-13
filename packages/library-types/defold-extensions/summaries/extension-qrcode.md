---
api: untyped
---

## What it ships

A small native extension that encodes and decodes QR codes, using quirc for
decoding. It registers a `qrcode` Lua module with `qrcode.scan`, which reads
the text from an image buffer, and `qrcode.generate`, which returns a QR code
image buffer and its side length.

## Using it

1. See the included example app, which scans camera images and creates QR
   codes; it depends on a camera extension that supports only macOS, iOS and
   Android.

## Engine APIs

Both functions work on [`buffer`](/api/buffer) objects: `scan` expects a
first stream of `UINT8` * 3 texels, and `generate` returns a `data` stream of
`UINT8` * 1.

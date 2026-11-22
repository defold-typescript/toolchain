/// <reference path="../index.d.ts" />
import type { Hash, Vector3 } from "../src/core-types";

type Identical<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

declare const a: Vector3;
declare const b: Vector3;
declare const g: Hash[];

// script_physics.cpp:Physics_RayCast pushes one hit table with no options table,
// and a list of hits whenever one is passed, a list of one unless `all` is set.
const single = physics.raycast(a, b, g);
const _single: { position: Vector3 } | undefined = single;
void _single;
// @ts-expect-error a ray cast without options returns one hit, not a list
void single?.[0];

for (const options of [{ all: true }, { all: false }, {}]) {
  const hits = physics.raycast(a, b, g, options);
  const position = hits?.[0]?.position;
  const _position: Identical<typeof position, Vector3 | undefined> = true;
  void _position;
}
const listed = physics.raycast(a, b, g, { all: true });
const _listed: Identical<NonNullable<typeof listed>[number]["position"], Vector3> = true;
void _listed;

// script_http.cpp:PostProgress posts bytes_sent, bytes_received, bytes_total
// and url, and no status, while report_progress is set.
http.request(
  "http://example.com",
  "GET",
  (_self, _id, response) => {
    const status = response.status;
    const _status: Identical<typeof status, number | undefined> = true;
    void _status;
    const total: number | undefined = response.bytes_total;
    void total;
  },
  undefined,
  undefined,
  { report_progress: true },
);

http.request("http://example.com", "GET", (_self, _id, response) => {
  const s: number = response.status;
  void s;
});

http.request(
  "http://example.com",
  "GET",
  (_self, _id, response) => {
    const s: number = response.status;
    void s;
  },
  undefined,
  undefined,
  { report_progress: false, timeout: 5 },
);

declare const progress: boolean;
http.request(
  "http://example.com",
  "GET",
  (_self, _id, response) => {
    // @ts-expect-error a progress event carries no status
    const s: number = response.status;
    void s;
  },
  undefined,
  undefined,
  { report_progress: progress },
);

declare const storedOptions: http.RequestOptions;
http.request(
  "http://example.com",
  "GET",
  (_self, _id, response) => {
    const status = response.status;
    const _status: Identical<typeof status, number | undefined> = true;
    void _status;
  },
  undefined,
  undefined,
  storedOptions,
);

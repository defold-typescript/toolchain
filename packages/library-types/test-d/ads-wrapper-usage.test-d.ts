/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as test from "ads_wrapper.ads_networks.test";
import * as ads_wrapper from "ads_wrapper.ads_wrapper";
import * as events from "ads_wrapper.events";
import * as platform from "ads_wrapper.platform";
import * as queue from "ads_wrapper.queue";

// Compile-only proof that the ads_wrapper LuaLS goldens are callable the way the
// upstream README integrates them. No assertions execute; tsc --noEmit under
// tsconfig.dts-check.json (skipLibCheck: false) is the gate.

const id1 = ads_wrapper.register_network(test.network1, { param: "test_param 1" });
const id2 = ads_wrapper.register_network(test.network2, { param: "test_param 2" });

// register_network returns nil for a network the platform does not support.
// @ts-expect-error id1 may be undefined until it is checked
ads_wrapper.setup_video([{ id: id1 }]);

if (id1 !== undefined && id2 !== undefined) {
  ads_wrapper.setup_video(
    [
      { id: id2, count: 2 },
      { id: id1, count: 2 },
    ],
    4,
  );
  ads_wrapper.setup_banner([{ id: id1, count: 1 }]);
}

ads_wrapper.init(true, true, (response) => {
  const initialized: boolean = response.result === events.SUCCESS;
  void initialized;
});

queue.set_verbose_mode(events.V_ALL);

// run calls each queued function as fn(network, callback, params).
const q = queue.create();
queue.add(q, (network, callback, params) => {
  network.init(callback, params);
});
const queueId = queue.run(q, test.network1, (response) => {
  const done: boolean = response.result === events.SUCCESS;
  void done;
});
queue.cancel(queueId);
// @ts-expect-error a queued function receives the network, not a response
queue.add(q, (response: queue.ads_response) => {
  void response;
});

const onHtml5: boolean = platform.is_same(platform.PL_HTML5);
const supported: boolean = test.network1.is_supported();
void onHtml5;
void supported;

// A network must provide the ads_network functions the wrapper calls.
// @ts-expect-error an empty table is not an ads_network
ads_wrapper.register_network({}, {});

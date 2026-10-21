import { test } from "node:test";
import assert from "node:assert/strict";

// A permissive stand-in for DOM and chrome.* objects: every property is a
// callable that returns another stand-in, so page scripts can run their
// top-level code under node without a browser. Async APIs never resolve.
function anything() {
  const target = function () {};
  const proxy = new Proxy(target, {
    get(_t, key) {
      if (key === Symbol.toPrimitive) return () => "";
      if (key === Symbol.iterator) return function* () {};
      if (key === "then") return undefined;
      if (key === "length") return 0;
      return proxy;
    },
    apply: () => proxy,
    construct: () => proxy,
    set: () => true,
    has: () => true
  });
  return proxy;
}

async function boot(page) {
  const saved = {};
  for (const name of ["document", "window", "chrome", "navigator", "location", "localStorage", "matchMedia"]) {
    saved[name] = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value: anything(), configurable: true, writable: true });
  }
  try {
    await import(`../${page}`);
  } finally {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

// Regression: options.js called init() at the top of the module, before
// module-level consts it reads were initialised (temporal dead zone), so
// Settings threw on every load and never wired its controls.
test("options.js top-level init runs without a temporal-dead-zone error", async () => {
  await assert.doesNotReject(() => boot("options.js"));
});

test("popup.js and onboarding.js load without top-level errors", async () => {
  await assert.doesNotReject(() => boot("popup.js"));
  await assert.doesNotReject(() => boot("onboarding.js"));
});

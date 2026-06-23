import assert from "node:assert/strict";
import test from "node:test";
import {
  ext,
  getBrowserInfo,
  isChrome,
  isEdge,
  isFirefox,
  isOpera,
  isSafari,
  OpenExtBrowserError
} from "../dist/index.js";

const originalBrowser = globalThis.browser;
const originalChrome = globalThis.chrome;
const originalNavigator = globalThis.navigator;

function resetGlobals() {
  globalThis.browser = originalBrowser;
  globalThis.chrome = originalChrome;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator
  });
}

function setUserAgent(userAgent) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent }
  });
}

test.afterEach(resetGlobals);

test("browser API is preferred when available", async () => {
  globalThis.browser = {
    storage: {
      local: {
        get: async () => ({ from: "browser" })
      }
    }
  };
  globalThis.chrome = {
    storage: {
      local: {
        get: (_keys, callback) => callback({ from: "chrome" })
      }
    }
  };

  assert.deepEqual(await ext.storage.local.get("key"), { from: "browser" });
});

test("chrome callback API fallback works", async () => {
  globalThis.browser = undefined;
  globalThis.chrome = {
    storage: {
      local: {
        get: (keys, callback) => callback({ [keys]: "value" }),
        set: (_items, callback) => callback(),
        remove: (_keys, callback) => callback()
      }
    }
  };

  assert.deepEqual(await ext.storage.local.get("key"), { key: "value" });
  await assert.doesNotReject(() => ext.storage.local.set({ key: "value" }));
  await assert.doesNotReject(() => ext.storage.local.remove("key"));
});

test("chrome promise API is supported", async () => {
  globalThis.browser = undefined;
  globalThis.chrome = {
    runtime: {
      sendMessage: async (message) => ({ echo: message })
    }
  };

  assert.deepEqual(await ext.runtime.sendMessage("hello"), { echo: "hello" });
});

test("missing API returns a useful error", async () => {
  globalThis.browser = {};
  globalThis.chrome = undefined;

  await assert.rejects(() => ext.tabs.query({}), OpenExtBrowserError);
});

test("tabs.getActive queries active current window tab", async () => {
  let queryInfo;
  globalThis.browser = {
    tabs: {
      query: async (input) => {
        queryInfo = input;
        return [{ id: 1 }];
      }
    }
  };

  assert.deepEqual(await ext.tabs.getActive(), { id: 1 });
  assert.deepEqual(queryInfo, { active: true, currentWindow: true });
});

test("tabs.create works with mocks", async () => {
  globalThis.browser = {
    tabs: {
      create: async (input) => ({ id: 2, ...input })
    }
  };

  assert.deepEqual(await ext.tabs.create({ url: "https://example.com" }), {
    id: 2,
    url: "https://example.com"
  });
});

test("runtime.onMessage registers and unregisters listener", () => {
  const listeners = new Set();
  const listener = () => undefined;
  globalThis.browser = {
    runtime: {
      onMessage: {
        addListener: (item) => listeners.add(item),
        removeListener: (item) => listeners.delete(item)
      }
    }
  };

  const unsubscribe = ext.runtime.onMessage(listener);
  assert.equal(listeners.has(listener), true);
  unsubscribe();
  assert.equal(listeners.has(listener), false);
});

test("browser detection reads user agent and API namespace", () => {
  globalThis.browser = {};
  setUserAgent("Mozilla/5.0 Firefox/120.0");

  assert.deepEqual(getBrowserInfo(), {
    name: "firefox",
    userAgent: "Mozilla/5.0 Firefox/120.0",
    apiNamespace: "browser"
  });
  assert.equal(isFirefox(), true);
});

test("browser predicates detect Chrome, Edge, Opera, and Safari", () => {
  globalThis.browser = undefined;
  globalThis.chrome = {};

  setUserAgent("Mozilla/5.0 Chrome/120.0");
  assert.equal(isChrome(), true);

  setUserAgent("Mozilla/5.0 Edg/120.0");
  assert.equal(isEdge(), true);

  setUserAgent("Mozilla/5.0 Chrome/120.0 OPR/106.0");
  assert.equal(isOpera(), true);

  globalThis.chrome = undefined;
  setUserAgent("Mozilla/5.0 Version/17.0 Safari/605.1.15");
  assert.equal(isSafari(), true);
});

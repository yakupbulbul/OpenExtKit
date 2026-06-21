import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("example has a content script entrypoint", async () => {
  const config = await readFile("openext.config.ts", "utf8");

  assert.match(config, /contentScripts/);
  assert.match(config, /src\/content\.ts/);
});

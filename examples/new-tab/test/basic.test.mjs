import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("example has a new tab page entrypoint", async () => {
  const config = await readFile("openext.config.ts", "utf8");

  assert.match(config, /options: "src\/new-tab\/index\.html"/);
});

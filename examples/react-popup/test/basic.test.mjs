import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("example has popup entrypoints", async () => {
  const config = await readFile("openext.config.ts", "utf8");
  const popup = await readFile("src/popup/index.html", "utf8");

  assert.match(config, /popup: "src\/popup\/index\.html"/);
  assert.match(popup, /main\.tsx/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("example has a configured background entrypoint", async () => {
  const config = await readFile("openext.config.ts", "utf8");

  assert.match(config, /background: "src\/background\.ts"/);
});

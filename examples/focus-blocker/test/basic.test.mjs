import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("focus blocker uses local storage and content script overlay", async () => {
  const popup = await readFile("src/popup/main.ts", "utf8");
  const content = await readFile("src/content.ts", "utf8");

  assert.match(popup, /chrome\.storage\.local\.set/);
  assert.match(content, /replaceChildren/);
});

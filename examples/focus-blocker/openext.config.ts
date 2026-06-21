import { defineOpenExtConfig } from "@openextkit/core";

export default defineOpenExtConfig({
  name: "Focus Blocker Example",
  version: "0.1.0",
  framework: "vanilla",
  targets: {
    chrome: {},
    firefox: {},
    edge: {}
  },
  permissions: {
    required: ["storage"],
    host: ["<all_urls>"]
  },
  entrypoints: {
    background: "src/background.ts",
    popup: "src/popup/index.html",
    contentScripts: [
      {
        matches: ["<all_urls>"],
        js: ["src/content.ts"],
        css: ["src/content.css"]
      }
    ]
  }
});

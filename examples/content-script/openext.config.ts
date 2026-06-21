import { defineOpenExtConfig } from "@openextkit/core";

export default defineOpenExtConfig({
  name: "Content Script Example",
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
    contentScripts: [
      {
        matches: ["<all_urls>"],
        js: ["src/content.ts"],
        css: ["src/content.css"]
      }
    ]
  }
});

import { defineOpenExtConfig } from "@openextkit/core";

export default defineOpenExtConfig({
  name: "New Tab Example",
  version: "0.1.0",
  framework: "vanilla",
  targets: {
    chrome: {},
    firefox: {},
    edge: {}
  },
  permissions: {
    required: ["storage"],
    host: []
  },
  entrypoints: {
    options: "src/new-tab/index.html"
  }
});

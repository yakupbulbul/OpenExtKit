import { defineOpenExtConfig } from "@openextkit/core";

export default defineOpenExtConfig({
  name: "Vanilla Extension Example",
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
    background: "src/background.ts"
  }
});

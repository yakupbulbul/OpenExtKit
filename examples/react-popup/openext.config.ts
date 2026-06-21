import { defineOpenExtConfig } from "@openextkit/core";

export default defineOpenExtConfig({
  name: "React Popup Example",
  version: "0.1.0",
  framework: "react",
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
    background: "src/background.ts",
    popup: "src/popup/index.html"
  }
});

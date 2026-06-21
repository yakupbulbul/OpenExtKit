# Project Config

`openext.config.ts` defines project metadata, framework, browser targets, permissions, and entrypoints.

```ts
import { defineOpenExtConfig } from "@openextkit/core";

export default defineOpenExtConfig({
  name: "My Extension",
  version: "0.1.0",
  framework: "vanilla",
  targets: {
    chrome: {},
    firefox: {},
    edge: {},
    safari: { experimental: true }
  },
  permissions: {
    required: ["storage"],
    optional: ["scripting"],
    host: ["https://example.com/*"]
  },
  entrypoints: {
    background: "src/background.ts",
    popup: "src/popup/index.html",
    contentScripts: [{ matches: ["https://example.com/*"], js: ["src/content.ts"] }]
  }
});
```

`name`, `version`, and at least one target are required. Entrypoints are optional, but OpenExtKit reports a warning when no extension surface is configured.

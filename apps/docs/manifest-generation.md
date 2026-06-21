# Manifest Generation

The manifest package converts `openext.config.ts` into target-specific Manifest V3 JSON.

```sh
openext inspect manifest chrome --json
```

Generated manifests include configured permissions, host permissions, background service workers, popup actions, options UI, content scripts, and browser-specific metadata such as Firefox `browser_specific_settings`.

Manifest V3 is the default because it is the current browser extension platform for Chrome and Edge and the practical baseline for cross-browser work.

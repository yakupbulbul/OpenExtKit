# Focus Blocker Example

A local-only focus blocker extension.

The popup stores a blocklist in extension local storage. The content script reads the blocklist and overlays matching pages. It does not track browsing history or send data to a remote service.

## Commands

```sh
pnpm build
pnpm package
pnpm test
```

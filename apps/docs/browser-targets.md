# Browser Targets

OpenExtKit V1 targets Chrome, Firefox, and Edge with Manifest V3. Safari is represented as an experimental target and reports when Xcode-specific work is required.

Target configuration lives in `targets`:

```ts
targets: {
  chrome: { manifest: 3 },
  firefox: { manifest: 3 },
  edge: { manifest: 3 },
  safari: { manifest: 3, experimental: true }
}
```

## Adding a New Browser Target

New targets should be added through the target registry design: define capabilities, manifest differences, packaging behavior, and test support before exposing the target in the CLI.

Required target metadata should include display name, manifest support, permissions support, extension loading support, packaging support, and unsupported capability warnings.

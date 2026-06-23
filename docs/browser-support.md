# Browser Support

V1 targets:

- Chrome Manifest V3
- Firefox Manifest V3
- Edge Manifest V3
- Opera Manifest V3

Opera is treated as a Chromium-compatible target. It uses the same Manifest V3 generation model, service worker background behavior, zip packaging, and Playwright extension loading path as Chrome and Edge. Set `OPENEXTKIT_OPERA_EXECUTABLE` for `openext dev opera`, `openext test opera`, and `openext visual opera` workflows that require a real browser.

Safari is represented as an experimental target. Full Safari support may require macOS and Xcode-specific workflows.

# Introduction

OpenExtKit is an open-source toolkit for building browser extensions from a single TypeScript-first project. It combines a CLI, config system, manifest generator, permission audit, browser compatibility reports, test runner, packaging system, templates, and an MCP server for AI coding tools.

The V1 browser targets are Chrome MV3, Firefox MV3, and Edge MV3. Safari is included in the architecture as experimental because production Safari extension workflows still require macOS and Xcode-specific conversion and packaging steps.

OpenExtKit defaults to Manifest V3 because it is the active extension platform for Chromium browsers and the baseline for modern cross-browser extension development.

## Principles

- Cross-browser by default.
- Small composable packages.
- Explicit config over hidden magic.
- Secure local-first workflows.
- AI tools operate through auditable MCP tools.

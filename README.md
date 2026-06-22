# OpenExtKit

OpenExtKit is an AI-native, cross-browser extension development toolkit for building, testing, validating, packaging, and sharing browser extensions from one TypeScript codebase.

The project is designed for Chrome, Firefox, and Edge Manifest V3 extensions first, with Safari represented in the architecture as an experimental target that can report macOS and Xcode-specific requirements clearly.

## Why It Exists

Browser extension development still requires developers to repeat the same setup work across manifests, browser quirks, permissions, packaging, testing, and release validation. OpenExtKit aims to make those workflows explicit, testable, and friendly to both humans and AI coding tools.

## Quick Start

From this repository:

```sh
pnpm install
pnpm build
```

Create a new extension project:

```sh
node packages/cli/dist/index.js init my-extension --template vanilla
cd my-extension
pnpm install
pnpm exec openext build all
pnpm exec openext test all
pnpm exec openext package all
pnpm exec openext release-report
```

Published package installation is not part of the V1 pre-release yet; local workspace usage is the supported path while APIs stabilize.

## Visual Testing

OpenExtKit can run visual extension checks for Chromium-based targets by loading the built extension with Playwright and capturing screenshots of configured HTML surfaces such as `popup` and `options` pages.

Set a browser executable, build the extension, then run the visual test command:

```sh
export OPENEXTKIT_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
pnpm build
node packages/cli/dist/index.js visual chrome
```

For Edge, use `OPENEXTKIT_EDGE_EXECUTABLE`. Screenshots are written to `dist/reports/visual/<target>/`, and the structured report is written to `dist/reports/visual-test-report.json`.

Firefox and Safari visual loading are reported as unsupported capabilities for now; their generated outputs still participate in smoke, compatibility, and packaging checks.

## MCP Workflows

The MCP server lets AI coding tools such as Claude Code, Codex, and Cursor inspect, build, package, smoke test, visually test, and create release reports for an OpenExtKit project.

Start the MCP server from a project workspace:

```sh
node packages/cli/dist/index.js mcp
```

Useful MCP tools include `build_all_targets`, `run_all_browser_tests`, `run_all_visual_tests`, `package_all_targets`, and `create_release_report`.

## Architecture Overview

OpenExtKit is a pnpm and Turborepo monorepo made of small packages:

- `@openextkit/cli`: command-line interface and project generator.
- `@openextkit/core`: configuration schema, project resolution, and shared types.
- `@openextkit/manifest`: browser-specific Manifest V3 generation.
- `@openextkit/browser`: cross-browser extension API wrapper.
- `@openextkit/testing`: browser extension test runner utilities.
- `@openextkit/packaging`: build outputs, zip packaging, and reports.
- `@openextkit/release`: publish readiness checks and store metadata reports.
- `@openextkit/mcp-server`: MCP server for AI coding tools.
- `@openextkit/templates`: starter project templates.
- `@openextkit/eslint-config`: shared lint configuration.
- `@openextkit/tsconfig`: shared TypeScript configuration.

## Roadmap

- Phase 0: repository foundation, CI, docs, and monorepo setup.
- Phase 1: core configuration system with Zod validation.
- Phase 2: browser-specific manifest generation and permission reports.
- Phase 3: cross-browser extension API wrapper.
- Phase 4: `openext` CLI foundation.
- Phase 5: starter templates.
- Phase 6: build and packaging system.
- Phase 7: Playwright-powered browser testing.
- Phase 8: MCP server for AI-native workflows.
- Phase 9: documentation site.
- Phase 10: cross-browser examples.
- Phase 11: extensible browser target registry.
- Phase 12: release readiness and store asset reports.
- Phase 13: CI browser matrix validation.
- Phase 14: open-source release quality pass.

## Status

OpenExtKit is in pre-release development. Chrome, Firefox, and Edge Manifest V3 workflows are the V1 focus. Safari remains experimental and reports macOS/Xcode-specific follow-up requirements instead of pretending full store packaging is complete.

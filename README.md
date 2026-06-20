# OpenExtKit

OpenExtKit is an AI-native, cross-browser extension development toolkit for building, testing, validating, packaging, and sharing browser extensions from one TypeScript codebase.

The project is designed for Chrome, Firefox, and Edge Manifest V3 extensions first, with Safari represented in the architecture as an experimental target that can report macOS and Xcode-specific requirements clearly.

## Why It Exists

Browser extension development still requires developers to repeat the same setup work across manifests, browser quirks, permissions, packaging, testing, and release validation. OpenExtKit aims to make those workflows explicit, testable, and friendly to both humans and AI coding tools.

## Quick Start

The CLI is not implemented yet. The planned command shape is:

```sh
pnpm dlx @openextkit/cli init my-extension --template vanilla
cd my-extension
pnpm openext build all
```

## Architecture Overview

OpenExtKit is a pnpm and Turborepo monorepo made of small packages:

- `@openextkit/cli`: command-line interface and project generator.
- `@openextkit/core`: configuration schema, project resolution, and shared types.
- `@openextkit/manifest`: browser-specific Manifest V3 generation.
- `@openextkit/browser`: cross-browser extension API wrapper.
- `@openextkit/testing`: browser extension test runner utilities.
- `@openextkit/packaging`: build outputs, zip packaging, and reports.
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
- Phase 9: documentation site and examples.

## Status

OpenExtKit is in early development. APIs are expected to change until the first stable release.

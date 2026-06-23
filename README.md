# OpenExtKit

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/yakupbulbul/OpenExtKit/actions/workflows/ci.yml/badge.svg)](https://github.com/yakupbulbul/OpenExtKit/actions/workflows/ci.yml)
[![Node >=20.11](https://img.shields.io/badge/node-%3E%3D20.11-brightgreen.svg)](package.json)
[![pnpm](https://img.shields.io/badge/pnpm-9.15.4-orange.svg)](package.json)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4.svg)](docs/browser-support.md)
[![MCP friendly](https://img.shields.io/badge/MCP-friendly-6f42c1.svg)](docs/mcp-tools.md)

AI-native, cross-browser extension development toolkit for building, testing, validating, packaging, and preparing browser extensions from one TypeScript codebase.

**Translations:** [English](README.md) | [Turkish](docs/readme/README.tr.md) | [German](docs/readme/README.de.md)

## Project Status

OpenExtKit is in pre-release development. Local workspace usage is the supported path while the CLI, package boundaries, and public APIs stabilize. The repository is intentionally open-source friendly: issues, discussions, docs improvements, template ideas, browser compatibility fixes, and tests are welcome.

Chrome, Edge, and Opera are treated as Chromium-compatible Manifest V3 targets. Firefox Manifest V3 support is part of the core workflow with target-specific compatibility reporting. Safari is experimental and reports macOS/Xcode-specific requirements instead of pretending full store packaging is complete.

## Why OpenExtKit?

Browser extension teams repeat the same work across manifests, permissions, browser quirks, packaging, visual checks, release readiness, and store metadata. OpenExtKit makes those workflows explicit, testable, and usable by both humans and AI coding tools such as Codex, Claude Code, Cursor, and Windsurf.

## Highlights

- Cross-browser Manifest V3 generation for Chrome, Edge, Opera, Firefox, and experimental Safari.
- TypeScript-first CLI for init, build, dev, test, visual checks, packaging, diagnostics, release reports, and store asset preparation.
- Real browser workflows for Chromium-family targets, including interactive dev mode, visual screenshots, visual regression baselines, recording mode, and JSON E2E recipes.
- Store readiness scoring, permission risk advice, publish wizard reports, and local upload-ready submission assets.
- MCP server for AI-agent workflows with diagnostics, testing, review, visual review, templates, packaging, and release tools.
- Template marketplace with starter projects and a local preview gallery.
- Contributor-focused monorepo with focused packages for core config, manifests, browser APIs, testing, packaging, release, templates, CLI, and MCP.

## Supported Browsers

| Target | Status | Notes |
| --- | --- | --- |
| Chrome | First-class | Chromium MV3, dev mode, visual tests, E2E, packaging, release checks. |
| Edge | First-class | Chromium-compatible with Edge executable and store readiness paths. |
| Opera | First-class | Chromium-compatible with Opera executable and package naming support. |
| Firefox | Supported | MV3 generation, compatibility diagnostics, packaging, and release checks with browser-specific caveats. |
| Safari | Experimental | Capability reporting for Safari/macOS/Xcode requirements; full store packaging is not claimed yet. |

## Quick Start

Clone the repository and build the workspace:

```sh
pnpm install
pnpm build
```

Create a new extension project from the local CLI:

```sh
node packages/cli/dist/index.js init my-extension --template vanilla
cd my-extension
pnpm install
pnpm exec openext build all
pnpm exec openext doctor --target chrome
pnpm exec openext test all
pnpm exec openext package all
```

Published package installation is not part of this pre-release README yet. Use the local workspace commands above until the package is published and the APIs are marked stable.

## Common Workflows

```sh
# Daily Chromium extension development
OPENEXTKIT_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" openext dev chrome

# Local dashboard with token-protected build/test/package/doctor actions
openext dashboard

# Target diagnostics and compatibility guidance
openext doctor --target chrome
openext inspect permissions chrome --advisor
openext compat fix firefox --dry-run

# Visual checks, baselines, and recording
openext visual chrome
openext visual chrome --update
openext visual chrome --compare
openext visual chrome --record

# E2E checks
openext e2e chrome
openext e2e chrome --recipe-file openext.e2e.json

# Release readiness and local submission assets
openext review all
openext publish-wizard all
openext submit-assets all
openext release-report
```

Browser automation commands require executable paths when the browser is not discoverable automatically:

- `OPENEXTKIT_CHROME_EXECUTABLE`
- `OPENEXTKIT_EDGE_EXECUTABLE`
- `OPENEXTKIT_OPERA_EXECUTABLE`

## Templates

Start with a minimal template or a richer product-oriented starter:

```sh
openext init my-extension --template react-popup
openext templates --json
openext templates gallery
```

Included templates cover vanilla extensions, React popups, content scripts, focus blockers, new tabs, AI sidebars, command palettes, tab managers, context menu tools, web clippers, bookmark managers, shopping assistants, passwordless auth helpers, developer inspectors, and more. See [docs/templates.md](docs/templates.md).

## MCP and AI Coding Tools

OpenExtKit includes an MCP server so AI coding tools can inspect and operate on extension projects through scoped local tools:

```sh
openext mcp
```

Useful MCP tools include diagnostics, browser tests, visual regression, E2E recipes, template listing, deterministic extension review, visual review, packaging, and release reports. See [docs/mcp-tools.md](docs/mcp-tools.md), [apps/docs/using-with-codex.md](apps/docs/using-with-codex.md), [apps/docs/using-with-claude-code.md](apps/docs/using-with-claude-code.md), [apps/docs/using-with-cursor.md](apps/docs/using-with-cursor.md), and [apps/docs/using-with-windsurf.md](apps/docs/using-with-windsurf.md).

## Repository Layout

OpenExtKit is a pnpm and Turborepo monorepo:

- `packages/core`: configuration schema, target registry, project resolution, and shared types.
- `packages/manifest`: target-specific Manifest V3 generation and permission analysis.
- `packages/browser`: cross-browser extension API wrapper.
- `packages/testing`: smoke, visual, regression, recorder, and E2E utilities.
- `packages/packaging`: build outputs, zip packaging, and artifact reports.
- `packages/release`: publish readiness, store metadata, submission assets, and review data.
- `packages/templates`: starter templates and preview metadata.
- `packages/cli`: `openext` command-line interface.
- `packages/mcp-server`: MCP tools for AI coding agents.
- `docs` and `apps/docs`: project documentation.
- `examples`: runnable extension examples.

## Documentation

- [Getting started](apps/docs/quick-start.md)
- [Development workflows](docs/development.md)
- [Testing extensions](docs/testing.md)
- [Browser support](docs/browser-support.md)
- [Publishing and store readiness](docs/publishing.md)
- [Templates](docs/templates.md)
- [MCP tools](docs/mcp-tools.md)
- [Security model](docs/security.md)
- [Architecture](docs/architecture.md)
- [Roadmap](apps/docs/roadmap.md)

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), then run the standard checks before opening a pull request:

```sh
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```

Please follow the [Code of Conduct](CODE_OF_CONDUCT.md), report vulnerabilities through [SECURITY.md](SECURITY.md), and keep changes focused so they are easy to review.

## License

OpenExtKit is released under the [MIT License](LICENSE).

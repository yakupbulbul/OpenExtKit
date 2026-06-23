# OpenExtKit

[![Lizenz: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)
[![CI](https://github.com/yakupbulbul/OpenExtKit/actions/workflows/ci.yml/badge.svg)](https://github.com/yakupbulbul/OpenExtKit/actions/workflows/ci.yml)
[![Node >=20.11](https://img.shields.io/badge/node-%3E%3D20.11-brightgreen.svg)](../../package.json)
[![pnpm](https://img.shields.io/badge/pnpm-9.15.4-orange.svg)](../../package.json)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4.svg)](../browser-support.md)
[![MCP freundlich](https://img.shields.io/badge/MCP-friendly-6f42c1.svg)](../mcp-tools.md)

AI-native, browserübergreifendes Toolkit zum Entwickeln, Testen, Validieren, Paketieren und Vorbereiten von Browser-Erweiterungen aus einer TypeScript-Codebasis.

**Sprachen:** [English](../../README.md) | [Türkçe](README.tr.md) | [Deutsch](README.de.md)

> Diese Übersetzung folgt der englischen README. Die englische README ist die Quelle der Wahrheit für die neuesten technischen Details.

## Projektstatus

OpenExtKit befindet sich in der Pre-Release-Entwicklung. Die lokale Workspace-Nutzung ist der unterstützte Weg, solange CLI, Paketgrenzen und öffentliche APIs stabilisiert werden. Das Repository ist bewusst open-source-freundlich: Issues, Diskussionen, Dokumentationsverbesserungen, Template-Ideen, Browser-Kompatibilitätsfixes und Tests sind willkommen.

Chrome, Edge und Opera werden als Chromium-kompatible Manifest-V3-Ziele behandelt. Firefox Manifest V3 ist Teil des Kern-Workflows mit zielspezifischer Kompatibilitätsberichterstattung. Safari ist experimentell und meldet macOS/Xcode-spezifische Anforderungen, statt vollständiges Store-Packaging vorzutäuschen.

## Warum OpenExtKit?

Teams für Browser-Erweiterungen wiederholen dieselbe Arbeit rund um Manifestdateien, Berechtigungen, Browser-Unterschiede, Packaging, visuelle Checks, Release-Bereitschaft und Store-Metadaten. OpenExtKit macht diese Workflows explizit, testbar und nutzbar für Menschen sowie AI-Coding-Tools wie Codex, Claude Code, Cursor und Windsurf.

## Highlights

- Browserübergreifende Manifest-V3-Generierung für Chrome, Edge, Opera, Firefox und experimentelles Safari.
- TypeScript-first CLI für init, build, dev, test, visual checks, packaging, diagnostics, release reports und store asset preparation.
- Reale Browser-Workflows für Chromium-Familienziele, einschließlich interactive dev mode, visual screenshots, visual regression baselines, recording mode und JSON E2E recipes.
- Store readiness scoring, permission risk advice, publish wizard reports und lokale upload-ready submission assets.
- MCP server für AI-Agent-Workflows mit diagnostics, testing, review, visual review, templates, packaging und release tools.
- Template marketplace mit Starter-Projekten und lokaler preview gallery.
- Beitragsfreundliches Monorepo mit fokussierten Paketen für core config, manifests, browser APIs, testing, packaging, release, templates, CLI und MCP.

## Unterstützte Browser

| Ziel | Status | Hinweise |
| --- | --- | --- |
| Chrome | First-class | Chromium MV3, dev mode, visual tests, E2E, packaging, release checks. |
| Edge | First-class | Chromium-kompatibel mit Edge executable und store readiness paths. |
| Opera | First-class | Chromium-kompatibel mit Opera executable und package naming support. |
| Firefox | Unterstützt | MV3 generation, compatibility diagnostics, packaging und release checks mit browserspezifischen Einschränkungen. |
| Safari | Experimentell | Capability reporting für Safari/macOS/Xcode-Anforderungen; vollständiges store packaging wird noch nicht behauptet. |

## Schnellstart

Repository klonen und Workspace bauen:

```sh
pnpm install
pnpm build
```

Ein neues Erweiterungsprojekt mit der lokalen CLI erstellen:

```sh
node packages/cli/dist/index.js init my-extension --template vanilla
cd my-extension
pnpm install
pnpm exec openext build all
pnpm exec openext doctor --target chrome
pnpm exec openext test all
pnpm exec openext package all
```

Eine Installation über ein veröffentlichtes Paket ist noch nicht Teil dieser Pre-Release-README. Verwende die lokalen Workspace-Befehle oben, bis das Paket veröffentlicht ist und die APIs als stabil markiert sind.

## Häufige Workflows

```sh
# Tägliche Chromium-Erweiterungsentwicklung
OPENEXTKIT_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" openext dev chrome

# Lokales Dashboard mit token-geschützten build/test/package/doctor actions
openext dashboard

# Ziel-Diagnostics und compatibility guidance
openext doctor --target chrome
openext inspect permissions chrome --advisor
openext compat fix firefox --dry-run

# Visual checks, baselines und recording
openext visual chrome
openext visual chrome --update
openext visual chrome --compare
openext visual chrome --record

# E2E checks
openext e2e chrome
openext e2e chrome --recipe-file openext.e2e.json

# Release readiness und lokale submission assets
openext review all
openext publish-wizard all
openext submit-assets all
openext release-report
```

Browser-Automatisierungsbefehle benötigen executable paths, wenn der Browser nicht automatisch gefunden wird:

- `OPENEXTKIT_CHROME_EXECUTABLE`
- `OPENEXTKIT_EDGE_EXECUTABLE`
- `OPENEXTKIT_OPERA_EXECUTABLE`

## Templates

Starte mit einem minimalen Template oder einem umfangreicheren produktorientierten Starter:

```sh
openext init my-extension --template react-popup
openext templates --json
openext templates gallery
```

Die enthaltenen Templates decken vanilla extensions, React popups, content scripts, focus blockers, new tabs, AI sidebars, command palettes, tab managers, context menu tools, web clippers, bookmark managers, shopping assistants, passwordless auth helpers, developer inspectors und mehr ab. Siehe [docs/templates.md](../templates.md).

## MCP und AI-Coding-Tools

OpenExtKit enthält einen MCP server, damit AI-Coding-Tools Erweiterungsprojekte über eingegrenzte lokale Tools untersuchen und ausführen können:

```sh
openext mcp
```

Nützliche MCP tools umfassen diagnostics, browser tests, visual regression, E2E recipes, template listing, deterministic extension review, visual review, packaging und release reports. Siehe [docs/mcp-tools.md](../mcp-tools.md), [apps/docs/using-with-codex.md](../../apps/docs/using-with-codex.md), [apps/docs/using-with-claude-code.md](../../apps/docs/using-with-claude-code.md), [apps/docs/using-with-cursor.md](../../apps/docs/using-with-cursor.md) und [apps/docs/using-with-windsurf.md](../../apps/docs/using-with-windsurf.md).

## Repository-Struktur

OpenExtKit ist ein pnpm- und Turborepo-Monorepo:

- `packages/core`: configuration schema, target registry, project resolution und shared types.
- `packages/manifest`: target-specific Manifest V3 generation und permission analysis.
- `packages/browser`: cross-browser extension API wrapper.
- `packages/testing`: smoke, visual, regression, recorder und E2E utilities.
- `packages/packaging`: build outputs, zip packaging und artifact reports.
- `packages/release`: publish readiness, store metadata, submission assets und review data.
- `packages/templates`: starter templates und preview metadata.
- `packages/cli`: `openext` command-line interface.
- `packages/mcp-server`: MCP tools für AI coding agents.
- `docs` und `apps/docs`: Projektdokumentation.
- `examples`: ausführbare extension examples.

## Dokumentation

- [Getting started](../../apps/docs/quick-start.md)
- [Development workflows](../development.md)
- [Testing extensions](../testing.md)
- [Browser support](../browser-support.md)
- [Publishing and store readiness](../publishing.md)
- [Templates](../templates.md)
- [MCP tools](../mcp-tools.md)
- [Security model](../security.md)
- [Architecture](../architecture.md)
- [Roadmap](../../apps/docs/roadmap.md)

## Beitragen

Beiträge sind willkommen. Starte mit [CONTRIBUTING.md](../../CONTRIBUTING.md) und führe vor einem Pull Request die Standardprüfungen aus:

```sh
pnpm typecheck
pnpm lint
pnpm build
pnpm test
```

Bitte halte dich an den [Code of Conduct](../../CODE_OF_CONDUCT.md), melde Sicherheitslücken über [SECURITY.md](../../SECURITY.md) und halte Änderungen fokussiert, damit sie leicht zu reviewen sind.

## Lizenz

OpenExtKit wird unter der [MIT License](../../LICENSE) veröffentlicht.

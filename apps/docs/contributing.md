# Contributing

OpenExtKit is organized as a pnpm and Turborepo monorepo.

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
```

## Adding a Template

Add template files to `packages/templates`, expose the template name, add tests that generate it, and ensure the generated config loads and can produce manifests.

## Adding a Builder Adapter

Builder adapters should stay target-aware but config-driven. Add adapter capabilities, output validation, packaging behavior, and tests before exposing new CLI behavior.

## Publishing Packages

Publish only after full workspace checks pass. Keep package changes small and version package releases intentionally.

# Contributing

Thanks for your interest in OpenExtKit.

## Development Setup

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

## Contribution Guidelines

- Keep changes small and reviewable.
- Use TypeScript for runtime packages.
- Add or update tests for behavior changes.
- Prefer explicit configuration over hidden behavior.
- Keep cross-browser behavior visible in code and docs.
- Use Conventional Commits for commit messages.

## Pull Requests

Before opening a pull request, run:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Include a concise summary, checks run, and any browser-specific risks.

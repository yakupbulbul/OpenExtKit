# Sharing and Publishing Extensions

Before publishing:

1. Build all targets.
2. Inspect manifests.
3. Run permission audits.
4. Run browser smoke tests.
5. Package all targets.
6. Review `dist/reports`.

Package publishing should be explicit and reproducible. Package maintainers should run `pnpm build`, `pnpm test`, `pnpm typecheck`, and `pnpm lint` before publishing OpenExtKit packages.

Store-specific extension publishing should use the generated target ZIPs and each store's required metadata review process.

# Sharing and Publishing Extensions

Before publishing:

1. Build all targets.
2. Inspect manifests.
3. Run permission audits.
4. Run browser smoke tests.
5. Package all targets.
6. Run publish readiness checks.
7. Generate store metadata drafts.
8. Review `dist/reports` and `dist/store`.

```sh
openext build all
openext test all
openext package all
openext publish-check
openext store-assets
openext release-report
```

`openext publish-check` validates local readiness without submitting anything to a browser store. `openext store-assets` writes store-specific description, permission, and changelog drafts under `dist/store`. `openext release-report` writes `dist/reports/release-report.md` and `dist/reports/release-report.json`.

Package publishing should be explicit and reproducible. Package maintainers should run `pnpm build`, `pnpm test`, `pnpm typecheck`, and `pnpm lint` before publishing OpenExtKit packages.

Store-specific extension publishing should use the generated target ZIPs and each store's required metadata review process.

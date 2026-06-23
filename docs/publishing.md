# Publishing

Publishing support focuses on reproducible local builds, generated reports, and browser-specific package outputs.

For extension store preparation:

```sh
openext build all
openext test all
openext package all
openext publish-check
openext store-assets
openext release-report
```

`publish-check` and `release-report` include a store readiness score per target and overall. The score covers metadata, assets, permissions/privacy, package output, smoke tests, and visual checks. Missing screenshots, package ZIPs, reports, privacy policy files, or store metadata lower the score and appear as explicit checks.

OpenExtKit does not submit extensions to stores in V1. Review the generated ZIPs, `dist/reports`, and `dist/store` files before using each browser store's own submission process.

# Publishing

Publishing support focuses on reproducible local builds, generated reports, and browser-specific package outputs.

For extension store preparation:

```sh
openext build all
openext test all
openext package all
openext publish-check
openext publish-wizard all
openext store-assets
openext submit-assets all
openext release-report
```

`publish-check` and `release-report` include a store readiness score per target and overall. The score covers metadata, assets, permissions/privacy, package output, smoke tests, and visual checks. Missing screenshots, package ZIPs, reports, privacy policy files, or store metadata lower the score and appear as explicit checks.

`publish-wizard` emits an ordered non-interactive checklist for store readiness. Store metadata now includes short description, full description, permission explanations, privacy answers, changelog, and screenshot checklist files under `dist/store/<target>/`.

`submit-assets` creates upload-ready local folders under `dist/submit/<target>/`. Each folder contains copied package and metadata files when available, `submission-checklist.md`, and `submission-config.json`.

OpenExtKit does not submit extensions to stores in V1. Review the generated ZIPs, `dist/reports`, `dist/store`, and `dist/submit` files before using each browser store's own submission process. Optional `submission` config values can store listing IDs and public listing URLs, but no credentials or network publishing are used.

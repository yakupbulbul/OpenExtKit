# Development Workflows

## Interactive Dev Mode

Use `openext dev <target>` for daily Chromium-family extension development:

```sh
openext build chrome
OPENEXTKIT_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" openext dev chrome
```

The command builds the target, launches a persistent browser profile with the unpacked extension, opens the first popup or options page when one exists, watches project files, rebuilds on change, and reloads the extension.

Supported executable variables:

- `OPENEXTKIT_CHROME_EXECUTABLE`
- `OPENEXTKIT_EDGE_EXECUTABLE`
- `OPENEXTKIT_OPERA_EXECUTABLE`

`openext dev --once` performs the build and launch configuration checks without opening a long-running watch session.

## Target Diagnostics

Use targeted doctor checks before local testing or release work:

```sh
openext doctor --target chrome
openext doctor --target opera --json
```

Target diagnostics report config validity, manifest validation, permissions, host patterns, browser executable setup, package output, generated reports, store metadata, visual screenshots, and unsupported automation capabilities.

General doctor checks remain available with:

```sh
openext doctor --json
```

## Dashboard and Review

Serve a read-only local dashboard:

```sh
openext dashboard
openext dashboard --host 127.0.0.1 --port 4217
```

The dashboard reads existing reports and screenshots from `dist/reports` and shows target status, manifest and permission summaries, store readiness, visual screenshots, and report links.

Create an agent-friendly deterministic review:

```sh
openext review all
openext review chrome --json
```

The review report is written to `dist/reports/review-report.json`.

## Compatibility Suggestions

Generate suggested compatibility fixes without editing files:

```sh
openext compat fix firefox --dry-run --json
```

Suggestions cover unsupported permissions/APIs, broad host patterns, disabled targets, and target capability mismatches.

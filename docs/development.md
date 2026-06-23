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

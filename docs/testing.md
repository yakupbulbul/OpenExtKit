# Testing

## Smoke Tests

Smoke tests validate generated extension output, manifests, configured files, wrapper behavior, and browser automation readiness:

```sh
openext build all
openext test all
```

Reports are written to `dist/reports/test-report.json`.

## Visual Tests

Visual tests load Chromium-compatible extension outputs with Playwright and capture screenshots:

```sh
OPENEXTKIT_CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" openext visual chrome
```

Screenshots are written to `dist/reports/visual/<target>/`. OpenExtKit captures popup/options pages and supported content scripts. Content script tests use a deterministic local route at `example.com` when the script match pattern supports `https://example.com/*`, `<all_urls>`, or a compatible HTTP(S) host pattern.

## Visual Regression

Create or refresh baselines:

```sh
openext visual chrome --update
```

Compare current screenshots to baselines:

```sh
openext visual chrome --compare
openext visual chrome --compare --threshold 0.02
```

Baselines are written to `dist/reports/visual-baselines/<target>/`, comparison JSON is written to `dist/reports/visual-regression-report.json`, and failed comparisons write current-image diff artifacts under `dist/reports/visual-diff/<target>/`.

## Visual Recording

Record real-browser captures and save them as baselines:

```sh
openext visual chrome --record
```

Recording requires the target executable env var. The command pauses briefly on each surface before capture so a developer can interact with the extension.

## E2E Recipes

Run deterministic built-in E2E recipe checks:

```sh
openext e2e chrome
openext e2e chrome --recipe popup-render --json
```

Recipes cover popup render, options render, content script injection, storage roundtrip, runtime messaging, tab query, and context menu smoke. Reports are written to `dist/reports/e2e-report.json`.

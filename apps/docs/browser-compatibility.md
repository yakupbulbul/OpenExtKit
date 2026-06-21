# Browser Compatibility

Compatibility reports combine manifest validation, permission audit results, and target-specific warnings.

```sh
openext inspect manifest all --json
```

Chrome and Edge share most Manifest V3 behavior. Firefox can require browser-specific settings. Safari is experimental and should be treated as architecture support, not a complete V1 publishing target.

Browser matrix tests in CI should run build, manifest inspection, permission audit, test, and package steps for each enabled V1 target.

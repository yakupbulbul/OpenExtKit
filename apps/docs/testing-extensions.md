# Testing Extensions

The testing package provides smoke tests for generated extension outputs.

```sh
openext test chrome
openext test all
```

Checks include output existence, manifest JSON validity, configured file existence, wrapper mocks, and browser loading where supported.

Browser launches are opt-in. Set `OPENEXTKIT_RUN_BROWSER_SMOKE=1` and configure `OPENEXTKIT_CHROME_EXECUTABLE` or `OPENEXTKIT_EDGE_EXECUTABLE`. Test profiles are isolated temp directories and never use a real browser profile.

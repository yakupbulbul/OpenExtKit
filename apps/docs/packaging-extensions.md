# Packaging Extensions

Package generated browser outputs with:

```sh
openext package chrome
openext package all
```

Chrome, Firefox, and Edge package outputs are written as ZIP archives under `dist/packages`. Safari creates folder output and a README explaining Xcode-specific follow-up steps.

Package reports live under `dist/reports` and are intended for release review and CI artifacts.

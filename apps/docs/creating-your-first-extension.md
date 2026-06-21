# Creating Your First Extension

Start with the vanilla template:

```sh
openext init hello-extension --template vanilla
```

The generated project includes `openext.config.ts`, source files, and package scripts. The config is the source of truth for browser targets, permissions, and extension entrypoints.

Build Chrome output:

```sh
openext build chrome
```

The generated extension folder is written to `dist/chrome`. Load that folder in Chrome's extension developer mode for local inspection.

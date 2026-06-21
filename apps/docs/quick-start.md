# Quick Start

Create a project:

```sh
pnpm dlx @openextkit/cli init my-extension
cd my-extension
pnpm install
```

Build all configured browser targets:

```sh
pnpm exec openext build all
```

Inspect a generated manifest:

```sh
pnpm exec openext inspect manifest chrome --json
```

Run smoke tests:

```sh
pnpm exec openext test all
```

Package browser outputs:

```sh
pnpm exec openext package all
```

Prepare local release artifacts:

```sh
pnpm exec openext release-report
```

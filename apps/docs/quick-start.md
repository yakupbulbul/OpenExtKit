# Quick Start

Create a project:

```sh
pnpm dlx openext init my-extension
cd my-extension
pnpm install
```

Build all configured browser targets:

```sh
pnpm openext build all
```

Inspect a generated manifest:

```sh
pnpm openext inspect manifest chrome --json
```

Run smoke tests:

```sh
pnpm openext test all
```

Package browser outputs:

```sh
pnpm openext package all
```

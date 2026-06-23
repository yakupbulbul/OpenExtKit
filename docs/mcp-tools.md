# MCP Tools

OpenExtKit includes an MCP server so AI coding tools can inspect configuration, run target diagnostics, generate manifests, audit permissions, run checks, package extensions, inspect browser targets, generate store metadata, visually test extension surfaces, and create release reports through explicit local tools.

The server is started with:

```sh
openext mcp
```

Tools are workspace-scoped, do not expose arbitrary shell execution, and write `.openextkit/audit.log` entries for auditable actions.

Common tools:

- `run_diagnostics`: target-aware doctor checks for config, manifest, permissions, artifacts, screenshots, and automation setup.
- `run_all_visual_tests`: visual screenshots plus optional `update`, `compare`, and `threshold` parameters for visual regression.
- `create_release_report`: release report including store readiness score data.

# MCP Tools

OpenExtKit includes an MCP server so AI coding tools can inspect configuration, generate manifests, audit permissions, run checks, package extensions, inspect browser targets, generate store metadata, and create release reports through explicit local tools.

The server is started with:

```sh
openext mcp
```

Tools are workspace-scoped, do not expose arbitrary shell execution, and write `.openextkit/audit.log` entries for auditable actions.

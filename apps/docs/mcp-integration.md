# MCP Integration

OpenExtKit includes an MCP server for AI coding tools.

```sh
openext mcp
```

The server exposes structured tools for project inspection, config validation, manifest generation, permission inspection, compatibility checks, builds, packaging, browser tests, project creation, template listing, last-error explanation, and release report creation.

All MCP actions are workspace-scoped and auditable. Tool calls write `.openextkit/audit.log` with timestamp, tool name, input summary, output status, and changed file hints.

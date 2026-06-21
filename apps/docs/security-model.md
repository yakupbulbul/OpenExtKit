# Security Model

OpenExtKit is local-first and explicit by design.

The MCP server:

- Rejects file access outside the workspace root.
- Does not expose arbitrary shell command execution.
- Does not read browser cookies.
- Does not use real browser profiles for tests.
- Logs tool calls to `.openextkit/audit.log`.
- Redacts secret-like input keys before returning or logging structured data.

Extension security starts with narrow permissions. Use permission audits and compatibility reports before every release.

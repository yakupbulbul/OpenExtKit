# Using with Codex

Use `openext mcp` as the MCP command for Codex. Codex can call OpenExtKit tools instead of running arbitrary shell commands for common extension tasks.

Recommended tool flow:

1. `get_project_info`
2. `validate_config`
3. `generate_manifest`
4. `inspect_permissions`
5. `build_all_targets`
6. `run_all_browser_tests`
7. `package_all_targets`
8. `create_release_report`

Review `.openextkit/audit.log` when you need to trace AI-assisted changes.

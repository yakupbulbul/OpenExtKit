# Permissions Audit

OpenExtKit inspects required, optional, and host permissions and returns structured findings.

```sh
openext inspect permissions chrome --json
```

The audit warns about sensitive permissions such as `tabs` and `scripting`, invalid host patterns, and broad host access.

Use the audit output before publishing and in CI to keep extension permissions narrow and reviewable.

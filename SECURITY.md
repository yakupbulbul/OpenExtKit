# Security Policy

OpenExtKit is security-sensitive because it helps developers create browser extensions and inspect permissions.

## Supported Versions

OpenExtKit is pre-release. Security fixes will target the main branch until versioned releases begin.

## Reporting a Vulnerability

Please report suspected vulnerabilities privately by opening a GitHub security advisory or contacting the maintainers through the repository security channels.

Do not publicly disclose vulnerabilities until maintainers have had a reasonable opportunity to investigate and prepare a fix.

## Security Principles

- Never add broad extension permissions unless the user explicitly configures them.
- Surface risky permissions and host patterns clearly.
- Prefer local-first workflows.
- Avoid collecting project data unless the user opts in.

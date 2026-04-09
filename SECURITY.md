# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do not open a public issue.** Instead, use GitHub's private vulnerability reporting feature on this repository, or another private reporting channel documented by the maintainers.

We will acknowledge receipt within 48 hours and aim to provide a fix or mitigation within 7 days for critical issues.

## Scope

The following are in scope:

- Authentication and authorization bypass
- Injection vulnerabilities (SQL, XSS, command injection)
- Sensitive data exposure (secrets, credentials, private keys)
- Cryptographic weaknesses in signing or encryption flows

## Out of Scope

- Vulnerabilities in third-party services (Polymarket, Privy, Hyperliquid, etc.)
- Issues that require physical access to the server
- Social engineering attacks

## Supported Versions

Only the latest release on `main` is actively maintained. Older branches do not receive security patches.

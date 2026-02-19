# Security Policy (Public)

## Scope
This file describes the public security posture and reporting flow for this repository.

## High-Level Threat Model
- unauthorized use of privileged automation paths
- abuse of write capabilities without explicit controls
- replay or forgery attempts against trusted service calls
- excessive automated usage beyond policy boundaries

## Security Reporting
Report security issues privately to SYNQ maintainers through internal support or designated security channels.

Do not open public issues with exploit details, credentials, or environment-specific data.

## Documentation Handling
Operational procedures, environment runbooks, and detailed security internals are maintained in the private docs repository.
Public docs in this repository are intentionally sanitized.

## Log Hygiene
Do not paste bootstrap secrets, API keys, or token values into public issues, PRs, or comments.
After any testing session that exposes temporary credentials, rotate the affected secrets.

## Remediation Expectations
- triage reported issues promptly
- apply least-privilege and defense-in-depth controls
- validate fixes with tests and documented acceptance criteria

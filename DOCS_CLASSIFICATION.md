# Documentation Classification Policy

## Classes
- `public`: safe for open-source distribution and contributor onboarding.
- `private-reference`: public stub that points to private internal documentation.

## Required Metadata
All public docs and stubs should identify:
- `owner`
- `review_cadence`
- `last_reviewed`

## Redaction Checklist
Before merging public documentation changes:
- Confirm operational runbooks remain private.
- Confirm security-sensitive implementation detail is removed.
- Confirm no infrastructure identifiers are present.
- Confirm no sensitive auth, key, or secret material is present.
- Confirm examples are synthetic and non-operational.

## Disallowed Data in Public Docs
Do not include:
- production hostnames or domain names
- public or private IP addresses
- system account names
- system file locations
- installation identifiers from real environments
- authentication header names or values
- secret or key variable names and values
- deploy scripts and exact operational thresholds

## Ownership and Review
- `owner`: SYNQ maintainers
- `review_cadence`: monthly
- `last_reviewed`: 2026-02-18

## Rule
Operational runbooks and security internals must live in the private docs repository. Public docs should use sanitized stubs with private path references.

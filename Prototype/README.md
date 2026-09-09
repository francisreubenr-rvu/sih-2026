# Prototype — domain verification gate

**Status: NOT IMPLEMENTED.** This directory is a build contract, not a working SIH solution. SIH2171 could not be matched to a verified statement. A generic dashboard would not satisfy an unknown ministry requirement.

## Unlock requirements

An authoritative problem title and full text, publishing organisation, category (software/hardware), expected outputs, data constraints, and exact ID/year mapping. Store the original in Raw and cite it from Wiki/problem-statement.md. Do not silently replace SIH2171 with a similarly numbered statement.

## Proposed architecture, conditional on a conventional web workflow

Browser → same-origin HTTP API → domain service → SQLite (single demo instance) or managed Postgres (multiple replicas). TypeScript + React/Vite for accessible UI; Node.js API for validation/domain rules; deterministic fixture dataset with reset script. This is a provisional decision, not a final stack selection. ML/GIS/hardware requirements can invalidate it.

Required API behavior: schema validation, explicit 400/404/409/429/500 responses, parameterised database access, idempotency for retried creates, bounded payloads and pagination, request IDs without sensitive logs, and authenticated access if private data is introduced. Write a contract before implementing endpoints.

## Complete vertical slice acceptance

1. Primary persona starts a task using a realistic labelled fixture.
2. Input validation explains what needs correction and retains valid fields.
3. Domain service produces a traceable result; confidence/uncertainty is shown if relevant.
4. User saves, revisits and exports the result where the problem requires it.
5. Service/network failure yields a recoverable state without duplicate writes or data loss.
6. Restart preserves intended state. Reset restores the deterministic demonstration dataset.

Coverage denominator must come from verified requirements. A placeholder route, mock response or screenshot is not functionality coverage. No real-provider or deployment claims until separately tested.

## Deployment and fallback contract

One documented command to install and run; lockfile; .env.example with no secrets; health endpoint; migrations; seed/reset; durable volume or managed DB; health check and rollback instructions. Record live URL only after HTTPS and user-flow verification. Capture a 60–90 second real screen recording of the exact working flow; include captions and provenance, plus screenshots and a local backup. No screen recording exists yet because there is no domain prototype.

# ADR 003 — Static project site and separate inference service

The user's website publication target is GitHub Pages. It serves static Website files; it cannot host the Node API or Ollama. Keep the static project site independently usable with a recorded demonstration, source/extension download and explicitly labeled instructions for running the real local prototype.

Current source includes a Dockerfile for the Node service, not a verified container deployment. The runtime expects `PUBLIC_ORIGIN=https://...`, a long private `SIGHTLINE_TOKEN`, and an `OLLAMA_URL` reachable privately from the container. `HOST=0.0.0.0` requires HTTPS origin and explicit secret. The local token bootstrap is disabled on a public origin; provision the token only to authorized clients, rather than exposing it through a public webpage.

Example build (from repository root): `docker build -t sightline-api:0.1 Prototype`. A TLS reverse proxy must front the service. Persist `/app/data` privately; do not mount or expose unrelated host directories. The current local browser workspace automatically pairs only with its loopback server. Public client pairing UI and hosted demo deployment remain unverified.

No cloud resources, charges, public backend URL or Docker test is claimed from the presence of this file. Browser/session and model startup run locally and are separately documented.

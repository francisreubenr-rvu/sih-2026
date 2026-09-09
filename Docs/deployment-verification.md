# Deployment status

The preparation website runs locally at http://127.0.0.1:4173 and can be served as static files. It has no environment configuration or build step. Instructions are in Website/README.md.

No public URL was provisioned or verified. No domain full-stack application, database or API was deployed. HTTPS, public-network latency, geographic availability and hosted security headers remain untested. Local Lighthouse results must not be presented as production delivery evidence.

The loopback server is an agent-started preview and may need restarting after a reboot or process cleanup. Run from the repository root: `python3 -m http.server 4173 --directory Website --bind 127.0.0.1`.

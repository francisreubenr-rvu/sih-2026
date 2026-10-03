# Dhristi website

Static showcase for the RV University student prototype exploring on-device redaction and token-based browser-agent planning for SIH26171. It is an independent student project, not an official SIH or ISRO product or a privacy guarantee.

From the repository root, run `python3 -m http.server 4173 --directory Website --bind 127.0.0.1`, then open `http://127.0.0.1:4173`. No build step, environment secrets or package installation is needed.

## Experience

The light editorial layout uses oversized Anton headings, Geist body text, warm paper and cobalt accents. The hero illustrates token replacement with labelled synthetic values. Its sample toggle changes static page text only; it performs no detection or network requests. The recorded video is the existing 24.48-second local Prototype demo, rounded to 25 seconds in the interface, with an explicit scope note. It does not demonstrate every current root-extension feature.

The core content, anchor navigation, native mobile menu and video controls work without JavaScript. `app.js` enhances the sample toggle and closes the mobile menu after a link is selected. Reduced motion disables smooth scrolling and hover transitions. No trackers, cookies, external fonts or third-party scripts are loaded.

Design decisions and local validation for this redesign are in `Docs/design/website-redesign-2026-10-03.md`. Automated accessibility scores do not certify WCAG conformance or the extension's release gates.

## Publication

Deliver changes through a PR into `master`. The existing GitHub Pages workflow publishes this directory when eligible changes reach master, or on manual dispatch. This redesign has only been verified locally; historical deployment records do not verify the new design. Do not claim publication until the resulting public page is checked.

For another approved HTTPS host, serve this directory directly and configure `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` and a CSP allowing only same-origin assets. The static site does not require access to the Warden or a model provider.

## Assets

- Header/footer and favicon: `assets/dhristi-mark-light.svg`, the existing Hybrid C geometry in its Signal light edition. Original marks remain for historical references.
- Demo: `assets/video/dhristi-prototype-demo.mp4` and its poster, recorded locally with synthetic data. The embedded annotation overlays belong to the historical recording.
- Earth photograph: responsive WebP versions of NASA ISS image `iss074e0002581`, public domain and credited on the page.
- Fonts: self-hosted Anton and Geist, SIL Open Font License (`assets/fonts/OFL.txt`). Previous Open Sans and Glacial files remain for historical assets.
- Older footage, stills, logos and unused GSAP vendor files remain for historical references; the landing page loads none of those scripts.

No borrowed portraits, government marks or implied partnerships are used. See `Docs/decisions/brain-logo-hybrid-c.md`.

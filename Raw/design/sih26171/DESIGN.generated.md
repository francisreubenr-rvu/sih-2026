## Brand & Style
The design system positions light-weight browser visual perception as a rigorous instrument of scientific precision. Designed for an on-device engineering showcase, the atmosphere balances high-density telemetry displays with expansive, deliberate editorial whitespace. 

The aesthetic synthesizes Swiss typographic discipline, aerospace instrumentation, and archival technical documentation. Interfaces favor clean architectural cuts over ornamentation, relying on strict structural alignment, hairline delineations, and asymmetrical typographic scale to assert authority. Interactive elements must feel mechanical, calibrated, and deliberate—rejecting decorative gradients, frivolous motion, and synthetic neon glows in favor of quiet, purposeful clarity.

## Layout & Spacing
The layout follows a dual-mode structural grid:
- **Asymmetric Narrative Canvas**: A 12-column layout on desktop with wide margins (`margin-desktop`) and expansive vertical rhythm (`space-3xl` to `space-4xl`) for thesis statements, architectural diagrams, and core model highlights.
- **Dense Instrument Dock**: Modular technical containers configured with a compact baseline (`space-xs` to `space-md`), creating a deliberate visual tension against the expansive editorial sections.

### Breakpoints & Adaptability
- **Desktop (≥ 1024px)**: Full asymmetric layout. Dense telemetry modules anchor to the right or bottom rail, balanced against dominant editorial typography.
- **Tablet (768px – 1023px)**: 8-column layout. Margin reduces to `2rem`. Visual perception feeds and data monitors stack below documentation headers.
- **Mobile (< 768px)**: 4-column layout. Horizontal borders stretch edge-to-edge. Typography scales to mobile variants. Telemetry feeds switch from horizontal sidecars to tabbed monospaced ribbons.

## Elevation & Depth
This design system rejects dropshadows, blurs, and pseudo-3D elevation. Depth is achieved strictly through:

- **Low-Contrast Hairline Outlines**: Interfaces are articulated using crisp 1px borders in `#DCDED3` or `#1C2922`. Containers nest cleanly like drafting viewports.
- **Subtractive Tonal Inset**: Recessed areas (such as code viewers, camera visual pipelines, or model logs) utilize a slightly deepened paper tone (`#E8EAE0`) framed by hairlines.
- **Superimposed Optical Reticles**: Interactive selection is designated using precision corners, tick marks, and 1px overlay guides in `#C0D98E` or `#1C2922`, reinforcing the aesthetic of an on-device perception instrument.

## Components

### Buttons & Action Controls
- **Primary Button**: Solid `#1C2922` background, `#F2F3EC` text, strictly zero-radius. Font is `label-mono-lg` with uppercase styling. Hover state shifts background to `#526054`. Active state displays a 2px `#C0D98E` left indicator mark.
- **Secondary / Metric Button**: Ghost style with 1px `#1C2922` border, `#1C2922` text. Hover adds a 10% tint of `#C0D98E` as background.
- **Tool Trigger**: Monospace micro-buttons with 1px `#DCDED3` borders, containing coordinate or tool designations (e.g., `[LOC_01]`).

### Telemetry Cards & Density Panels
- **Container Structure**: 1px `#DCDED3` border on `#F2F3EC` canvas. Header row separated by 1px horizontal rule, containing an uppercase `label-mono-sm` title on the left and a live system heartbeat (3px square in `#C0D98E`) on the right.
- **Dense Data Grid**: Key-value pairings separated by dotted vertical guides. Values set in `metric-mono`, keys in muted `label-mono-sm`.

### Status Indicators & Chips
- **Calibrated Tag**: Rectilinear chip framed by 1px border. Inactive tags feature `#526054` text and borders; active perception targets gain `#1C2922` fill with `#C0D98E` text and a preceding `+` index mark.

### Form Inputs & Terminal Fields
- **Input Field**: Flat `#F2F3EC` base with 1px `#526054` bottom border only (or full border in data panels). Monospaced text input. Focus state changes border to 1px `#1C2922` accompanied by a prominent `#C0D98E` cursor block.
- **Checkboxes & Radios**: Square 12px boxes, zero border radius, 1px `#1C2922` border. Checked state is marked by a centered 6px solid `#1C2922` square (or `#C0D98E` inside telemetry feeds).

### Lists & Tables
- **System Trace List**: Borderless rows separated by 1px hairline rules (`#DCDED3`). Timestamp, latency metric, and tensor bounding boxes aligned along fixed monospaced column intervals. Hover highlights the entire row in `#E8EAE0`.

### Perception Viewport (Specialty Component)
- Dedicated canvas for light-weight browser visual agent display: Enclosed in a 1px `#1C2922` border with technical corner brackets (`+` markers at each vertex). Live object bounding boxes drawn using 1px `#1C2922` dashed outlines with inverted `#1C2922`/`#C0D98E` target tags anchored to top-left coordinates.
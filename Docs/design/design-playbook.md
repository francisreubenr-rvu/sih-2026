# Design Playbook

Single compiled volume of the design playbooks. Use the landing-page chapter as the top-level sequence; jump into the later chapters when a step names them.

Authority: a project's own `DESIGN.md` or tokens override this file. Load `RULES.md` and `ROUTER.md` alongside it when those files exist.

## Contents

1. [Landing page, end to end](#landing-page)
2. [Style selection](#style-selection)
3. [Content structure](#content-structure)
4. [Psychology and UX](#psychology-ux)
5. [Layout and composition](#layout-composition)
6. [Hierarchy and attention](#hierarchy-attention)
7. [Hero section](#hero)
8. [Typography system](#typography-system)
9. [Color system](#color-system)
10. [Motion and scroll](#motion-scroll)

---

## Landing page, end to end

<a id="landing-page"></a>

### When to use

Use this playbook as the top-level checklist for building a landing page (or any single-purpose
marketing page) from a cold start to a handoff-ready build. It sequences the other three
deliverables and the rest of the library into one executable pass: strategy, content, wireframe,
hierarchy, type, colour, imagery, build, verify. Load `RULES.md` alongside it; every step below
cites the guidebooks and, where relevant, the other two playbooks.

### Inputs you need first

- Access to the client (or a stand-in brief) to answer strategy questions: do not proceed on
  assumptions where a real answer is obtainable.
- The project's own `DESIGN.md` or design tokens, if one exists: it overrides everything below
  per `ROUTER.md`'s authority order.
- Any existing brand assets: logo, established colors, existing photography.
- A stated budget/timeline that determines how much custom imagery and copy work is realistic.

### Procedure

#### 1. Strategy

1. Interview the client (or brief) for their business, offering, customers, and vision; pin down
   the site's one specific goal (sell, build trust, generate leads, educate, hire).
   `(A01, B11, C08)`
2. Classify the site into one of the five categories (ecommerce, marketing/business,
   content/media, educational, portfolio): this determines which type-specific priorities from
   `RULES.md` Content and IA, rule 7, apply. `(A01, B16)`
3. Collect the client's own reference sites, plus competitor sites, to align on what "good" looks
   like: then plan to deliberately diverge from the competitors' specific choices. `(A01)`
4. Write down the one target emotion for this project before any visual work starts (see
   `playbooks/psychology-ux.md`, step 1). `(C07)`

#### 2. Content

5. Determine primary and secondary goals, then brainstorm every content type that could support
   them; bring your own suggestions but stay open to the client's input. `(B11)`
6. Card-sort the brainstormed content into natural groupings; this becomes the page's section
   list (for a single landing page) or the site's sitemap (for a multi-page build). `(B11)`
7. Give every section one clear job (one objection addressed or one kind of confidence built) so its CTA reads as a natural conclusion. Fill any real gaps (a missing heading, missing hero
   copy) yourself rather than leaving a hole, without inventing facts the client didn't supply.
   `(A02, C04, C06)`
8. Decide the page's single primary CTA and reject competing candidate goals: a landing page
   diluted across several asks converts worse than one committed to a single action.
   `(C04, C08)`

#### 3. Wireframe

9. Sketch the page structure by hand first: boxes and placeholder text only, zero color, font,
   or real imagery: this validates structure independent of visual style. `(A01, B09)`
10. Break the page into content-derived rows, one idea per row, using the row-type library (hero,
    two-column image+text, three-column, single-column large text, CTA) from `RULES.md` Layout
    and grid, rule 9. `(C06)`
11. Get sign-off (client or stakeholder) on the wireframe before any visual design work begins.
    `(A01, B09)`

#### 4. Hierarchy

12. Run the full hierarchy procedure from `playbooks/hierarchy-attention.md` on the wireframe:
    rank every block, assign big/medium/small, layer color and position, choose a named attention
    structure. Do this before typography or colour are locked, since hierarchy determines what
    those systems need to support.
13. Confirm the page's eye path resolves to the single primary CTA from step 8: if it doesn't,
    the wireframe's structure is wrong, not just its styling. `(A02, B10)`

#### 5. Type

14. Choose the headline/display font first as the anchor that sets the page's personality; check
    it against a font-pairing reference tool for a body font that feels like the same world while
    still contrasting. `(A01, C03)`
15. Cap the system at a display font, a body font, and at most one accent face; reject the
    display font for body use if it breaks down at small sizes. `(A01, A02)`
16. Derive heading sizes from a modular scale, tighten line-height on the large headline size,
    and plan to hand-tune once real copy is in place. `(A01, B10, B14)`

#### 6. Colour

17. Use established brand colors as-is if they exist; otherwise choose a base color for its
    meaning and cultural fit to the audience. `(B07, B18)`
18. Build a 3-5 color palette (one dominant, one or two neutrals, one accent reserved for CTAs)
    using a color-harmony relationship, and apply it at a flexible 60/30/10 ratio. `(B07, A02, C01)`
19. Check contrast on every foreground/background pairing with a contrast tool, including the
    palette against any photography it will sit on. `(A02, C01, B12)`

#### 7. Imagery

20. Decide genre (photography/illustration/3D) per image slot based on subject and brand, not
    taste; prefer original imagery over stock where budget allows. `(B05, A02)`
21. Screen every candidate: reject grainy, cluttered, or low-contrast images outright; verify
    clean negative space and sufficient contrast wherever text will sit on top. `(B05, B10)`
22. Choose final imagery for the emotional effect it produces (see
    `playbooks/psychology-ux.md`, step 2), not composition alone. `(B18, B10)`
23. Never place text over a face; color-correct all images in one composition to a shared tone.
    `(A01)`

#### 8. Build

24. Build reusable, named style tokens (H1, H2, subheading, body, nav link, button) and apply
    everything by style, not one-off overrides. `(A01, B02, B15)`
25. Build the section-by-section layout on a 12-column grid inside a fixed-width, centered
    container; give every row consistent padding and vary background/height/column-order between
    adjacent rows. `(B06, B14, C06)`
26. Style every clickable element to look clickable by convention (consistent color, border, or
    hover change); make the primary CTA the single most visually prominent element on the page.
    `(B12, A02)`
27. Design every hover and focus state explicitly in the file, not only the default state.
    `(B15)`
28. Add proof (testimonials, logos, numbers) distributed through the page, not only at the
    bottom, with specific rather than generic claims. `(A02, B18)`
29. Add animation only as micro-interaction polish (hover shifts, easing scroll-ins); cut
    anything whose only purpose is to show off. `(A02)`
30. Step through every responsive breakpoint in order; remember that style changes at a smaller
    breakpoint never affect the larger ones above it; scale the whole type hierarchy down
    together, not just the headline. `(A01)`
31. Export assets by type (SVG vector, JPEG opaque photo, PNG transparency, all raster at 2x) and
    compress every raster export before handoff. `(A01, B15, B02)`

#### 9. Verify

32. Re-run the hierarchy check per section, not only the hero: confirm each section still has
    an unmistakable first-read element. `(B08)`
33. Run the pre-mortem: check for misreadable claims, palette failure on different backgrounds,
    and small-text legibility at actual final size. `(C07, B12)`
34. Confirm accessibility baseline: contrast, readable fonts, correct heading structure. `(A02, B03)`
35. Confirm the build lives on a real domain, not the builder's default hosted subdomain, before
    calling it delivered. `(A01)`
36. Run the anti-generic checklist from `ROUTER.md` against the finished page as a final gate.

### Decision points

| Decision | Trade-off | Default |
|---|---|---|
| Single landing page vs. multi-page site | A one-pager is faster to build and keeps everything above one continuous scroll; heavy content crammed into one page becomes uncomfortable to navigate | One-pager only when content volume is genuinely light; default to multi-page once the card-sort (step 6) produces more than a handful of natural groupings `(B11)` |
| Custom photography/illustration vs. stock | Custom is more distinctive and pushes perceived value but costs time/budget; stock is fast but risks look-alike sites | Custom where budget allows; if forced to stock, build a custom composition/mockup around it rather than dropping it in raw `(A02, B05)` |
| F/Z-pattern vs. row-based (layer-cake) attention structure | A named eye-path pattern suits a single-message hero; a row-based structure suits a longer, multi-idea page | Z-pattern for the hero only; layer-cake/row structure for the body beneath it: most landing pages need both, in that order (`playbooks/hierarchy-attention.md`) |
| No-code builder vs. code-level tool (Webflow/Framer-class) | No-code is faster and requires no learning curve but caps achievable customization; code-level tools take longer to learn but remove that cap | No-code for a simple, low-customization business site; code-level tool once the design genuinely needs bespoke interaction or layout the builder's templates can't express `(B19, C08)` |
| Ship with placeholder proof vs. delay for real proof | Fabricated proof is fast but is a hard violation of workspace doctrine and erodes trust if discovered; delaying loses momentum | Never fabricate proof. Ship without a proof section and flag the gap to the client rather than inventing testimonials or numbers `(A02)` |

### Failure modes

- **Design started from the tool, not the strategy.** Colors and fonts get picked before the
  goal or audience is defined. Tell: no written goal statement exists when visual work begins.
  Fix: stop and complete step 1 before any further work. `(A01, B11, C08)`
- **Wireframe skipped or rubber-stamped.** Visual design starts directly on real content with no
  structural validation first. Tell: structural problems (missing section, wrong content order)
  are discovered only after high-fidelity work is already done. Fix: return to step 3.
- **Hierarchy solved only in the hero.** The rest of the page is visually flat. Tell: every
  section below the hero looks like a uniform gray wall when squinted at. Fix:
  `playbooks/hierarchy-attention.md`, step 9.
- **Proof missing, generic, or backloaded.** See `playbooks/psychology-ux.md` failure modes for
  the full diagnosis and fix.
- **Mobile treated as an afterthought.** Desktop is designed first and mobile is assumed to
  "just work." Tell: nav overflow, oversized type, or one-word-per-line headlines appear only
  when the mobile breakpoint is actually reviewed. Fix: design mobile-first or, at minimum,
  dedicate a real review pass per breakpoint (step 30). `(A02, A01)`
- **Handoff file is a mess.** Layers are unnamed, styles are applied ad hoc instead of via named
  tokens, and no developer (or future self) could pick up the file without asking many questions.
  Fix: apply the "stranger test" (step 24, and `RULES.md` Build and handoff, rule 3) before
  calling the file done.
- **Shipped on the builder's default subdomain.** The project reads as unfinished because the
  final domain-connection step was skipped. Fix: step 35.

### Done when

- [ ] A written strategy brief exists: goal, site category, target emotion, target audience.
- [ ] Content was card-sorted into sections before any layout was drawn.
- [ ] A low-fidelity wireframe was reviewed and approved before visual design began.
- [ ] `playbooks/hierarchy-attention.md`'s procedure was run and its "Done when" checklist passes
      for every section of the page, not only the hero.
- [ ] Type and colour systems are each capped (max 3 fonts; 3-5 colors at a 60/30/10-ish ratio)
      and every pairing passes a contrast check.
- [ ] Every image was screened for quality and negative space, and chosen for its emotional
      effect, not composition alone.
- [ ] Every clickable element has visible default, hover, and focus states, and the primary CTA
      is the single most visually prominent element on the page.
- [ ] Proof is real, specific, and distributed through the page: not fabricated, not generic,
      not confined to a single block at the bottom.
- [ ] Every responsive breakpoint has been reviewed and adjusted individually, mobile included.
- [ ] Assets are exported by correct type, at 2x for raster, and compressed.
- [ ] The pre-mortem and accessibility baseline checks (step 33-34) have been run and passed.
- [ ] The live build sits on the real domain, not a builder's default hosted address.


---

## Style selection

<a id="style-selection"></a>

### When to use
Choosing an overall visual style direction for a project, after strategy and goals are set but before mood-boarding, palette, and type selection.

### Inputs you need first
- The client's own words and reference sites from the strategy conversation.
- The site's category (ecommerce, marketing/business, content/media, educational, portfolio).
- An honest read of the team's or your own execution capacity (photography access, motion/coding skill, budget).

### The six styles (C05)
C05 names exactly six styles, each anchored to a named-person shorthand for its defining traits and its client-signal use case. Treat this as a closed taxonomy: classify every project into one of the six before starting visual design (C05).

1. **Steve Jobs**: skinny sans-serifs, a spacing and type system that stays organized without feeling stiff. Trigger phrase: "I just want something clean." Requires comfort with generous white space; an empty-feeling section is not automatically a failure (C05).
2. **Jensen Huang**: a tighter, more buttoned-up version of Steve Jobs. Typical of SaaS or AI companies whose goal is attracting investors and communicating no-fuss stability. Prioritizes function over form, a clear grid, and avoids any loud or distracting choice that pulls attention off the product (C05).
3. **Drew Barrymore**: warm, inviting, candid, doesn't take itself too seriously, often carries a noticeable bounce in its animation. For clients who want to feel approachable and down-to-earth. Depends on good photography that splits highly produced and highly authentic; if the client can't supply it, compensate with rounded corners on cards and images and a warm, natural palette (C05).
4. **Zendaya**: high-fashion editorial, cinematic and cologne-commercial-style imagery, ultra-minimal and unconventional layout. For clients who communicate value by showing taste rather than stating benefits outright. Requires real familiarity with Swiss and editorial design, and a willingness to scale back type size or break normal layout conventions (C05).
5. **Virgil Abloh**: built around one unmistakable visual element (a font, a high-contrast palette, or imagery) that a visitor can't ignore. Not defined by minimalism or maximalism specifically. Pick exactly one cool element and repeat it tastefully; the goal is contrast, not bigness (C05).
6. **Christopher Nolan**: designed to "blow your mind" within the first three seconds. Something moves or morphs, the hero scrolls in an unfamiliar way, interaction appears almost every inch of the page. For clients who explicitly want a "wow factor." Requires design, UX, and serious coding skill, typically a team; tools like Unicorn Studio or Spline can help a smaller team punch above its weight (C05).

### Procedure
1. Classify the project into one of the six named styles before starting visual design. Treat this as a fixed taxonomy, not an open brainstorm (C05).
2. Read the client's own language and reference sites as the primary signal for which style fits: a literal phrase such as "I just want something clean" points at Steve Jobs; "wow factor" points at Christopher Nolan (C05).
3. Cross-check the style choice against the site's category. A category's core priority, such as checkout conversion or article readability, can rule out styles that would undermine it (B16, A01).
4. For Steve Jobs, commit to generous white space and do not treat an empty-feeling section as a design failure (C05).
5. For Jensen Huang, prioritize function over form, keep everything in a clear grid, and avoid any loud or distracting choice that pulls attention off the product (C05).
6. For Drew Barrymore, confirm the client can actually supply strong photography first, since the style depends on it; if they can't, compensate with rounded corners and a warm, natural palette rather than forcing the photography requirement (C05).
7. For Zendaya, only take this on with real familiarity in Swiss and editorial design, and be willing to scale back type size or break normal layout conventions to hold the mood (C05).
8. For Virgil Abloh, pick exactly one cool element and repeat it; do not stack multiple "stunning" visuals per section, since the goal is contrast, not bigness (C05).
9. For Christopher Nolan, confirm the team actually has design, UX, and serious coding capacity before committing, or budget for the heavier build; tools such as Unicorn Studio or Spline can raise the floor for a smaller team (C05).
10. Study relevant design history for the chosen style's lineage, since every design era is a reaction to both its social context and the technology of its day, and current restraint traces back through the same pendulum (B03).
11. Whatever style is chosen, study competitor references executing the same style, then deliberately diverge from their specific choices. The goal is setting the client apart, not blending in (A01).
12. Derive the actual palette and type choices for the chosen style directly from a curated mood board of real reference images, using an eyedropper for color, rather than inventing them abstractly (A01).

### Decision points

| Decision | Options | Trade-off | Default |
|---|---|---|---|
| Style commitment | Steve Jobs / Jensen Huang / Drew Barrymore / Zendaya / Virgil Abloh / Christopher Nolan | Cleaner styles (Jobs, Huang) are safer and faster to execute well. Expressive styles (Barrymore, Zendaya, Abloh) each need a specific asset or skill dependency to land. Christopher Nolan needs the most resources and is the easiest to execute badly. | Match to the client's own language and site category first (see the mapping table below). When the signal is ambiguous, default toward Steve Jobs as the lowest-risk, broadly legible choice (C05). |
| Depth of style execution | Pure style application / a full custom system | Pure style application is faster but risks reading as generic within its own category. A full custom system (its own type pairing, its own photography direction) differentiates further but costs more. | Apply the named style's defining traits, then deliberately diverge from direct competitors using the same style (A01, C05). |

### Selection table: client signal to style

| Client signal | Site category (B16) | Style | Why |
|---|---|---|---|
| "I just want something clean" | Any, especially portfolio or marketing | Steve Jobs | Skinny sans-serifs, organized spacing, comfortable with white space (C05) |
| Enterprise or investor-facing SaaS/AI product, wants to look stable and no-fuss | Marketing/business (B2B) | Jensen Huang | Function over form, clear grid, no loud choices, attention stays on the product (C05) |
| Wants to feel approachable, has strong candid photography available | Marketing/business, portfolio | Drew Barrymore | Warm palette, rounded corners, bounce in motion; depends on good photography (C05) |
| Sells on taste or status rather than stated benefits, has cinematic imagery | Ecommerce (fashion/luxury), portfolio | Zendaya | High-fashion editorial, ultra-minimal, unconventional layout; needs Swiss/editorial fluency (C05) |
| Has one unmistakable asset (a font, a color, an image) and wants it unmissable | Any | Virgil Abloh | One element repeated tastefully; contrast, not bigness (C05) |
| Explicitly asks for a "wow factor" | Portfolio, product launch, agency showcase | Christopher Nolan | Impress in three seconds, motion-heavy; needs design, UX, and coding capacity or a team (C05) |
| Ecommerce, checkout is the real priority | Ecommerce | Jensen Huang or Steve Jobs (function-first) | Loud or expressive styles risk distracting from product and checkout clarity (B16, C05) |
| Content/media site, article readability is the real priority | Content/media | Steve Jobs | Readable, organized, unobtrusive; the article is the star, not the chrome (B16, C05) |
| Educational site, needs sustained engagement | Educational | Drew Barrymore or Virgil Abloh | Warmth or one strong repeated motif helps sustain attention over a longer session (B16, C05) |

### Failure modes

| Failure | The tell | Fix | Source |
|---|---|---|---|
| Style picked without checking the client's own language or references | Direction argued from designer taste, not client signal | Re-derive from the client's actual words and reference sites | C05, A01 |
| Drew Barrymore style chosen without confirming photography | Design stalls waiting on photos that were never guaranteed | Confirm photography access before committing, or compensate with palette and corners | C05 |
| Christopher Nolan style chosen without the team, skill, or budget to build it | Motion and interaction ship broken or get cut late | Confirm capacity first, or use tools like Unicorn Studio or Spline to close the gap | C05 |
| Virgil Abloh style with multiple "stunning" elements stacked | Page feels tacky or busy instead of unmissable | Cut to exactly one repeated element | C05 |
| Style mismatched to site category | A loud or expressive style undermines an ecommerce checkout or article readability | Cross-check the style against the category's real priority | B16, C05 |
| Style copied too closely from a same-style competitor | Result reads as a clone of a known reference site | Study the reference, then deliberately diverge in execution | A01 |
| Style chosen but never grounded in a real mood board | Palette and type feel arbitrary despite the "right" style label | Derive actual colors and type from curated real references | A01 |

### Done when
- [ ] Style choice traces to the client's own language and references, not designer preference (C05)
- [ ] Style is cross-checked against the site's category priorities (B16)
- [ ] Any style-specific dependency (photography for Drew Barrymore, build capacity for Christopher Nolan, editorial fluency for Zendaya) is confirmed available (C05)
- [ ] Chosen style's execution deliberately diverges from same-style competitor references (A01)
- [ ] Palette and type for the style are derived from a real, curated mood board (A01)


---

## Content structure

<a id="content-structure"></a>

### When to use
Before any wireframe or layout work: deciding what pages and sections a site needs, and what content belongs in each, starting from the client's actual goals.

### Inputs you need first
- Client interview access, or a stand-in brief with equivalent detail.
- The business's primary and secondary goals for the site.
- Competitor and reference sites.
- The site's category, if already known.

### Procedure
1. Determine the website's category first: ecommerce, marketing/business, content/media, educational, or portfolio. Each implies different content priorities (A01, B16).
2. Interview the client to establish the site's primary goal (sell, build trust, generate leads, educate, hire) and any secondary goals, such as building trust or hiring team members (B11, A01).
3. Collect the client's own reference sites during this same conversation, to align on what "good" looks like before content or design starts (A01).
4. Brainstorm and list every content type that could support the identified goals. Bring your own suggested ideas, but treat them as prompts to react to, not a fixed list (B11).
5. Apply the site category's specific content priorities to that brainstorm: product art direction and a low-friction, multi-step checkout for ecommerce; value proposition, storytelling, and social proof for marketing and business; the individual article page for content and media; a persistent progress indicator for educational; personality plus a hiring call to action for portfolio (B16).
6. Decide goal-dependent content types, such as a blog, newsletter, or news section, based on how the business actually intends to use and market the site. Do not add them by default (B11).
7. Card-sort the brainstormed list: write each content idea down, then physically group ideas that belong together by natural affinity, for example team, vision, and story grouping into an About page (B11).
8. Turn the grouped structure into the sitemap: list every page and every section on every page (B11, A01).
9. Decide site architecture, multiple pages versus a single long page, only after the content list is settled, based on content volume. A heavy one-pager can feel uncomfortable to navigate (B11).
10. Sketch the wireframe as pure structure only: boxes and real copy, not lorem ipsum, with zero color, font, or image decisions, so structure gets validated independent of visual style (B09, A01).
11. Start wireframes by hand on paper before moving to a digital tool, to explore structure quickly without a component kit constraining the thinking (B09).
12. Get client sign-off on the wireframe and sitemap before any visual design work begins (A01, B09).

### Decision points

| Decision | Options | Trade-off | Default |
|---|---|---|---|
| Site architecture | Multi-page / single long page (one-pager) | A one-pager is simpler to navigate for light content but becomes uncomfortable once content volume grows. Multi-page scales better but adds navigation overhead. | Decide after the content list is complete, based on actual volume. Default to multi-page once the card-sort produces more than a handful of natural groupings (B11). |
| Goal-dependent content (blog, newsletter, news) | Include by default / include only where it serves an active marketing use | Including an unused content type adds maintenance burden with no payoff. Omitting a genuinely needed one under-serves the marketing plan. | Include only where the client's actual marketing approach uses it (B11). |
| Wireframe medium | Pen and paper / digital wireframe kit | Paper is faster and doesn't limit thinking to a kit's existing components. Digital is necessary when a client needs to review and approve. | Start on paper always; move to digital only when client sign-off is required (B09). |
| Content source for hero and sub-page copy | Wait for the client to supply everything / actively structure it yourself from what they gave you | Waiting risks a stalled project on thin client input. Structuring it yourself risks putting words in the client's mouth. | Actively structure the client's raw material into hero-appropriate chunks yourself, as part of the designer's job (A01). |

### Failure modes

| Failure | The tell | Fix | Source |
|---|---|---|---|
| Content or pages decided before goals | A sitemap exists but nobody can name the business goal each page serves | Stop, interview for goals, restart the content brainstorm | B11 |
| Site category never identified | Ecommerce priorities (checkout) and portfolio priorities (personality) get mixed up | Classify the site into one of the five categories first | A01, B16 |
| Wireframe shown to client with color and fonts already applied | Client reacts to visuals instead of giving structural feedback | Strip the wireframe back to boxes and real copy only | B09 |
| Lorem ipsum still in the wireframe | Structure can't be honestly evaluated because nobody is reading it | Replace with real or realistic copy | B09 |
| Blog or newsletter added without a use case | The content type ships but is never actually maintained after launch | Cut it unless it maps to a genuine marketing plan | B11 |
| One-pager chosen for a content-heavy site | The page becomes an uncomfortable, endless scroll | Reassess architecture against actual content volume | B11 |
| Visual design started before wireframe sign-off | Client requests structural changes after visual work is already invested | Get sign-off on structure first, always | A01, B09 |

### Done when
- [ ] Site category and primary and secondary goals are identified and documented (A01, B11)
- [ ] Content brainstorm is complete and card-sorted into natural groupings (B11)
- [ ] Sitemap lists every page and every section per page (B11, A01)
- [ ] Architecture (multi-page versus one-pager) is a deliberate decision based on content volume (B11)
- [ ] Wireframe is structure-only: no color, font, or finished imagery (B09, A01)
- [ ] Client has signed off on structure before visual design begins (A01, B09)


---

## Psychology and UX

<a id="psychology-ux"></a>

### When to use

Use this playbook whenever a task involves how a visitor will *behave* on a page, not just how
it looks: choosing imagery for mood, placing social proof, writing button copy, deciding what a
hover/focus state should do, or auditing a finished design for trust and clarity problems before
handoff. It draws primarily on `B18` (psychology principles), `B12` (UX/UI best practices), `C07`
(amateur vs. pro thinking), and `A02` (full course, hero/conversion sections), with supporting
citations from `B10`, `B14`, and `B16` where they apply the same mechanisms.

### Inputs you need first

- The site's single primary goal and the one action each section should produce (RULES.md
  Content and IA, rules 1 and 8).
- Candidate imagery for hero/section use, before final cropping (this playbook governs *which*
  image to choose on emotional grounds, not how to crop it: see `RULES.md` Imagery for the
  cropping/negative-space checks).
- Any available proof material: testimonials, client logos, usage numbers, before/after results.
- A list of every clickable element on the page, for the states/affordance pass.

### Procedure

1. **Pick one target emotion for the project before touching color, type, or imagery**, and
   audit every subsequent decision against that single emotion: not two, not five. `(C07)`
2. **Choose hero and section imagery for the emotional state it will induce, not just its
   literal content.** Mirror-neuron response means viewers unconsciously adopt the mood shown by
   people in the imagery around them: use images of people visibly expressing the target
   emotion (happy, focused, excited) to push visitors into that same state. `(B18, B10)`
3. **Treat social proof as a trust shortcut, not decoration.** People use "what others are
   doing" to avoid expensive, from-scratch evaluation of every decision: deploy testimonials,
   client/partner logos, and usage or revenue numbers deliberately, because they work through
   this specific mechanism. `(B18, B16)`
4. **Distribute proof throughout the page, not only below the fold.** Proof a visitor never
   scrolls to is proof that doesn't work: place proof near the top, again after the core offer,
   and again near any secondary CTA. `(A02)`
5. **Make every proof element specific.** A named, measurable outcome ("cut onboarding time
   40%") works harder than generic praise ("great service"): where proof material is currently
   generic, ask for or extract the specific number/outcome before shipping it. `(A02)`
6. **Select colors for physiological effect, not aesthetics alone**, and verify the association
   against the target audience's culture before committing (mourning color, for example, reverses
   between Western and Eastern culture). `(B18, B07)`
7. **Audit every clickable element for affordance.** Consistent color, a border/box, or a
   hover-state change must mark anything clickable, matching what visitors already expect from
   every other site they use: do not invent a new visual convention for "this is a button."
   `(B12)`
8. **Design every hover state and every focus state explicitly**, not just the default state,
   and put them in the file itself so a developer builds exactly what was intended. Confirm
   affordance still works with hover removed entirely, since mobile has no hover state to
   disambiguate what's clickable. `(B15, B12)`
9. **Write every button and link label to plainly state what happens on click.** Match label
   specificity to how self-explanatory the offer already is: a generic label like "Schedule a
   call" only works when the context is obvious; an ambiguous offering needs a specific label
   like "Book a demo." `(B12, A02)`
10. **Run the navigation-orientation check**: does the visitor always know where they currently
    are on the site, and does that context survive scroll? If breadcrumbs are used at all, apply
    them on every relevant page: inconsistent breadcrumbs are worse than none. `(B12)`
11. **Run a pre-mortem before delivery**, specifically for trust and legibility failure points:
    could a claim be misread, does a color pairing fail on a different background, does small
    type still hold contrast at its actual final size (not just the largest headline on the
    page)? Fix these before launch, not after. `(C07, B12)`
12. **Reframe every remaining open question as "what does the visitor need this to do,"** not
    "what looks good": this is the test to apply when two design options both look acceptable
    and only one actually serves the goal. `(A02, C07)`

### Decision points

| Decision | Trade-off | Default |
|---|---|---|
| Real testimonial/proof vs. no proof yet available | Real proof is the whole mechanism; fabricated or vague proof both fails ethically and reads as unconvincing | Never fabricate proof (workspace doctrine, and A02's "nobody believes you when you say 'I'm great'"); if no real proof exists yet, omit the section rather than inventing one, and flag the gap to the client `(A02)` |
| One emotion vs. a broader emotional range across the site | A single emotion keeps every decision coherent but can feel monotone across a large, varied site | One core emotion per *project* or major section, not per page-element; a multi-page site with genuinely different jobs per page (e.g. a checkout vs. a landing page) may justify one emotion per page, still singular within each `(C07)` |
| Ghost/ambiguous secondary CTA vs. no secondary CTA at all | A visible secondary action gives lower-commitment visitors a path forward; a badly styled secondary CTA competes with or gets mistaken for the primary | Include a secondary CTA only when it serves a genuinely different visitor intent; style it as clearly lower-contrast than the primary (RULES.md disagreement #3) `(B08, A02)` |
| Hover-dependent affordance vs. always-visible affordance | Hover-only cues are cheaper to design and can look cleaner on desktop; they silently fail on any touch device | Always-visible affordance as the default; hover states are an enhancement layered on top, never the only signal `(B12)` |
| Breadcrumbs vs. no breadcrumbs | Breadcrumbs help orientation on deep/complex sites; inconsistent application is worse than omission | Use breadcrumbs only on sites with genuine multi-level depth, and apply them on literally every page at that depth or not at all `(B12)` |

### Failure modes

- **Proof that visitors never see.** All social proof lives in one block near the bottom of a
  long page; most visitors never scroll that far. Tell: a page with a single "testimonials"
  section and no proof anywhere else. Fix: redistribute proof near the top and near secondary
  CTAs. `(A02)`
- **Generic praise instead of specific outcomes.** Testimonials read as vague ("great to work
  with!") rather than tied to a measurable result. Tell: no numbers, no named outcome, no
  before/after anywhere in the proof copy. Fix: request or extract a specific number from the
  client rather than shipping vague praise. `(A02)`
- **Imagery mismatched to the intended mood.** A page trying to convey calm/trust uses tense,
  high-energy imagery (or vice versa) because the image was chosen for composition quality alone.
  Tell: the imagery "looks good" in isolation but the page doesn't feel like the brand it's
  supposed to represent. Fix: re-select imagery against the single target emotion from step 1.
  `(B18)`
- **A clickable element with no affordance.** Text or a shape is clickable but shares the exact
  styling of non-clickable text nearby. Tell: users report not realizing something was a button;
  usability testing shows people missing an action entirely. Fix: apply consistent, convention-
  matching styling (step 7) and re-test without hover. `(B12)`
- **Ambiguous CTA copy on a non-obvious offer.** A vague label like "Learn more" or "Schedule a
  call" sits on an offering whose context isn't self-evident (e.g. a SaaS product with no context
  for what the call covers). Tell: visitors hesitate or abandon at the CTA despite an otherwise
  clear page. Fix: make the label specific to the actual action and its value. `(A02)`
- **Multiple emotions fighting on one page.** Playful illustration style paired with a stern,
  corporate-authority color palette and urgent, high-pressure CTA copy. Tell: the page feels
  "off" even when every individual element is well executed. Fix: pick the one target emotion and
  re-audit every element against it. `(C07)`
- **Trust failure discovered after launch instead of before.** A palette that looked fine on a
  white background fails on a photo background; small print becomes illegible on mobile. Tell:
  these are usually caught by users, not the design team, when no pre-mortem was run. Fix: run
  the pre-mortem checklist (step 11) before handoff, not as a post-launch bug report.

### Done when

- [ ] One target emotion is written down and every major visual decision can be traced back to
      it.
- [ ] Every hero/section image was chosen (or rejected) with its emotional effect stated
      explicitly, not just its composition quality.
- [ ] At least one piece of specific, real, non-fabricated proof appears above the fold and at
      least one more appears after the core offer.
- [ ] Every clickable element passes the affordance check with hover disabled.
- [ ] Every button/link label states the actual action in terms matched to how self-explanatory
      the offer already is.
- [ ] Hover and focus states exist in the file for every interactive element, not only the
      default state.
- [ ] A pre-mortem pass has been run for contrast, misreading, and small-text legibility on the
      finished build, not just the largest hero text.


---

## Layout and composition

<a id="layout-composition"></a>

### When to use
Deciding page and section structure and grid before visual styling starts, or auditing an existing layout for structural problems. Use after content-structure work (goals, sitemap, content list) is settled.

### Inputs you need first
- Approved content or copy for the page, not lorem ipsum.
- A sitemap and a not-yet-visual wireframe.
- The target container width, ideally measured from a reference site the client already approved.

### Procedure
1. Do not open layout or grid decisions before content exists. Wireframe against real copy, colorless and typeface-neutral (B09, A01).
2. Choose the row-generation method deliberately: derive rows directly from the content (C06) rather than forcing content into a fixed macro-template (C04). See the Decision point below for how the two combine.
3. Break the page's content into distinct ideas. Each idea becomes one row or section, and no row should mix two unrelated ideas (C06).
4. For a homepage, open with a hero row (background or image, heading, paragraph, button). This pattern fits the large majority of homepages (C06, B06 for the underlying big-element logic).
5. For every other content block, match it to the closest row type in a small library (two-column image and text, two-column text-only, three-column text, single-column large text, call-to-action) rather than inventing a new layout per block (C06).
6. Build every row on a 12-column grid, spanning full, half, third, or quarter columns as the content needs, and constrain the whole grid to a fixed, centered container of roughly 1000 to 1400px even on wide viewports (B06, A01).
7. Set gutter width by content type: wider gutters for text-heavy rows, tighter gutters for pure image grids (B06).
8. Inside each row, establish one big, medium, small size contrast so the visitor can tell what's first, second, and last. Exact position can shift as long as that size hierarchy holds (B06).
9. Give every row consistent vertical padding, roughly 50 to 80px, and consistent side padding at every breakpoint so text never touches the edge (C06, A01).
10. Make each row visually distinct from its neighbor (background image, white, tinted, brand color) and never repeat the same background treatment on two consecutive rows (C06).
11. Swap column order (image-left, image-right) between consecutive two-column rows of the same type to avoid visual monotony (C06).
12. Add a heading to any content block that lacks one in the raw content, and pair long text blocks with an image rather than leave a wall of text (C06).
13. Order the finished section sequence so the highest-priority information sits within the first one or two scrolls. Every visitor sees the hero; only a fraction reach the bottom (C04).
14. On sub-pages, keep the title row shorter than the homepage hero, a structural cue that the visitor left the homepage, and close every sub-page with a CTA row (C06).
15. Keep alignment (edges, baselines, spacing) fully consistent across the row. Treat misalignment as a defect, not a detail to skip (A01).
16. Confirm the layout is clear and hierarchical before calling it done: can a first-time viewer tell where to look, first, second, third (B06).

### Decision points

| Decision | Options | Trade-off | Default |
|---|---|---|---|
| How to determine section and row count | C04: a fixed four-block universal template (nav, hero, body, footer) applied to every site. C06: derive row count and type directly from the client's actual content, one idea per row. | C04 is fast and predictable but risks padding thin content to fill a block, or squeezing rich content into too few blocks. C06 fits the content precisely but takes more upfront content inventory and has no built-in section-ordering rule of its own. | Default to C06's content-derived rows for the actual section count and content. Borrow C04's scroll-engagement ordering rule (highest priority near the top) and its nav/footer minimums as a top-level sanity check. Do not average the two into one hybrid template; they answer different questions, row generation versus section ordering. |
| Container width on wide viewports | Conservative, around 1000px / wider, up to roughly 1400px | Narrower reads calmer and controls line length better. Wider fits more content per row but risks left-right scanning fatigue. | Start near 1100 to 1300px and adjust to whatever reference site the client actually supplied (B06, A01). |
| Row background variation | Alternate white and tint only / also use brand color and imagery rows | Two-tone alternation is safest and fastest. Brand-color and image rows add personality but can look patchy if overused. | Alternate white and light tint by default; drop in a brand-color or image row only where a section earns the extra weight (C06). |
| Gutter width | Wide / tight | Wide gutters protect text-heavy rows from crowding. Tight gutters suit pure image grids. | Set per row by content type, not globally (B06). |

### Failure modes

| Failure | The tell | Fix | Source |
|---|---|---|---|
| Layout designed before content exists | Placeholder or lorem copy still driving box sizes | Stop, get real content, rebuild rows from it | B09, C06 |
| Nothing aligned to anything | Reviewer can't say where to look first | Rebuild on the 12-column grid with a consistent container | B06 |
| No size hierarchy within a row | Everything reads as equally important | Force a big, medium, small contrast per row | B06 |
| Same row background twice in a row | Two adjacent sections look identical | Alternate the background treatment | C06 |
| Content stretched edge-to-edge on wide screens | Text runs the full viewport width, hard to read | Constrain to a fixed, centered container | B06, A01 |
| Wall of text with no image | Long unbroken paragraph block | Pair with an image or switch to a different row type | C06 |
| Important content buried below the fold | Key offer sits three or more scrolls down | Reorder sections by priority | C04 |
| Sub-page title as tall as the homepage hero | Visitor can't tell they left the homepage | Shorten the sub-page title row | C06 |
| Misaligned edges or baselines | Elements look close but not quite lined up | Snap to grid; treat it as a defect, not a detail | A01 |

### Done when
- [ ] Every row traces to a real content idea, not an empty template slot (C06)
- [ ] Grid is 12-column with a fixed, centered container (B06, A01)
- [ ] Each row has a clear big, medium, small hierarchy (B06)
- [ ] No two consecutive rows share the same background treatment (C06)
- [ ] Highest-priority content sits within the first one to two scrolls (C04)
- [ ] Sub-page title rows are shorter than the homepage hero (C06)
- [ ] Alignment is consistent across the whole page (A01)


---

## Hierarchy and attention

<a id="hierarchy-attention"></a>

### When to use

Use this playbook whenever a task requires deciding what a visitor looks at first, second, and
third on any screen or section: a hero, a homepage, a pricing table, a body section, or a full
landing page. Load it before placing any element, not after a layout is already drawn: hierarchy
is a decision, not a cleanup pass. It is the highest-priority playbook in this library per
`ROUTER.md`.

### Inputs you need first

- A ranked list of what matters most on the screen in question (business goal, not personal
  taste): see `RULES.md` Content and IA, rule 1.
- The content itself (real copy, real image candidates), not placeholders: hierarchy decisions
  made against lorem ipsum do not transfer to real content.
- Any existing brand/design-token constraints (font sizes, color roles) this screen must respect.
- The section's single job: what one action or understanding it must produce (RULES.md Content
  and IA, rule 8).

### Procedure

1. **List every visual block on the screen**, where a block of text counts as a block just like
   an image or a shape: nothing is exempt from the ranking pass. `(B08)`
2. **Rank the blocks by importance to the visitor**, not by how interesting they are to build or
   how much the client likes them. `(B06, B08)`
3. **Assign three contrasted size tiers (big, medium, small)** to the ranked blocks. Push the
   "big" tier hard: increase size, weight, and visual darkness until the contrast against medium
   and small is unambiguous. `(B06)`
4. **Layer color/contrast on top of size**: give the top-ranked block full-strength color;
   mute secondary and tertiary blocks by reducing opacity or shifting to gray. Do this even if
   size alone already reads clearly: stacking levers is what produces unmistakable emphasis on
   the one thing that matters most. `(B08, C03 for the opacity mechanism)`
5. **Use position as a third lever only where size and color aren't enough**: displace the
   top-ranked block out of alignment with its neighbors (e.g. raise a featured pricing column)
   to force the eye to it. `(B08)`
6. **De-emphasize before you emphasize.** If two elements are still competing after step 4,
   first reduce the loser's contrast/opacity/color rather than further inflating the winner: this is more reliable than an arms race of size increases. `(B08, C02)`
7. **Choose an attention structure deliberately** from the catalogue below, matched to the
   content shape and the page's single most important action, and name the choice so it can be
   checked later. Do not default to one out of habit. `(A02; see "Where the sources disagree" in
   RULES.md for the F-pattern dispute)`
8. **Test where the eye actually lands first** by looking at the screen fresh (or asking someone
   else to). If the answer is not immediate and obvious, the hierarchy has failed regardless of
   how correct the theory behind it was. `(A02, B10)`
9. **Re-run steps 1-8 for every section of the page, not only the hero.** A page that nails hero
   hierarchy and then goes flat for the rest of the scroll has not actually solved hierarchy.
   `(B08)`
10. **Use white space as part of the hierarchy budget, not an afterthought.** Generous space
    around the top-ranked block reinforces its importance; cramped space undercuts it even when
    size and color are correct. `(A02, C02, C05)`

### Decision points

| Decision | Trade-off | Default |
|---|---|---|
| How many hierarchy levers to stack on the top element | More levers (size + color + position) = unmistakable but can look heavy-handed if overused everywhere on the page | Stack 2 levers (size + color) as a baseline; add position only for the one or two most contested elements per page `(B08)` |
| Ghost (outline-only) button vs. filled button for a CTA | Ghost buttons read as lower-commitment and can go unnoticed if used alone; filled buttons carry more visual weight but two filled buttons side by side compete | Filled for the primary CTA always; ghost is acceptable only as the clearly secondary partner beside a filled primary: never as the sole CTA. See RULES.md disagreement #3 |
| F-pattern vs. Z-pattern vs. no named pattern | F/Z-patterns give a tested default eye path but can feel formulaic if applied without checking the actual content shape; skipping a named pattern risks an untested, accidental path | Z-pattern for hero-style single-message screens with one CTA; F-pattern for scan-heavy, text-dense sections (long-form content, comparison tables); always test step 8 afterward regardless of which is chosen `(A02)` |
| Minimalism alone vs. explicit contrast | A very clean, low-decoration page can still fail hierarchy if nothing is sized/colored differently; explicit contrast risks looking busy if overdone | Never rely on minimalism alone: always apply the size/color/position levers even on a "clean" page `(B08)` |
| Repeating the same attention structure down every section vs. varying it | Repetition is faster to build and stays consistent; unrelieved repetition reads as monotonous and visitors stop noticing new information | Vary section-to-section treatment (background, height, layout) while keeping the *ranking method* (steps 1-6) constant: see RULES.md Layout and grid, rule 6, and the C04/C06 disagreement |

### Failure modes

- **Everything competes at once.** Multiple elements sit at full size, full saturation, and
  equal weight; the tell is a section where "everything is trying to scream" and a viewer can't
  say what to look at first. Fix (re-run the ranking pass (steps 1-2)) a competing-elements
  page usually means the ranking step was skipped, not that the styling is wrong. `(B08)`
- **A logo or decorative icon outranks the actual message.** A saturated logo or a heavy icon
  next to plain text will out-compete the headline purely on contrast, regardless of intent.
  Fix: strip color/weight from the non-message element. `(B10, B14)`
- **Minimalism mistaken for hierarchy.** A page with no size/color/position contrast anywhere
  still leaves the visitor unsure where to start, even though it "looks clean." Fix: apply at
  least one explicit lever to the top-ranked element; clean and flat are not the same thing.
  `(B08)`
- **Hierarchy solved in the hero, abandoned after.** The first screen reads clearly; every
  section below it is a flat wall of equal-weight blocks. Fix: re-run the procedure per section
  (step 9). `(B08)`
- **A named pattern applied without checking the content.** F-pattern or Z-pattern imposed on
  content that doesn't actually fit that shape (e.g. Z-pattern forced onto a long comparison
  table) produces a path the eye doesn't actually follow. Fix: test step 8 for every section,
  not just trust the pattern's reputation.
- **Two CTAs at equal visual weight.** The visitor has to guess which action is primary. Fix:
  apply the de-emphasize-first rule (step 6) to the secondary CTA. `(B08, A02)`

### Attention-structure catalogue

Each entry states what it is, when it fits, when it fails, and how to build it. Entries are
labeled by sourcing: **corpus-cited** entries are directly described (by mechanism, even if not
always by this exact name) in one or more of the 27 usable guidebooks; **design vocabulary**
entries are standard terms in the wider design field that this library uses for completeness but
that carry no citation in this corpus: do not attach a fake citation to them, and treat them as
lower-confidence than the corpus-cited entries.

#### F-pattern: corpus-cited (contested)

- **What it is:** the eye scans left-to-right along the top, drops down, scans left-to-right
  again (usually a shorter pass), then drops and scans a final, shorter pass: tracing a rough
  "F" shape. It is the classic model for how people read text-dense pages.
- **When it fits:** scan-heavy, text-dense content where the visitor is hunting for specific
  information rather than absorbing one message (long articles, comparison content, search
  results). `(A02)`
- **When it fails:** applied to a single-message hero or a page with one dominant CTA, an
  F-pattern can scatter attention across multiple left-aligned anchors instead of funneling it
  to one action. C01 (Tier C) argues it should not be used at all, calling it outdated advice
  that causes visitors to miss important information. A02 (Tier A) treats it as a legitimate,
  deliberately-chosen tool for the right content shape. This library resolves the dispute toward
  A02 on authority grounds, with C01's caution kept as a warning against applying it by habit: see RULES.md, "Where the sources disagree," item 2.
- **How to build it:** put the most important heading and first line of body copy at the top
  left; place a secondary anchor (subheading, second key point) roughly a third of the way down,
  left-aligned; keep supporting detail lower and shorter still. Confirm afterward that the eye
  actually lands top-left first (procedure step 8).

#### Z-pattern: corpus-cited

- **What it is:** the eye moves logo (top-left) to primary action or key signal (top-right),
  diagonally down to a supporting element (bottom-left), then across to a final CTA
  (bottom-right): tracing a "Z."
- **When it fits:** single-message, single-CTA screens: heroes, simple landing sections, pricing
  cards. `(A02)`
- **When it fails:** content with more than one competing message or more than a handful of
  elements: the Z-path breaks down once there are more than four real anchor points to route
  the eye through.
- **How to build it:** logo top-left, a first CTA or key signal top-right, supporting
  content/imagery bottom-left, primary CTA bottom-right. `(A02)`

#### Layer cake (stacked, alternating rows): corpus-cited

- **What it is:** the page is built as a vertical stack of self-contained rows/sections, each
  carrying exactly one idea, with adjacent rows never sharing the same background treatment so
  each layer reads as visually distinct from its neighbor.
- **When it fits:** most homepages and long-form marketing pages: this is the default shape for
  nine out of ten homepages per the corpus. `(C06)`
- **When it fails:** a page with genuinely few ideas forced into many thin rows reads as padded;
  a page whose rows are all styled identically loses the "which layer am I on" cue the alternation
  is supposed to give.
- **How to build it:** break content into one-idea rows (RULES.md Content and IA, rule 5); never
  repeat the same row background twice in a row; give every row consistent vertical padding;
  swap column order (left/right) between consecutive two-column rows to avoid visual monotony.
  `(C06)`. C04 describes a related but distinct fixed four-block version of this idea (nav, hero,
  body, footer) where variation is pursued for its own sake rather than derived from content: see RULES.md, "Where the sources disagree," item 1, before choosing which mechanism to follow.

#### Zigzag (alternating image/text columns): corpus-cited

- **What it is:** a sequence of two-column image+text rows where the image and text swap sides
  (left-right, then right-left, then left-right) down the page, so the eye traces a zigzag as it
  scrolls.
- **When it fits:** feature lists, service breakdowns, or any sequence of 3+ similar two-column
  content blocks that would otherwise look identical stacked directly on top of each other.
  `(C06)`
- **When it fails:** fewer than three such blocks, where the swap pattern isn't visible enough to
  register as intentional; or content blocks of very different lengths, where the visual rhythm
  breaks anyway.
- **How to build it:** alternate left/right column order between consecutive two-column
  image+text rows. `(C06)`

#### Gutenberg diagram: not sourced from the corpus; design vocabulary

- **What it is:** a four-quadrant model of a symmetrically-weighted page: primary optical area
  (top-left), strong fallow area (top-right), weak fallow area (bottom-left), terminal area
  (bottom-right): describing where attention naturally lands and drains on a page with no other
  strong visual cues.
- **When it fits (design-vocabulary guidance, not corpus-verified):** low-contrast, text-only
  layouts with no dominant hero image or CTA to otherwise route the eye.
- **When it fails:** any page with a strong hierarchy already established via size/color/position
  (the vast majority of what this library otherwise recommends): the Gutenberg model describes
  what happens in the *absence* of deliberate hierarchy, not a technique to apply on top of it.
- **How to build it:** not applicable as a build procedure here; it is a diagnostic model, not a
  construction method. Use `RULES.md` Hierarchy and attention, rules 1-3, to build hierarchy
  directly instead of relying on this fallback pattern.

#### Radial / centre-out: not sourced from the corpus; design vocabulary

- **What it is:** one focal element sits at or near the visual center, with supporting elements
  arranged around it so the eye radiates outward from the center rather than moving along a
  linear path.
- **When it fits (design-vocabulary guidance, not corpus-verified):** a single hero
  product/object shot with supporting copy or icons arranged symmetrically around it.
- **When it fails:** any content with a clear reading sequence (steps, a story, a comparison): radial layouts have no inherent "read this first" order beyond the center, so sequenced content
  becomes ambiguous.
- **How to build it:** not covered by this corpus. Do not treat this entry as backed by any
  guidebook rule.

#### Axial centre-stage (one dominant central anchor): not sourced from the corpus; design
vocabulary, closest corpus analog noted

- **What it is:** one visual element is established as the singular anchor of the whole page or
  section, with every other element positioned or styled to support and echo it rather than
  compete with it.
- **When it fits (design-vocabulary guidance, not corpus-verified):** brand-forward or
  editorial-style pages where one signature visual carries the page's identity.
- **When it fails:** pages needing to communicate several distinct pieces of information with
  equal near-term urgency (e.g. a pricing comparison): a single anchor structure suppresses
  everything else by design, which is wrong when nothing should be suppressed.
- **How to build it:** the corpus does not describe this axial/centre-stage pattern by name, but
  C03's "star of the show" technique is the closest analog actually cited: choose one deliberate
  visual element tied to what the product/story actually does (not picked for looking cool), and
  repeat its shapes, colors, or textures across secondary components ("visual rhyming") so the
  rest of the page reads as orbiting that one anchor. `(C03)` Treat this as a real, usable
  technique on its own terms; do not treat it as full confirmation of the broader "axial
  centre-stage" vocabulary term, which remains uncited.

### Done when

- [ ] Every visual block on the screen has been ranked by importance, not by build convenience.
- [ ] The top-ranked block is unambiguous on at least two levers (size, color, or position).
- [ ] A named attention structure was chosen deliberately for the screen and matches its content
      shape (procedure step 7).
- [ ] Someone looking at the screen fresh reports the same "first, second, third" order the
      ranking intended (procedure step 8).
- [ ] The hierarchy check has been re-run per section, not only on the hero.
- [ ] No two elements at the same rank are styled identically (same size, weight, and color)
      where one is actually meant to lead.
- [ ] White space around the top-ranked element is deliberately generous, not just whatever was
      left over.


---

## Hero section

<a id="hero"></a>

### When to use
Building or auditing the hero section of a landing page or homepage: the first full-viewport block a visitor sees. Use after the sitemap and wireframe exist, before or during high-fidelity visual design.

### Inputs you need first
- The site's strategy outcome: what the business does, who it's for, what the page needs the visitor to do (goal already established, not invented here).
- A wireframed hero block (logo, nav, headline, subhead, image, CTA) with no color or type decisions yet.
- Candidate hero photography or a plan to generate/commission it.
- Brand fonts and colors, if already locked; otherwise this playbook assumes they get set alongside the hero.

### Procedure
1. Fix the hero's job before opening a design tool: it must answer who/what/why in the first 15 seconds, since roughly 80-90% of visitors leave a site within that window if it stays unclear (B10, A02).
2. Wireframe the hero as pure blocks (logo, nav, headline, subhead, image, CTA) before any visual styling (A01, B10).
3. Select hero photography in a wide format with genuine negative space next to the subject. Reject candidates with busy backgrounds; there is nowhere clean to put text (B10).
4. If the best available image lacks the needed space, extend the canvas (duplicate and stretch a seamless region, such as sky, then blur the seam) rather than settle for a bad crop or stretch the subject itself (B10, A01).
5. Never crop the logo to an icon-only mark in the hero. The full name must be legible, or the 15-second identity check fails (B10).
6. Set the headline as the single biggest, boldest element on the page. Write it to do two jobs at once: state what the business does and state why it matters (B10, A02).
7. Tighten the default line-height on the headline. Software defaults read as too loose at large sizes (B10, B14).
8. Set supporting subhead copy in a plain, highly legible font, width-matched to the headline, with no single word orphaned onto its own last line (B10).
9. Give the hero one clear CTA, or a primary/secondary pair. Label it for exactly what happens on click, style it to match the brand's tone, and set it apart with high contrast (A02, B10).
10. Put the full value proposition and enough context to act inside the hero itself. Do not save the real pitch for after the scroll (A02).
11. Pick the headline font as the anchor first, not the body font, since it carries the page's personality; then choose the supporting font to feel like it belongs to the same world while still contrasting (C03).
12. Audit the finished composition for competing elements. If a secondary element (a saturated logo mark, a busy icon) pulls attention away from the headline, reduce its color or weight until it stops competing (B10, B14, C03).
13. Confirm the eye lands on the headline first, then the supporting visual, then the CTA, in that order, with no hunting (B10, A02).
14. Align and evenly space the navigation to a shared reference point, such as the logo, before calling the hero done (B10).

### Decision points

| Decision | Options | Trade-off | Default |
|---|---|---|---|
| Hero layout shape | Single-column centered / split image and text / full-bleed image with overlay | Centered is fastest but generic. Split gives both text and image dedicated room. Full-bleed overlay is the boldest but risks a contrast failure. | Split two-column, subject image given clear negative space (B10). |
| CTA label specificity | Generic label ("Get started") / specific label ("Book a demo") | Generic works only when the offer is already obvious from context. Specific reduces friction but costs brevity. | Match specificity to how self-explanatory the offer is; default to specific unless the business type makes generic unambiguous (A02). |
| Fixing low hero-image contrast | Dark overlay / recrop and reposition / reduce headline size | Overlay is fastest but can mute the image's mood. Recropping is slower but preserves full tone. Shrinking type protects the image but risks weakening hierarchy. | Recrop or reposition first; use an overlay only if recropping cannot get you there (B10, B14). |
| Font pairing order | Anchor on the headline font first / anchor on body readability first | Headline-first optimizes personality and impact. Body-first protects the workhorse text. | Pick the headline font as anchor (C03), then choose the body font purely for readability, never the reverse (A02). |
| De-emphasizing a competing element | Desaturate or reduce opacity / resize / reposition | Desaturating preserves shape and identity but changes color. Resizing keeps color but changes proportion. Repositioning changes reading order. | Reduce color or opacity first: the fastest single-variable fix that preserves the asset (B10, C03). |

### Failure modes

| Failure | The tell | Fix | Source |
|---|---|---|---|
| Hero doesn't answer who/what/why | Visitor can't say what the site does after five seconds | Rewrite the headline to state what plus why in one line; ensure a legible full-name logo | B10 |
| Icon-only logo in the hero | No text name visible near the mark | Add the wordmark or full lockup next to or inside the logo | B10 |
| Busy hero background | No clean zone left for text | Reselect an image with negative space, or extend and blur the canvas | B10 |
| Text placed over a face | Headline or CTA overlaps a person's face in the photo | Recrop or reposition text away from any face | A01 |
| Orphaned word in subhead | Last line of subhead is a single word | Rewrap the copy or adjust the container width | B10 |
| Competing saturated element | Eye jumps to a logo or icon before the headline | Reduce its color or opacity until hierarchy reads correctly | B10, C03 |
| Vague CTA on a non-obvious offer | "Schedule a call" on a SaaS product with no context of what the call covers | Replace with a specific action label | A02 |
| Loose default line-height on the headline | Large type shows visibly extra gaps between lines | Tighten line-height manually | B10, B14 |
| Value proposition saved for after the fold | Hero has only a logo and tagline; the real pitch appears further down | Move the full value proposition into the hero itself | A02 |

### Done when
- [ ] Headline states what the business does and why it matters, in one line (B10, A02)
- [ ] Company name is legible in the hero, not an icon-only mark (B10)
- [ ] Eye lands on headline first, then visual, then CTA, with no hunting (B10, A02)
- [ ] CTA is high-contrast, specifically labeled, and matched to offer clarity (A02)
- [ ] No orphaned words, no text over faces, no uncleaned busy background (B10, A01)
- [ ] Navigation is aligned and evenly spaced (B10)
- [ ] Full value proposition is present before any scroll (A02)


---

## Typography system

<a id="typography-system"></a>

This corpus is thin on typography. The dedicated episode, B04, is marked `authority: low` and `transcript_quality: degraded` and is never cited here or anywhere else in this library. This playbook is built entirely from what A01, A02, C01, and C07 actually state.

Not sourced from this corpus: any universal type-scale ratio (major third, minor third, and so on), a general line-length or measure target, or general contrast-ratio numbers. A01 states concrete px values, but they are the sizes settled on for one specific client project after live iteration, not a stated general rule; they are noted below as an example, not prescribed as a default. If a project needs a formal modular scale, that decision must come from the project's own DESIGN.md or an outside type reference, not from this corpus.

### When to use
Choosing or auditing the heading and body font pairing and the type hierarchy for a page or site.

### Inputs you need first
- Brand fonts, if already set.
- Draft headline and body copy.
- The list of heading levels actually needed (H1, H2, H3, body).
- The breakpoints the design has to hold up at.

### Procedure
1. Treat a font pairing as the baseline, not a shortcut: one unique heading or display font paired with a plain, highly legible body font. Never force one typeface to carry both jobs (A01).
2. Build the pairing around the heading font's personality first; it must match the brand, since the heading is where character gets expressed (A01, A02).
3. Reject a candidate heading or display font for body use if its thin details break down at small sizes. Legibility failure disqualifies it from body duty (A01).
4. Cap the whole system at three fonts maximum: one heading, one body, one optional accent. Default to a two-font pairing; every extra font adds visual noise (A02).
5. Let the body font disappear: prioritize readability over personality for body copy every time. Save personality expression for the heading font (A02).
6. Treat font choice as strategic, not cosmetic: a font swap alone, with nothing else changed, can shift the site's entire perceived category, for example from local business to tech startup (A02).
7. Where a distinct heading font isn't available or affordable, build hierarchy from a single font family using only size, weight, kerning, and leading differences. A bespoke pairing is not mandatory (A02).
8. Structure text into three roles and no more: H1, the biggest, states what the whole page is about; H2, subheadings that divide the page and guide attention; and body or paragraph text, plain and never decorative (C01).
9. Never use a decorative typeface for paragraph text. It may look distinctive but kills readability (C01, A01).
10. Reserve H1 for the single most important heading per page; use H2 and H3 hierarchically below it. Heading tags communicate structure to both visitors and search engines (A01).
11. Scale the whole type hierarchy down together at smaller breakpoints: H1, H2, and subheading all shrink in proportion, not just the headline in isolation (A01).
12. Read "one word per line" on a mobile headline as a signal the type is oversized, and shrink it until that stops happening (A01).
13. Load only the font weights actually used in production. Loading every variant slows the page down (A01).
14. Build reusable named style tokens (H1, H2, subheading, body, nav link) once, in both the design tool and the dev tool, so one edit updates every instance (A01).
15. Before shipping, confirm the type still functions and reads correctly at the smallest size it will actually appear at, not just at its largest instance (C07).
16. Treat the type system as a system, not a set of one-off choices per page, so a stranger picking up the file could extend it consistently (C07).

### Numbers actually stated in this corpus (example project, not a general rule)
| Spec | Value | Context | Source |
|---|---|---|---|
| H1 (desktop) | 50px | Settled value for one real client project after live iteration | A01 |
| H2 (desktop) | 42px | Same project | A01 |
| H3 (desktop) | 35px | Same project | A01 |
| Body / subheading (desktop) | 16px | Same project | A01 |
| H1 (mobile portrait) | 27px | Reduced from the desktop value until one-word-per-line wrapping stopped | A01 |

### Decision points

| Decision | Options | Trade-off | Default |
|---|---|---|---|
| Font pairing depth | Single family, size and weight only / two fonts, heading plus body / three fonts, heading plus body plus accent | Single-family is safest and cheapest but has a hierarchy ceiling. Two-font gives a personality-versus-readability split. Three-font adds noise risk. | Two-font pairing: a unique heading font, a plain legible body font (A01, A02). |
| Body font selection priority | Readability first / personality first | Personality-first risks a body font people can't comfortably read at length. Readability-first can feel generic if taken too far. | Readability first, always, for body copy (A02). |
| Heading structure discipline | H1 used more than once per page / H1 reserved for one element | Multiple H1s dilute what the page is stated to be about, for both readers and search engines. | H1 once per page, H2 and H3 below it (A01). |
| Mobile type scaling | Shrink the headline only / scale the whole hierarchy together | Shrinking only the headline breaks the size relationship between levels. | Scale H1, H2, subhead, and body down together (A01). |

### Failure modes

| Failure | The tell | Fix | Source |
|---|---|---|---|
| One typeface forced to do both heading and body work | Headings feel bland, or body feels stylized and hard to read | Split into a heading font and a plain body font | A01 |
| Display font used for body copy | Thin strokes vanish or blur at small sizes | Swap to a plain, legible body font | A01 |
| More than three fonts on one page | Page feels visually noisy with no clear reason | Cut back to two fonts, three maximum | A02 |
| Body font chosen for personality over legibility | Long paragraphs are tiring to read | Re-prioritize readability for body text | A02 |
| Decorative typeface on paragraph text | Body copy looks distinctive but is slow to read | Replace with a plain paragraph font | C01 |
| Multiple H1s on one page | Search engines and assistive tech can't tell what the page is about | Reserve H1 for one element, demote the rest | A01 |
| Mobile headline wraps to one word per line | Headline looks broken or oversized on small screens | Shrink the whole hierarchy in proportion | A01 |
| Every font weight loaded just in case | Page load is slow, font payload is bloated | Load only the weights actually used | A01 |
| Type system never tested at production size | Type breaks or clips at the smallest real instance | Check type at its smallest actual use before shipping | C07 |

### Done when
- [ ] Heading and body use two distinct, deliberately paired fonts, or one family with a size, weight, and kerning hierarchy (A01, A02)
- [ ] Body font prioritizes readability over personality (A02)
- [ ] H1 appears once per page; H2 and H3 are used hierarchically below it (A01)
- [ ] No decorative typeface is used for paragraph text (C01, A01)
- [ ] Mobile headline does not wrap to one word per line (A01)
- [ ] Only the font weights actually used are loaded (A01)
- [ ] Type is checked and legible at its smallest production size (C07)
- [ ] Style tokens (H1, H2, body, nav) are defined once and reused, not redefined per instance (A01)


---

## Color system

<a id="color-system"></a>

### When to use
Choosing or auditing a page or site color palette, from base color selection through applied hierarchy.

### Inputs you need first
- Existing brand colors, if any.
- A mood board or reference imagery, if colors are being chosen from scratch.
- The target audience's cultural context.
- The site's accessibility requirement (this workspace treats accessibility as a baseline, not optional).

### Procedure
1. Check whether the project already has established brand colors. If it does, use them as-is rather than picking new ones from scratch (B07).
2. If starting from scratch, choose the base or dominant color by its psychological and cultural meaning, matched to the content type and audience, not by personal taste (B07).
3. Verify the chosen meaning against the target audience's actual culture before committing. Some associations are near-universal (green for nature), and some are culture-specific and can reverse (black signals mourning in Western culture, white signals mourning in Eastern culture) (B07).
4. Build the palette from the base color using an established color-harmony relationship (complementary, split-complementary, triad, or analogous) in a color-wheel tool (B07).
5. Cap the palette at three to five colors total: one primary, one or two neutrals, and one accent reserved specifically for calls to action and things that need noticing (A02).
6. Apply the 60/30/10 distribution as a flexible starting ratio, not a fixed law: roughly 60% dominant or neutral, 30% secondary, 10% accent. The real goal is clear contrast and hierarchy between the three roles, not hitting exact percentages (B07, A02, C01).
7. Treat black and white as deliberate, counted color choices, not a free default sitting outside the ratio (B07).
8. Reserve the accent color for calls to action and other must-notice elements only. Using it everywhere defeats its purpose (A02).
9. Check every paired color combination for sufficient contrast, including for accessibility and screen-reader-flagged content, using a contrast-checking tool (C01, A02).
10. When color intuition is weak, study how other designers have combined the same rationally chosen base color on real reference sites, and adapt, not copy, their relative palette (B07).
11. Where the project already has product or location imagery, extract a supplementary palette directly from it with a color-extraction tool (B07).
12. Once the palette is set, use opacity, not only hue, as an additional hierarchy lever on text and elements: full opacity for the primary element, reduced opacity for secondary elements, using roughly 87% high emphasis and 60% medium emphasis as a reference point (C03).

### Decision points

| Decision | Options | Trade-off | Default |
|---|---|---|---|
| Where the base color comes from | Existing brand colors / meaning-based selection from scratch / extracted from reference imagery | Brand colors are non-negotiable when they exist. Meaning-based gives a defensible rationale to explain to a client. Image-extraction is fast but ties the palette to whatever photography is available. | Existing brand colors first; otherwise meaning-based selection, validated against the audience's culture (B07). |
| Palette breadth | Strict 3 colors / up to 5 colors | Fewer colors is safer and easier to keep consistent. Up to 5 allows more nuance but raises the risk of accent dilution. | 3 to 5 maximum, with only one true accent (A02). |
| 60/30/10 enforcement | Treat as exact percentages / treat as a directional guideline | Exact percentages can force awkward decisions on real layouts. Treating it as a pure suggestion risks losing the intended contrast if ignored entirely. | Directional guideline: keep dominant, secondary, and accent contrast clearly readable; do not measure pixels to hit the ratio (B07, C01). |
| Secondary hierarchy lever | Color alone / color plus opacity | Color alone can run out of contrast options within a locked palette. Adding opacity gives a second, non-color-changing hierarchy tool. | Use both: color for role, opacity for emphasis within a role (C03). |

### Failure modes

| Failure | The tell | Fix | Source |
|---|---|---|---|
| Colors picked with no rationale | "I like teal, so the whole site is teal" | Restart from meaning, audience, and a culture check | B07, A02 |
| Cultural mismatch in color meaning | A color reads as celebratory in one culture and mournful in another, for the actual audience | Verify meaning against the specific target culture before committing | B07 |
| More than five colors in the working palette | Palette swatches keep multiplying during design | Cut back to 3 to 5 with one accent | A02 |
| Accent color used everywhere | Every header and button is the same "special" color | Reserve the accent strictly for calls to action and must-notice items | A02 |
| Black and white treated as free defaults | Palette documentation ignores black and white entirely | Count black and white as deliberate palette members | B07 |
| Low contrast pairing | Text is technically readable but feels fuzzy, and fails a contrast check | Re-pair colors and verify with a contrast tool | C01, A02 |
| 60/30/10 forced to the pixel | Layout looks awkward because a designer chased exact percentages | Treat the ratio as directional; prioritize contrast and hierarchy over the math | B07 |
| All text at full opacity | No visual distinction between primary and secondary text within one color | Apply opacity tiers for emphasis | C03 |

### Done when
- [ ] Palette uses existing brand colors, or a rationally chosen base color validated against the audience's culture (B07)
- [ ] Palette is 3 to 5 colors: one dominant, one or two neutrals, one accent (A02)
- [ ] Accent color is reserved for calls to action and must-notice elements only (A02)
- [ ] Every text and background pairing passes a contrast check (C01, A02)
- [ ] Black and white, if used, are counted as deliberate palette choices (B07)
- [ ] Opacity is used as a secondary hierarchy lever within the chosen colors (C03)


---

## Motion and scroll

<a id="motion-scroll"></a>

This corpus has no dedicated motion or scroll-animation episode, and coverage is thin even inside the assigned primary sources: A01 explicitly states it does not teach animation, and C03's "depth" tips describe static texture and glass effects, not motion. What follows is assembled from the scattered rules that do exist: A02's animation principles (the richest single source), B12 and B15 on hover and focus states, C08 on decorative animated backgrounds, and B03's restraint-over-decoration pattern. Not sourced from this corpus: exact transition durations, easing curves, or named scroll-animation patterns (parallax speed, stagger timing, scroll-triggered reveal thresholds). No guidebook states these; do not invent them. Pull them from the project's own DESIGN.md or an outside motion reference if a project genuinely needs them.

### When to use
Deciding whether and how to add motion, hover behavior, or scroll-based effects to an already-structured page.

### Inputs you need first
- A finished, static layout with hierarchy already resolved (motion is a polish pass, not a structural one).
- A list of interactive elements that need hover and focus states.
- Any decorative motion assets already proposed (background animation, video, 3D).

### Procedure
1. Treat animation as in service of the visitor, never as the experience itself. Cut anything whose only purpose is to show off animation skill (A02).
2. Test every motion decision with one question: does it help someone use the site, or does it show off that you know how to animate? If the latter, cut it (A02).
3. Reserve motion for micro-interactions: hover color shifts, easing scroll-ins, subtle field-confirmation feedback. These build a feeling of quality without becoming the point (A02).
4. Never let animation block or stall scroll progress. Elements flying in from every direction, dizzying parallax, and long transitions cost the visitor's patience and read as asking permission to use the site (A02).
5. Design and document every hover state explicitly (what changes color, what opens) as part of the design file, not left to a developer's judgment (B12, B15).
6. Design focus states in addition to hover states, for keyboard and voice navigation. Hover-only affordance fails entirely on mobile and for non-mouse input (B12, B15).
7. Add every hover and focus scenario into the actual design file so whoever builds it knows exactly what to build (B15).
8. If using decorative animated background elements, check whether the effect overpowers content readability, and scale it back (lower opacity, simpler or bigger shapes) if it competes with legibility (C08).
9. Default to restraint with high-capability motion technology, such as WebGL, particle or 3D animation, and video backgrounds, even though it is now easy to add. The historical pattern favors minimizing flashy effects so people can actually consume the content (B03).
10. If adding a static depth or texture effect (glass, subtle 3D) as a substitute for motion, keep it subtle enough that it never competes with the page's one signature element (C03).

### Decision points

| Decision | Options | Trade-off | Default |
|---|---|---|---|
| Motion scope | Micro-interactions only (hover, focus, subtle scroll-ins) / showcase animation (parallax, multi-element choreography) | Micro-interactions read as quality and rarely fail. Showcase animation impresses occasionally but risks stalling scroll and reads as self-indulgent. | Micro-interactions only, tested against "does this help or show off" (A02). |
| Hover-only versus hover plus focus | Design hover only / design hover and focus | Hover-only leaves keyboard, voice, and mobile users with no affordance signal at all. | Always design both, and document both in the file (B12, B15). |
| Decorative animated background | Full strength / scaled back | Full strength can overpower legibility. Scaled back protects reading but reduces the visual impact. | Scale back (lower opacity, simpler shapes) whenever it competes with content readability (C08). |
| High-capability motion tech (WebGL, 3D, video background) | Use freely because it's now easy / use only when it serves the content | Flashy tech impresses briefly but historically loses to restraint once the novelty fades. | Restraint by default; add only where it earns its place (B03). |

### Failure modes

| Failure | The tell | Fix | Source |
|---|---|---|---|
| Animation that shows off rather than helps | Visitor notices the animation before the content | Cut it; keep only micro-interactions | A02 |
| Elements flying in from every direction, heavy parallax | Scroll feels like it needs permission to proceed | Remove or drastically simplify motion on scroll | A02 |
| Hover states undesigned | Developer has to guess what changes on hover | Design and document every hover state explicitly | B12, B15 |
| No focus state | Keyboard and mobile users get no affordance signal | Add explicit focus states alongside hover | B12, B15 |
| Decorative animated background competes with content | Text becomes hard to read over the moving element | Reduce opacity or simplify shapes until legibility returns | C08 |
| Flashy tech (3D, video background) added without a content reason | The effect exists because it was possible, not because it helps | Default back to restraint; justify the addition or cut it | B03 |

### Done when
- [ ] Every animation on the page passes the "help or show off" test (A02)
- [ ] Motion never blocks or stalls scroll progress (A02)
- [ ] Hover and focus states are both designed and documented in the file (B12, B15)
- [ ] Any decorative animated element has been checked against content readability (C08)
- [ ] High-capability motion tech is used only where it earns its place, not by default (B03)

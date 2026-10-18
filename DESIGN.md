---
name: ClaudeWatch
description: Corporate City scene materials with the inherited Dispatch Deck controls.
colors:
  corporate-lacquer: '#344D5C'
  corporate-ink: '#26323B'
  corporate-gold: '#D4A666'
  corporate-brass: '#A8B8BC'
  corporate-copper: '#B87757'
  corporate-paper: '#E9EEF0'
  corporate-wood: '#B99270'
  corporate-floor: '#CBD4D7'
  corporate-stone: '#BAC5C7'
  corporate-blossom: '#799B86'
  corporate-glow: '#72C3CC'
  corporate-steam: '#F0F4F5'
  corporate-facade: '#E1E6E5'
  corporate-concrete: '#ABB7BA'
  corporate-frame: '#34434B'
  corporate-glass: '#7899AC'
  corporate-roof: '#697D86'
  corporate-road: '#425159'
  corporate-sidewalk: '#D3DEDC'
  corporate-park: '#789D83'
  corporate-foliage: '#50745D'
  corporate-retail: '#B18E68'
  corporate-civic: '#5F879A'
  corporate-residential: '#94A8AE'
  corporate-culture: '#BD917F'
  corporate-workshop: '#809495'
  corporate-light: '#DFEEE9'
  corporate-screen: '#477E94'
  hud-surface: '#121629'
  hud-rail: '#171C36'
  hud-plate: '#1B2140'
  hud-hover: '#262D54'
  hud-border: '#353D6C'
  hud-brass: '#B08D57'
  hud-brass-line: '#7A6748'
  hud-lantern: '#FFC46B'
  hud-lantern-bright: '#FFD28E'
  hud-lantern-hot: '#FFF0D2'
  hud-lantern-subtle: 'rgba(255, 196, 107, 0.15)'
  hud-patina: '#5FD3C4'
  hud-paper: '#EFE6D2'
  hud-paper-shade: '#D9CCAE'
  hud-mist: '#B3B9D6'
  hud-mist-quiet: '#8F97BC'
  hud-ink: '#1C1A1E'
  hud-seal: '#D8432F'
  hud-track: '#2E3560'
typography:
  title:
    fontFamily: '"DIN Condensed", Bahnschrift, "Arial Narrow", sans-serif'
    fontSize: '1.125rem'
    fontWeight: 700
    lineHeight: 1
  stat:
    fontSize: '2rem'
    fontWeight: 700
    lineHeight: 1
  count:
    fontFamily: '"DIN Condensed", Bahnschrift, "Arial Narrow", sans-serif'
    fontSize: '1.375rem'
    fontWeight: 700
    lineHeight: 1
  heading:
    fontSize: '0.8125rem'
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: '"Avenir Next", "Segoe UI", system-ui, sans-serif'
    fontSize: '0.8125rem'
    fontWeight: 400
    lineHeight: 1.5
  caption:
    fontSize: '0.6875rem'
    lineHeight: 1.4
    letterSpacing: '0.02em'
  mono-sm:
    fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace'
    fontSize: '0.75rem'
    fontWeight: 500
    lineHeight: 1.4
rounded:
  card: '6px'
spacing:
  hud-grid-gap: '12px'
  hud-grid-padding: '12px'
  plate-edge: '1px'
components:
  button-primary:
    backgroundColor: '{colors.hud-lantern}'
    textColor: '{colors.hud-ink}'
  button-primary-hover:
    backgroundColor: '{colors.hud-lantern-bright}'
  button-quiet:
    backgroundColor: '{colors.hud-hover}'
    textColor: '{colors.hud-paper}'
  button-ink:
    backgroundColor: '{colors.hud-ink}'
    textColor: '{colors.hud-paper}'
  bar-button:
    textColor: '{colors.hud-mist}'
  bar-button-pressed:
    backgroundColor: '{colors.hud-hover}'
    textColor: '{colors.hud-paper}'
  plate:
    backgroundColor: '{colors.hud-brass-line}'
    padding: '{spacing.plate-edge}'
  plate-face:
    backgroundColor: '{colors.hud-plate}'
  office-field:
    backgroundColor: '{colors.hud-surface}'
    textColor: '{colors.hud-paper}'
    typography: '{typography.body}'
  segment-selected:
    backgroundColor: '{colors.hud-lantern-subtle}'
    textColor: '{colors.hud-lantern}'
---

# Design System: ClaudeWatch

## Overview

**Creative North Star: "Corporate City"**

This reference helps designers and engineers extend ClaudeWatch's built Office scene without replacing its operational controls. The approved world is a contemporary business district with original human-looking software agents and Cities: Skylines-style readable zoning. People depict software sessions; they do not depict employees or imply human staffing.

The 3D world uses mineral façades, graphite frames, blue-gray glazing, muted planting and timber. The heads-up display (HUD) retains the Dispatch Deck's dark instrument plates, warm action accent and existing font stacks. These are separate material systems, not competing status palettes. Corporate City supplies a theme kit, tower, town, worker model, pose adapter and player geometry through the existing theme interface.

**Key Characteristics:**

- Contemporary city materials around open working offices.
- Stable adult appearances for actual software-session workers.
- Inherited dark controls with shared attention and status colors.
- Camera framing accounts for occupied workspaces and HUD rails.

Recorded on 2026-10-13 from source in this worktree. The primary supplied the finish verdict: ship; the projection concern was withdrawn after settled evidence. This documentation pass does not independently verify that verdict or rendered output. It makes no claim about measured contrast, graphics performance or photorealism.

Sources: [PRODUCT.md](PRODUCT.md), [Office surface brief](.impeccable/surfaces/src-renderer-office-officeapp-tsx.md), [theme registration](src/renderer/office/themes/corporate-city/index.ts:10).

Frontmatter values record source tokens; they do not create a new runtime palette. `corporate-*` and `hud-*` distinguish their provenance. Component references point to those primitives. The sidecar carries styles and behavior the frontmatter cannot express.

## Colors

### Primary

The HUD's Lantern is the action and focus accent. Its brighter variant belongs to primary-button hover, and its translucent variant marks selected segments. Corporate City does not replace it with corporate gold or glow.

Corporate Lacquer, Frame and Glass give the scene its blue-gray structural character. Screen is a scene material, not a session-status token.

### Secondary

Corporate Wood and Retail add timber warmth; Park and Foliage distinguish planting. Civic, Residential, Culture and Workshop are named town material colors. They describe the built environment, not business metrics or worker states.

Corporate Gold, Brass, Copper, Blossom and Glow remain theme palette entries. Keep their existing source roles; their names do not authorize new HUD accents. In particular, Corporate Brass and HUD Brass are different tokens.

### Neutral

Façade, Concrete, Floor, Stone, Sidewalk, Roof and Road separate the scene's surfaces. Corporate Paper, Steam and Light belong to that scene vocabulary.

The HUD layers Surface, Rail, Plate and Hover with Border and Brass Line. Paper is its primary text and attention-slip surface; Mist and Mist Quiet are supporting text colors. Ink supplies dark text on light controls. Track is the empty meter material.

### State and appearance

Reuse `STATE_COLOR` and `CARD_STATUS_COLOR`: permission and question use Seal; working uses Patina; done uses Mist; error uses Lantern Hot; limited uses Mist Quiet. Card idle also uses Mist Quiet. Tailwind's general idle token is Mist, so do not collapse these two source mappings into an invented universal idle color.

Human skin, hair and clothing arrays each contain six source colors. `selectHumanAppearance(agentKey)` selects them independently and deterministically alongside one of six geometry/hair variants. Keep those arrays in `palette.ts`; they are appearance data, not another brand or status scale. Provider skin metadata continues to inherit `ROBOT_PALETTE`.

**The Separate Palettes Rule.** Corporate materials describe the world; inherited HUD and state tokens describe actions and session activity.

Sources: [corporate palette and appearance arrays](src/renderer/office/themes/corporate-city/palette.ts:5), [HUD tokens](tailwind.config.ts:23), [state mappings](src/renderer/office/office-palette.ts:12), [appearance selection](src/renderer/office/themes/corporate-city/human-parts.ts:26). Frontmatter color values copy these definitions; appearance arrays remain at their source.

## Typography

Corporate City introduces no replacement HUD typeface. Use the existing stacks:

- Plate titles and counts: DIN Condensed, then Bahnschrift, Arial Narrow and sans-serif.
- Body and controls: Avenir Next, then Segoe UI, system-ui and sans-serif.
- Monospaced content: SF Mono, then Menlo, Monaco, Consolas and monospace.

These are configured font stacks, not evidence of bundled font files. Global body text uses tabular numerals.

### Hierarchy

The frontmatter preserves the configured Stat, Count, Title, Heading, Body, Caption and Mono Small scale. Stat and Count emphasize numbers; Title labels plates; Body carries reading text; Caption supports compact labels. A token's omitted family or weight remains inherited rather than becoming a new prescription.

Shared plate titles add a small top inset to center the condensed face. Buttons use their shared regular or compact classes, including their own weight; do not apply the Body token's weight indiscriminately to every control. No new display scale is needed for the 3D theme.

Sources: [font stacks and type scale](tailwind.config.ts:75), [body defaults](src/renderer/styles/globals.css:12), [plate title](src/renderer/components/deck/deck-styles.ts:28), [HUD count](src/renderer/office/hud/hud-styles.ts:17).

## Layout

### Scene framing

Keep the existing isometric projection and deterministic town layout. Office and City are camera affordances within the same scene, not separate simulators. The surface brief keeps occupied work visible first, offices and attention on the left, the inspector initially closed, and framing controls alongside the bottom controls.

`occupiedBounds` prioritizes projects with live sessions, then rooms with live sessions, then the entire floor. Its occupied padding is (1.5 m). `frameBounds` includes name-card headroom (2.6 m) and fits projected bounds into the available HUD area. These are framing constants, not building or human proportions.

### HUD rails and responsive behavior

The shared grid defines a left rail (296px), right rail (320px), and the frontmatter's grid padding and gap. Safe insets derive from those same values; do not maintain a parallel estimate in camera code. When the inspector is closed, `hudSafeInsets(false)` reserves only grid padding on the right. Top and bottom framing reservations are (72px) and (96px).

Columns begin at the shared breakpoint (768px). Camera and name-card framing also require at least (180px) remaining between the insets. Below either condition, framing drops the horizontal rail reservations. Name-card placement still reserves the bottom bar, while its safe top is the viewport edge; camera fitting separately retains top headroom.

Derive framing reservations from the HUD grid and inspector visibility, rather than from independent rail measurements.

Sources: [shared rail geometry](src/renderer/office/logic/hud-layout.ts:3), [card safe area](src/renderer/office/logic/zone-framing.ts:44), [occupied bounds](src/renderer/office/logic/zone-framing.ts:153), [camera fitting](src/renderer/office/logic/zone-framing.ts:200), [surface layout contract](.impeccable/surfaces/src-renderer-office-officeapp-tsx.md:20).

## Elevation & Depth

The city uses model geometry and contrasting material colors to separate structural frames, façades, glazing and planting. Material labels do not specify physical shader properties: do not infer transmission, reflectivity or photorealism from the Glass token. Keep the established projection rather than introducing perspective to make the world seem more realistic.

HUD plates use tonal layering and a clipped outer edge. Their shared Plate component does not prescribe a drop shadow. Selected rows and pressed bottom controls add an inset brass ring so their state is not conveyed by fill alone.

Attention slips have the configured `slip` shadow, recorded exactly in the sidecar. It combines an inset paper-shade edge with a diffuse dark shadow; it is not a city-material treatment. Global focus uses an accent outline (2px) with an offset (2px); controls on paper switch the outline to Ink.

Sources: [world material definitions](src/renderer/office/themes/corporate-city/palette.ts:20), [plate construction](src/renderer/styles/globals.css:72), [row and pressed states](src/renderer/office/hud/hud-styles.ts:9), [slip shadow](tailwind.config.ts:92), [focus treatment](src/renderer/styles/globals.css:28).

## Shapes

### Corporate world and adults

The confirmed scene language is contemporary architecture with readable zoning and original faceted adults. Human parts use boxes, cylinders and spheres for a torso, pelvis, neck, facial features, hair, hands and shoes. Separate shoulder, elbow, hip and knee pivots support adult postures instead of rotating a rigid silhouette as one piece. Appearance variation adjusts hair detail, head width and shoulder width without creating a new session identity.

Do not transfer the worker rig to every person in the scene. The theme registers the player through its separate `playerGeometry` hook; the supplied implementation contract keeps that player a static merged adult using existing movement. Citizens remain low-detail decorative context rather than articulated session workers.

### Inherited HUD

Instrument plates cut the top-left and bottom-right corners. The global cut is (10px); an outer edge surrounds the face using the frontmatter's Plate Edge spacing. Keep the two-element construction because clipping would otherwise remove the border. The decorative Crest uses a smaller corner cut (4px).

The configured Card radius remains in the frontmatter. Controls use the shared rounded-control classes; these do not replace the plate's chamfered outline. Preserve both form languages instead of rounding every container alike.

Sources: [human pivots and parts](src/renderer/office/themes/corporate-city/human-parts.ts:13), [theme model hooks](src/renderer/office/themes/corporate-city/index.ts:16), [plate and crest geometry](src/renderer/styles/globals.css:72), [Plate and Crest components](src/renderer/components/deck/Plate.tsx:10), [configured card radius](tailwind.config.ts:89). Player/citizen scope follows the supplied implementation contract; this pass did not inspect their builders.

## Components

### Theme boundary

`corporate-city` is the registered theme ID, with the label Corporate City. Its palette, worker model, pose adapter, player geometry, office kit, tower and town plug into `OfficeTheme`. Keep existing worlds selectable and retain their IDs and saved choices. The city materials do not redefine shared status, authorization or session identity.

Source: [theme registration](src/renderer/office/themes/corporate-city/index.ts:10); compatibility constraint: [PRODUCT.md](PRODUCT.md:25).

### Session workers and motion

The appearance selector uses a stable agent key. For example, the existing implementation derives its variant as follows:

```ts
const seed = hashOf(agentKey)
const variant = Math.floor(draw(seed, 0) * 6)
```

`applyHumanPose` is the single worker adapter. It applies seated idle, working, reading, thinking, needs-you and lounging postures, or a walking pose. Working elbows compensate for shoulder and body pitch; knees bend independently. Reading controls the book's visibility. The adapter hides the legacy thought and puff effects.

Walking stride follows travel distance, with a stride length (1.05 m), rather than elapsed time. Reduced motion suppresses gait and secondary pose motion, while retaining static posture and attention information. This documents the source behavior, not a new animation policy or performance measurement.

Sources: [stable appearance](src/renderer/office/themes/corporate-city/human-parts.ts:26), [postures and motion](src/renderer/office/themes/corporate-city/human-pose.ts:74), [rig adapter](src/renderer/office/themes/corporate-city/human-pose.ts:153).

### Buttons and camera controls

Primary buttons pair Lantern with Ink and brighten on hover. Quiet buttons use Hover with Paper and an inset border that changes on hover. Paper-surface actions use the existing Ink variants. Regular and compact sizes remain separate shared classes, not overlapping height overrides.

Bottom-bar controls retain the shared HUD button style. Hover brightens text and adds the Hover surface; pressed state also adds an inset Brass ring. Office/City framing uses this inherited treatment rather than a new corporate navigation skin. Disabled buttons use reduced opacity and a not-allowed cursor. All keep the global focus treatment.

Sources: [button variants](src/renderer/components/deck/deck-styles.ts:4), [bottom controls](src/renderer/office/hud/hud-styles.ts:13), [camera affordance placement](.impeccable/surfaces/src-renderer-office-officeapp-tsx.md:20).

### Plates, rows, fields and segments

Plate wraps a separately clipped face; callers supply content padding. The shared component itself supplies only its outer edge. Rows use Hover fill for hover/current state and add an inset Brass ring for the current row.

Office text entry uses Surface, Paper, a strong Brass border and Body typography. The Deck's field variant instead uses compact text and a Mist Quiet placeholder. Preserve this distinction; do not merge their two class definitions merely because both are called `FIELD_CLASS`.

Segments use supporting text at rest, brighten on hover and use translucent Lantern fill with Lantern text when checked. Current rows, pressed controls and checked segments have different existing state contracts. The sidecar previews their styles but supplies no application behavior.

Sources: [Plate](src/renderer/components/deck/Plate.tsx:11), [HUD rows and entry](src/renderer/office/hud/hud-styles.ts:9), [Deck field and segments](src/renderer/components/deck/deck-styles.ts:31).

### Attention and meters

Paper work-order surfaces distinguish needs-you information from dark plates. Keep global Ink focus on these light surfaces. The segmented meter uses Lantern for normal fill, Lantern Hot beyond its mark and Track for the remainder; its adjacent number carries information the graphic alone may not convey. The configured pulse and slip-entry animations and global reduced-motion override live in the sidecar.

Sources: [paper role](tailwind.config.ts:63), [focus and meter](src/renderer/styles/globals.css:33), [configured animations](tailwind.config.ts:95), [reduced-motion override](src/renderer/styles/globals.css:123).

## Do's and Don'ts

### Do:

- Do use corporate materials for world geometry and inherited HUD tokens for controls and session states.
- Do preserve the isometric projection, deterministic layout, existing theme IDs and saved choices.
- Do derive camera reservations from the shared HUD grid and current inspector visibility.
- Do keep human appearances stable by agent key and worker motion tied to actual session state and travel.
- Do preserve reduced motion, quality controls and the List fallback; operational access must not require walking.
- Do use the shared button, field and Plate implementations instead of parallel corporate controls.

### Don't:

- Don't treat workers, the player or decorative citizens as employee records or real-person likenesses.
- Don't reuse corporate material colors as a new status palette or universal idle mapping.
- Don't replace the inherited HUD's fonts, dark plates or focus treatment to match the city materials.
- Don't turn readable zoning into a city simulator or copy game assets.
- Don't describe source colors or model detail as measured contrast, graphics performance or photorealism.
- Don't treat screenshots as shipping raster assets; this pass records no generated shipping raster assets.

Sources: the palette, layout and component references above; [durable product constraints](PRODUCT.md:25); the supplied documentation contract. No new visual defects were established by this source-only pass, and no finish-review concern is promoted into a permanent restriction.

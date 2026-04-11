# Dark mode

Site-wide dark theme with a single floating toggle. Swiss/Apple-minimal visual
language. Covers the React app and the standalone landing page.

## Context

Repo Timeline uses a centralized color token system already:

- `src/index.css` defines `--black`, `--white`, `--gray`, `--gray-light`,
  `--gray-lighter` as CSS custom properties.
- `src/App.css` references these via `var(--…)` in 143 places.
- `landing/index.html` is a standalone marketing page that defines its own copy
  of the same tokens inline and uses them the same way.
- Two hardcoded hex colors break out of the system (diff add/del greens and
  reds at `src/App.css:1109,1113`).
- Four `rgba(0, 0, 0, …)` shadows are hardcoded (`src/App.css:147,253,394,423`).

Because almost everything already routes through tokens, dark mode is mostly a
token override plus a toggle plus persistence.

## Goal

Ship a dark theme that (a) covers every surface on the site including the
landing page, (b) is toggleable from a single always-visible control on every
screen, (c) persists across reloads, (d) does not flash light before React
mounts, and (e) feels designed — Swiss minimalism for the toggle shape and
placement, Apple softness for the motion and palette.

## Design

### Token architecture

Introduce a semantic layer of tokens (`--bg`, `--fg`, `--fg-muted`, `--surface`,
`--border`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-xl`,
`--diff-add`, `--diff-del`) and alias the existing names to them. No existing
callsite has to change.

```css
:root {
  --bg: #fff;
  --fg: #0a0a0a;
  --fg-muted: #888;
  --surface: #f5f5f5;
  --border: #e5e5e5;
  --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.15);
  --shadow-md: 0 4px 24px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.18);
  --shadow-xl: 0 24px 80px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.04);
  --diff-add: #22863a;
  --diff-del: #cb2431;

  /* legacy aliases — existing var(--black) etc. keep working */
  --white: var(--bg);
  --black: var(--fg);
  --gray: var(--fg-muted);
  --gray-lighter: var(--surface);
  --gray-light: var(--border);
}

:root[data-theme="dark"] {
  --bg: #0a0a0a;
  --fg: #f5f5f5;
  --fg-muted: #9a9a9a;
  --surface: #141414;
  --border: #262626;
  --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.6);
  --shadow-md: 0 4px 24px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.7);
  --shadow-xl: 0 24px 80px rgba(0, 0, 0, 0.6), 0 2px 8px rgba(0, 0, 0, 0.4);
  --diff-add: #3fb950;
  --diff-del: #f85149;
}
```

Each of the 4 hardcoded shadow callsites in `App.css` maps to one of these
token values (same light-mode value, just referenced by name). Dark mode gets
much stronger alphas because shadows on near-black surfaces need ~0.5–0.7 to
create the same depth cue that 0.06–0.18 creates on white.

### Palette rationale

- Dark background is `#0a0a0a`, not pure black — prevents OLED banding and lets
  subtle borders read.
- Foreground text is `#f5f5f5` — soft white, easier on the eyes than pure white
  on dark for long reading sessions (Apple dark-mode convention).
- Muted text lifts from `#888` (light) to `#9a9a9a` (dark) so secondary copy
  stays readable against the darker background.
- Surface and border step up in 6%/14% luminance increments from the bg.
- Diff greens/reds switch to the GitHub-dark variants (`#3fb950`, `#f85149`) for
  contrast on dark.

### Toggle component

`<ThemeToggle />` — a single React component, mounted once at the top level
of `App.tsx` as a sibling to everything else.

**Placement.** `position: fixed; top: 24px; right: 24px; z-index: 1000`.
Visible on every screen — login, timeline, error states.

**Shape.** 36×36 circle. 1px border using `var(--border)`. Background
`var(--bg)`. No shadow.

**Icon.** Inline SVG, 18×18, 1.5px stroke, `currentColor`. Sun icon (center
circle r=4 plus 8 short radial strokes) shown in dark mode (indicates "click
to go light"). Moon icon (single crescent path) shown in light mode. Both
icons are rendered in the DOM at all times; the inactive one has
`opacity: 0` and is `pointer-events: none`. Crossfade: 150ms opacity. No
rotating rays, no morph.

**Motion.** Hover: `transform: scale(1.05)`, border lifts one step. Press:
`scale(0.95)`. Both 200ms `var(--ease-out-expo)`. Matches the existing motion
language on the site (the Timeline already uses the same easing).

**Accessibility.** `aria-label="Switch to dark theme"` / `"Switch to light
theme"` — label updates with state. Keyboard focusable, visible focus ring
(`outline: 2px solid var(--fg); outline-offset: 2px`). Min tap target 36px.

### Persistence

State lives in `localStorage` under key `repo-timeline-theme`, values `'light'`
or `'dark'`. No third `'system'` value — the system preference only acts as the
first-load default. Once the user clicks the toggle, the explicit choice is
locked in.

A new hook `src/useTheme.ts` (~30 lines) owns this:

1. Read `localStorage` first; fall back to
   `matchMedia('(prefers-color-scheme: dark)').matches`.
2. Apply `data-theme` to `document.documentElement`.
3. Return `[theme, toggleTheme]`.
4. Write to `localStorage` on every change.

**Mid-session system changes:** not tracked. If a user has never toggled,
their first-load theme matches system. If they later flip their OS theme
mid-session, the site does not follow — a deliberate simplification. Adding a
`matchMedia` listener is trivial but introduces an edge case (what if the
user toggles and then the system changes — do we override?). Not worth the
ambiguity for this feature.

### No-flash boot

An inline `<script>` in `index.html`, placed in `<head>` before any stylesheet
link, reads the saved theme (or the system preference) and sets the
`data-theme` attribute on `<html>` before the page paints. Same 6 lines copied
into `landing/index.html`.

```html
<script>
  (function () {
    try {
      var t = localStorage.getItem('repo-timeline-theme');
      if (!t) t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', t);
    } catch (e) {}
  })();
</script>
```

### Theme transition

`body { transition: background-color 200ms ease, color 200ms ease; }`. One
line, handles the most visible swap. Deeper elements inherit or re-render
fast enough that their color swap is visually instant inside the body fade.
No per-element transitions — too expensive and creates visual noise.

### Landing page

`landing/index.html` is standalone static HTML. It duplicates:

1. The semantic token overrides (inside its existing `<style>` block).
2. The no-flash boot script in `<head>`.
3. A tiny vanilla JS version of the toggle — a fixed `<button>` with the same
   styling, a 10-line click handler that flips `data-theme` and writes to
   `localStorage`.

No React, no shared module. The duplication is intentional: the landing page
is deployed as static HTML and pulling in React for a toggle would be a
regression.

## Files touched

- `src/index.css` — semantic tokens, legacy aliases, dark overrides, body
  transition.
- `src/App.css` — migrate diff hex colors to `var(--diff-add)`/`--diff-del`,
  migrate 4 rgba shadows to `rgba(var(--shadow-color), α)` with alpha bumped as
  needed.
- `src/useTheme.ts` — new hook.
- `src/ThemeToggle.tsx` — new component with inline SVG icons.
- `src/App.tsx` — mount `<ThemeToggle />` once at the top of the returned tree.
- `index.html` — inline no-flash boot script in `<head>`.
- `landing/index.html` — dark overrides in `<style>`, no-flash boot script,
  inline vanilla toggle button + handler.

## Out of scope

- No three-state Light / Dark / System toggle. Two-state only; system pref is
  just the first-load default.
- No per-component or per-route theming.
- No animated sun→moon morph. Simple crossfade only.
- No sync across browser tabs via `storage` events. Nice-to-have, adds code
  for marginal value.
- No server-side theme detection / cookie-based SSR hint. The app is a Vite
  SPA; the no-flash inline script is sufficient.

## Acceptance criteria

1. With no saved preference and `prefers-color-scheme: dark` on, the site
   loads in dark theme on first paint, no light flash.
2. Clicking the toggle flips the theme globally on both the React app and the
   landing page. The choice persists across a full page reload.
3. Every view — login, timeline, AI summary panel with markdown, error states
   — is legible in both themes with no hardcoded white or black leaking
   through.
4. Diff additions/deletions in the AI summary markdown are visibly colored in
   both themes.
5. Shadows are still visible on dark backgrounds (not washed out).
6. Toggle is keyboard focusable, has a visible focus ring, and has an
   `aria-label` that reflects the action it will perform.
7. No TypeScript errors, no ESLint errors, existing `npm run build` passes.

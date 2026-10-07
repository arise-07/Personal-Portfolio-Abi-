# Ronald Abi — Brand Partners

Vanilla HTML / CSS / JS. No build step, no backend.

## Run it

Open `index.html` directly, or run a local server (better — avoids any
file:// quirks):

```bash
cd brandpartners
python3 -m http.server 5173
# → http://localhost:5173
```

Deploy: drag the folder into Netlify, or `vercel` from inside it.

## Where to put images

All images live in `/assets/` with fixed filenames, so they can be
swapped without touching any code. Missing files show a labelled
placeholder frame instead of a broken icon.

| File | Used in | Best size |
|---|---|---|
| `hero.jpg` | Hero portrait | 1400×1750 (4:5) |
| `profile.jpg` | Final full-bleed frame | 2400×1400 |
| `camera.jpg` | Craft / camera HUD section | 1600×1200 (4:3) |
| `brand-partners.jpg` | Brand Partners section | 1600×1200 |
| `career-01.jpg` … `career-05.jpg` | Career timeline | 1600×1000 (16:10) |
| `gallery-01.jpg` … `gallery-08.jpg` | Floating gallery | mixed, 1200–1800px wide |

## Where to put text

Everything editable is a bracketed placeholder in `index.html`:

Name (RONALD ABI), tagline ("We Capture / Every Precious / Moment.") and
"20+ Years of Experience" are already filled in. Still to fill:

- Career — five stages, no years: The Beginning → Early Work →
  Breakthrough → Brand Partners → Today. Edit `[EARLY CAREER]`,
  `[CAREER MILESTONE]`, `[IMPORTANT PRODUCTION]` and each description
  inside the `<article class="mile">` blocks. The stage name in
  `.mile__year` is what shows in the big readout.
- `[PROJECT NAME]` / `[PROJECT YEAR]` — each `<figure class="shot">` carries
  `data-title`, `data-year`, `data-tag`; the same values appear in its
  `<figcaption>`. Update both.
- `[BRAND PARTNERS DESCRIPTION]` + craft section paragraphs
- Contact values are deliberately empty — fill the `<dd>` elements.

## Logo

Two placeholders, both marked with a comment:

1. Nav — replace `<span class="nav__logo-mark">…</span>` with
   `<img src="assets/logo.svg" alt="Brand Partners" class="nav__logo-img">`
2. Title card — `.title-card__brand`

## Adding or removing career milestones

Copy an `<article class="mile">` block. The timeline length, progress bar
and active-year readout are all computed from however many exist.

## Adding gallery images

Copy a `<figure class="shot shot--N">` block, bump the number, then add a
position rule at the bottom of the gallery block in `style.css`:

```css
.shot--9{--w:clamp(180px,22vw,360px);--ar:4/5; left:12%; top:94%}
```

`--w` = width, `--ar` = aspect ratio, `data-speed` = parallax speed,
`data-depth` = 3D offset on mouse move. If you add many, raise
`.gallery__stage { height: 300vh }`.

## Colors

Single source of truth at the top of `style.css`:

```css
--black:#000000;  --red:#C8102E;  --white:#FFFFFF;
```

## Notes

- Opening sequence (~9s, Skip button included): a 3D cinema camera built in
  Three.js emerges from darkness → focus pull → push into the lens → iris
  snaps shut → white flash → title card → site. All timing lives in the
  `initIntro()` timeline in `script.js`; in DevTools you can scrub it with
  `__introTimeline.pause().seek(4.3)`. The 3D scene is disposed once the
  intro ends. Without WebGL it skips straight to click → flash → title. To play it only on the
  first visit, gate `initIntro()` with `sessionStorage`.
- `prefers-reduced-motion` disables the intro, Three.js scene and all
  scroll animation.
- Mobile (≤820px): Three.js counts drop, the timeline turns vertical,
  the gallery becomes an offset stack, custom cursor is off.

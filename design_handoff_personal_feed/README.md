# Handoff: tomsherman.dev — Activity Feed Landing Page

## Overview
A personal landing page for Tom Sherman. A short intro sits at the top, and most of the page is a single reverse-chronological feed of everything Tom does online: blog posts, Bluesky/X posts, film reviews and ratings, plus passive activity like songs played, games played, episodes watched and GitHub events. A persistent "Now" bar shows what Tom is doing right now.

The core design problem is **signal vs. volume**. The best content (blog posts, threads, reviews) is rare, and passive activity (songs) is constant. The design solves this with three priority tiers, each with its own visual weight, plus a pinned rail that keeps the latest high-priority items visible.

Most visitors are seeing the page for the first time, so it should read as calm and spacious first, with the detail rewarding a closer look.

## About the design files
`Tom Sherman.dc.html` is a **design reference built in HTML**. It shows the intended look and behaviour; it is not code to copy. Open it in a browser (keep `support.js` next to it). Rebuild it in the site's own stack and component patterns.

All content in the reference is placeholder: the feed items, counts, people, songs and films.

## Fidelity
**High fidelity.** Colours, type, spacing, hierarchy and interactions are final. Match them closely. Where the site's component library has an equivalent element (button, chip, tooltip), use it and restyle it to match. Don't pull in its default look.

---

## Page anatomy (top to bottom)

### 1. Now bar
- Full-width dark strip (ink background, light text), **40px tall**, **stays fixed to the top of the screen** for the whole page.
- Content runs left to right and sits inside the same 1240px content column as the rest of the page:
  1. **NOW** tag: accent (lime) background, ink text, mono 11px, weight 500, letter-spacing 0.08em. It has a small ink dot that pulses slowly (about a 1.4s cycle, fading between full and roughly 20% opacity).
  2. **Artwork square**, 22×22: the album art / game cover. No radius.
  3. **Activity line**: "Listening to" in reduced opacity, then **title** (weight 500), then "— artist/subtitle" in reduced opacity. A single line that truncates with an ellipsis; this is the part that gives way on narrow screens.
  4. **Progress bar**: 72×3px, dark track with an accent fill. Only shown for activities with a known length (songs).
  5. **Elapsed time**: tabular figures. Songs show "1:13 / 3:20". Open-ended activities (games) show "1h 02m". Ticks live.
  6. **Cycle button** "1/2 ⇄": 1px outline. On hover, the outline and text turn accent. Steps through concurrent activities, e.g. listening *and* playing.
- If nothing is happening, the bar should still exist (design TBD; suggest "Offline — last seen 2h ago" in the same format, with no pulse).

### 2. Header / intro
- Breadcrumb line, mono 11px muted: `tomsherman.dev / feed` (current segment in ink), with "last activity 12m ago" right-aligned.
- **Name**: Instrument Serif, regular, `clamp(60px, 11vw, 136px)`, line-height 0.88, letter-spacing −0.025em. "Tom", then a **circular photo** (0.72em, scales with the name), then "*Sherman*" in italic. The photo currently shows a lime striped placeholder; it will be Tom's real avatar.
- **Marginalia** (keep these; they're part of the personality): a small mono note, 11px muted, rotated −4°, sitting at the end of the name line: "↖ a person, mostly online".
- **Intro**: Geist `clamp(19px, 2.1vw, 23px)`, line-height 1.35, max 32 characters per line: "Staff Engineer who cares deeply about the open web and design systems."
- **Social links**, mono 11px, inline with the intro on wide screens and wrapping below it on narrow ones: bluesky ↗ · x ↗ · github ↗ · letterboxd ↗ · last.fm ↗.
- Generous space: 72px above, 80px below, 56px between breadcrumb and name, 32px between name and intro.

### 3. Main: feed + pinned rail
Two columns on wide screens: **feed on the left (flexible, min ~540px)** and **pinned rail on the right (~300px)**, with an 88px gap between them.

### 4. Footer
Top rule, then three equal columns that stack on narrow screens. Mono 11px muted, line-height 1.7, with small uppercase ink headings:
- **Colophon**: "Set in Instrument Serif, Geist and Martian Mono. Hand-built with web components. No trackers, no cookies." (Update the build line to match reality.)
- **Sources**: "Feed pulled from Bluesky, X, Letterboxd, Last.fm, Steam and GitHub."
- **© 2026 Tom Sherman**, plus a marginalia sticker: "you are visitor №004,281". It has a 1px ink border, ink text and a −1.5° tilt. It's a deliberate old-web joke; a real counter is optional.

---

## The feed

### Filter bar
- Sits at the top of the feed column and **stays fixed directly under the Now bar** while the feed scrolls. Page-colour background, rule underneath.
- Chips: All · ¶ Writing · ✱ Posts · ◐ Film · ♫ Music · ▶ Games · ⌥ Code. Each chip shows its count in reduced opacity.
- Chip: mono 11px, padding 4×9, 1px border, square corners. Inactive chips have a light border and ink text. The active chip is filled ink with light text. Hovering darkens the border to ink.
- Choosing a type filters the feed **and** the contents of the grouped low-priority rows. Days with nothing left disappear.

### Timeline structure
Every row uses the same three-column grid: **68px timestamp gutter · 28px rail · content**.
- **Timestamp gutter**: right-aligned, mono 10.5px muted, tabular figures. Hovering shows the full date and time in a tooltip.
- **Rail**: a 1px vertical line in the rule colour runs through the column. Each item has a **marker** on the line that shows its priority (see below).
- Line-height and top padding are tuned so the timestamp, the marker and the first line of content align horizontally.

### Day headers
Same grid. Gutter: date as `04.10` (mono, muted). Content: **TODAY** / **YESTERDAY** / **THU, 3 DAYS AGO** (mono 11px uppercase, letter-spacing 0.06em, weight 500), then a rule that fills the width, then "23 things" on the right in muted text. 56px above each header, 18px below.

### Timestamp formats
Relative is the default, e.g. `12m ago` / `3h ago` / `2d ago`. Tom also likes the **T-minus** variant (`T−03:14`, `T−2d04h`), and an absolute clock format (`14:32`) exists too. Pick one for launch; T-minus is the "weird" option and is what Tom last previewed. Every item always shows a timestamp.

---

## Priority tiers

### High: blog posts, Bluesky threads, film reviews
**Marker:** 9px ink square rotated 45° (diamond), with a ring of page colour around it so the line appears to break.
**Rendered as a card.** These are the only items that show media.
- Card: near-white background, 1px card border, **no radius**, soft shadow (see tokens). On hover, the border darkens to ink. The whole card links to the item.
- Card header strip: glyph + TYPE (uppercase mono 10.5px, letter-spacing 0.04em) + "· meta" in muted text, with ↗ right-aligned. Padding 12×18, rule underneath.
- 44px space below each card.

Card variants:
- **Blog post**: full-width hero image (16:7) under the header → title in Instrument Serif `clamp(28px, 3.4vw, 38px)`, line-height 1 → excerpt in Geist 15.5px / 1.5, body colour, max 62 characters per line. Meta = reading time. Body padding 22/24/28.
- **Bluesky thread**: author row (34px avatar, name in Geist 600 14.5px, handle in mono muted) → first post at 18px / 1.45 → attached image (16:8, bordered) → footer with an overlapping stack of **participant avatars** (24px, 2px card-colour ring, −6px overlap) followed by "48 replies · 112 reposts · 640 likes". Meta = "1/12" (position in thread).
- **Film review**: two columns. A 2:3 **poster** on the left (clamped 84–120px wide) and on the right: title in Instrument Serif 30–40px + year in mono muted → star rating at 18px → review excerpt. Meta = "Letterboxd".

### Medium: short posts, replies, film ratings
**Marker:** 7px hollow circle (1.5px ink outline, page-colour fill).
**Rendered as a plain row**, with no card and no media:
- 28px avatar on the left. For Tom's own posts it's Tom's avatar. **For replies, it's the person being replied to**, which is where most of the page's colour comes from. For ratings, it's a tiny square poster thumbnail (2px radius) instead of a circle.
- Line 1, mono 10.5px: glyph + source in ink ("✱ Bluesky", "✕ X", "◐ Rated on Letterboxd"), plus "↳ replying to @mira.codes" in muted text with the handle in ink.
- Line 2: post text in Geist 15.5px / 1.45, max 60 characters per line.
- Right-aligned aside, mono 11px: like count ("♡ 212") or stars ("★★★").
- 30px space below.

### Low: songs, games, episodes, GitHub events
**Marker:** 5px solid grey dot.
**Never shown one by one by default.** All low items for a day collapse into **one summary row** placed at the time of that day's most recent low item:
- Mono 10.5px muted, items wrap: `♫ 14 tracks   ▶ Balatro 2h 14m   ◐ 1 episode   ⌥ 3 on GitHub   +19 more`
- "+N more" is underlined in ink. The whole row is clickable; on hover the text darkens to ink.
- **Expanded**: a dashed left rule indented under the summary, listing each event as `time · 10px colour square (album art / cover) · text`, at 13px, one line each with truncation. The toggle label becomes "collapse". Open/closed is remembered per day.

---

## Pinned rail
- Heading row: **◆ PINNED** tag (accent background, mono uppercase 11px), then a rule, then "latest" in muted text.
- **The two most recent high-priority items** as compact cards, styled like feed cards: 16:8 media on top (poster for reviews), header line with glyph + type and timestamp on the right, title in Instrument Serif 25px.
- **More highlights**: mono uppercase label, then a list of the remaining recent high items. Each row is glyph, title (Geist 14.5px) and timestamp, separated by dashed rules, with a faint background tint on hover.
- Pinned items **also appear in the feed** in their normal place. The rail is a shortcut, not a move.

## Responsive behaviour
- **≥ 960px:** feed and rail side by side. The rail **stays fixed** while scrolling, just below the Now bar.
- **< 960px:** the rail moves **above** the feed at full width, and the two pinned cards sit side by side (they stack when there's no room for two cards about 260px wide). The rail scrolls normally and must never overlap the feed.
- **< 640px (phones):** the Now bar hides the progress bar and shows elapsed time only ("1:16", no total), so the activity text keeps at least ~64px before it truncates. Filter chips stay on **one row that scrolls sideways** (no wrapping). The timeline gutter tightens to **52px timestamp + 20px rail**.
- The Now bar stays one line at every width. The activity text is what truncates.
- Side padding is `clamp(16px, 4vw, 24px)`. The timeline gutter keeps its size on mobile.

## Interactions summary
- Now bar: live timer, cycle button, pulsing NOW dot.
- Filter chips: one selected at a time; filters everything below.
- Low summary rows: expand/collapse per day.
- Cards, rail items, social links, "load older →" at the end of the feed: links.
- Hover: borders darken to ink. Links get an underline that is faint at rest and full ink on hover. No movement, no colour fills except where noted.

## Things the design doesn't cover yet (decisions for implementation)
- Empty state for the Now bar (suggestion above).
- Loading/skeleton state for the feed. Suggest hollow card outlines and grey lines in the same three-column grid.
- Pagination behaviour for "load older →".
- Dark mode: not designed.

---

## Design tokens

### Colour
Warm neutrals (hue 95) with **one** accent. Colour should come almost entirely from avatars, artwork and posters.

| Role | Value |
|---|---|
| Page background | `oklch(0.962 0.007 95)` ≈ `#f4f2ed` |
| Card surface | `oklch(0.998 0.002 95)` ≈ `#fffefd` |
| Ink (primary text, markers, active chip, Now bar) | `oklch(0.2 0.012 95)` ≈ `#181610` |
| Body text in cards | `oklch(0.35 0.012 95)` ≈ `#3c3b34` |
| Muted microcopy (timestamps, meta) | `oklch(0.57 0.01 95)` ≈ `#797771` |
| Rules / timeline line | `oklch(0.915 0.007 95)` ≈ `#e4e3de` |
| Card border | `oklch(0.885 0.008 95)` ≈ `#dbd9d3` |
| Chip border (inactive) | `oklch(0.85 0.01 95)` ≈ `#d0cec7` |
| Low-priority marker | `oklch(0.6 0.012 95)` ≈ `#828078` |
| Now bar progress track | `oklch(0.38 0.012 95)` ≈ `#44423b` |
| **Accent (lime)** | `oklch(0.88 0.19 125)` ≈ `#bbec4c` |

The accent is used **only** for: the NOW tag, the progress fill, the PINNED tag, the cycle-button hover, and Tom's avatar fallback. Don't spread it further.

Placeholder avatars and art use `oklch(0.8 0.12 <hue>)` with varying hue. Real images replace these.

### Shadow (cards)
`0 1px 2px oklch(0.2 0.02 95 / .04), 0 18px 40px -24px oklch(0.2 0.02 95 / .3)`

### Radius
Square corners everywhere (0). The only exceptions are avatars (circles) and poster thumbnails in medium rows (2px).

### Typography
| Role | Font | Size / line-height |
|---|---|---|
| Name | Instrument Serif 400 (+ italic) | clamp(60–136px) / 0.88, −0.025em |
| Card titles | Instrument Serif 400 | 28–40px / 1.0 |
| Rail titles | Instrument Serif 400 | 25px / 1.05 |
| Intro | Geist 400 | 19–23px / 1.35 |
| Thread post | Geist 400 | 18px / 1.45 |
| Body / post text | Geist 400 | 15.5px / 1.45–1.5 |
| Names | Geist 600 | 14.5px |
| Meta, timestamps, chips, labels | Martian Mono 400/500 | 10.5–11px, uppercase labels +0.04–0.08em |

All three fonts are on Google Fonts. Use pretty text wrapping on titles and paragraphs.

### Spacing (key values)
Header 72 top / 80 bottom · feed–rail gap 88 · day header 56 above / 18 below · high card 44 below · medium/low row 30 below · card body padding 22–24 · card header 12×18 · page side padding 16–24 (fluid).

### Glyphs (type icons)
¶ blog · ✱ Bluesky · ✕ X · ◐ film/TV · ♫ music · ▶ games · ⌥ code · ◆ pinned · ↗ external · ⇄ cycle. These are text characters, set in the mono font, so they keep the page's typewriter feel. Don't swap them for an icon set.

## Assets needed
- Tom's avatar (header and Tom's own posts).
- Per item: blog hero images, thread image attachments, film posters, album art and game covers, and avatars of the people replied to. All are currently striped placeholders.

## Screenshots
`screenshots/` has desktop (`01-desktop`, `02-desktop`, both zoomed out to show the two-column layout) and mobile at 390px (`01-03-mobile`). In some shots the fixed-position filter bar appears partway down the image; that's a side effect of how the screenshots were taken, not part of the design.

## Files
- `Tom Sherman.dc.html`: the design reference. Has a live Now bar, working filters, expandable day groups and the responsive rail.
- `support.js`: needed only to open the reference locally.

# ericrosenbaum.com — redesign plan

A static, dependency-free redesign of the home page of
[ericrosenbaum.com](https://www.ericrosenbaum.com/) (currently Squarespace).
It merges the home page, bio and publications into one page and links out
to the existing per-project pages for detail.

## Where the content came from

This session's network policy blocked the live site, so no HTML, CSS or
images were copied. The text comes from the site's own page titles and
descriptions as they appear in search results (Bio, Makey Makey, Chrome
Music Lab, Musical Paintings, MK-1 Sampler, Echolaliator, Singing Fingers,
MelodyMorph, Beetle Blocks, Glowdoodle, Earlier Work, Media). **Proofread
everything before publishing.** Years are only shown where the site or the
papers state them.

## What the redesign changes

1. **Say who you are in the first screen.** A one-line headline ("I invent
   playful tools for making music, art and code") and your current role
   sit above the fold, before any thumbnails. A portfolio grid alone makes
   visitors guess what ties the work together.
2. **Put descriptions on the cards.** Every project shows its name, a
   one-sentence description, collaborators and year without hovering.
   Hover-only captions don't work on phones and hide the information that
   matters most.
3. **Group the work by theme.** Filter chips (Music, Making, Coding, Light)
   group eleven projects that would otherwise be one undifferentiated grid.
   Current and best-known work (Scratch Lab, Makey Makey, Chrome Music Lab)
   comes first and is shown larger.
4. **One page, three sections.** Work, About and Writing sit on one
   scrollable page with anchor navigation, instead of separate Bio and
   Media pages you have to click through to.
5. **Proper citations.** Publications are listed with year, venue and the
   dissertation PDF, laid out so they're easy to scan.
6. **A little musical tinkering.** The letters of your name play pentatonic
   notes when you click, tap or hover over them. It hints at the work
   without getting in the way, stays silent until the visitor touches it,
   and respects reduced-motion settings.
7. **Fast and accessible.** One HTML file with no framework, system fonts
   plus a single Google Font, automatic dark mode, visible keyboard focus,
   semantic landmarks, and a layout that reflows down to 320px.

## Images

Each card currently shows a small generated illustration in its own
colour instead of a screenshot. To use real images, add an `img` field to
the project in the `PROJECTS` array in `index.html`
(e.g. `img: 'images/makeymakey.jpg'`). The card then shows the photo in
place of the illustration.

## Not done yet

- Real project photos (see above).
- A portrait for the About section.
- Individual project pages. The cards link to the existing pages on
  ericrosenbaum.com.

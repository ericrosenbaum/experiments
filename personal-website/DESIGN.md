# ericrosenbaum.com — redesign plan

A static, dependency-free redesign of the home page of
[ericrosenbaum.com](https://www.ericrosenbaum.com/) (currently Squarespace).
It merges the Projects, Media and Bio pages into one page. Project cards
link out to the existing per-project pages for detail.

## Where the content came from

All text and images come from the live site, mirrored with a one-off
GitHub Actions scrape (see `scrape/` on this branch, commit `d0d9d8e`).
Project descriptions are the first sentence or two from each project's
page, sometimes lightly trimmed. The bio is verbatim. The publication list
matches the Media page, including its author and editor names. Years are
only shown where the site or a paper states them.

## What the redesign changes

1. **Who you are, on the first screen.** Your tagline, "Designing for
   creative play", and a sentence about what your tools are for sit above
   the fold. On the current site, the first thing you see is a grid of
   untitled thumbnails.
2. **Descriptions on every card.** Each project shows its photo, name, a
   one- or two-sentence description, collaborators and year, all without
   hovering. The current grid shows titles only on hover, which doesn't
   work on phones.
3. **Filters by theme.** Chips for Music, Making, Coding and Art group 16
   projects plus Earlier Work. Scratch Lab and Makey Makey, your current
   and best-known work, are shown larger. The order otherwise follows your
   current home page.
4. **One page, four sections.** Work, Talks & workshops, About and Writing
   sit on one scrollable page with anchor navigation, instead of three
   separate pages.
5. **Readable publications.** All 20 publications are shown with year,
   title and venue on separate lines, plus their PDF or web links. The six
   most recent show by default, and a button expands the rest.
6. **A little musical tinkering.** The letters of your name play
   pentatonic notes when you click, tap or hover over them. It stays silent
   until the visitor touches it, and respects reduced-motion settings.
7. **Fast and accessible.** It's one HTML file with no framework, plus 1MB
   of resized images. It has automatic dark mode, visible keyboard focus
   and semantic landmarks, and the layout reflows down to 320px.

## Images

`images/` holds each project's thumbnail from the home page, center-cropped
square and resized to at most 720px. It also holds the bio photo, the
Earlier Work photo and the talk/workshop video stills (cropped to 16:9 to
remove letterboxing). To swap one, replace the file with the same name.

The Makey Makey thumbnail is only 350px in the original, so it's slightly
upscaled on the large card. A bigger photo would look sharper.

## Not done yet

- Individual project pages. The cards link to the existing pages on
  ericrosenbaum.com.

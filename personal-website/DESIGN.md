# ericrosenbaum.com — one-page version

A static, dependency-free version of [ericrosenbaum.com](https://www.ericrosenbaum.com/)
styled to match the current Squarespace site. It puts Projects, Media,
Earlier Work and Bio on one page, and the project thumbnails link to the
existing project pages on the live site.

## Where it came from

- **Content:** everything is mirrored from the live site (see `scrape/` on this branch):
  - The bio, Earlier Work text and publication citations are copied verbatim, with their links.
  - Each project's description is the first sentence of its page, trimmed.
- **Look:** screenshots, `site.css` and computed styles of the live site are in `scrape/look/`.
  The values below come from there.

## Matching the Squarespace look

| | Squarespace | Here |
|---|---|---|
| Background | `#fcfcfc` | same |
| Body text | proxima-nova 300, 15px/27px, `#575757` | Montserrat 300, same size and colour |
| Headings, nav, captions | futura-pt, uppercase, letter-spaced | Jost, same sizes and spacing |
| Nav | 13px, `#999`, current `#111`, 30px apart | same, with the current section highlighted as you scroll |
| Logo | `ericr-logo.png` at 377px | same image |
| Grid | 3 columns, ~3% gutters, square thumbnails on `#eee` | same; 2 columns on phones |
| Captions | futura-pt 300 14px, `#404040`, centred below | same |
| Links in text | `#111` with a faint underline | same |
| Social icons | row under the header and in the footer | same (redrawn as inline SVG) |

The Squarespace fonts come from Adobe Typekit, which needs your account. Jost and
Montserrat are the closest free Google Fonts. If you have a Typekit kit, add its
`<link>` to the page and it will use futura-pt and proxima-nova, since they're
next in each font stack.

## What's different from the Squarespace site

- **One page:** the nav links jump to sections instead of loading separate pages.
- **Filters:** small uppercase links (All, Music, Making, Coding, Art) above the grid, styled like the nav.
- **Descriptions:** a one-line description under each thumbnail caption, in light grey. It's hidden on phones.
- **Phone nav:** the nav is shown inline, instead of behind a MENU button.
- **Speed:** no Squarespace scripts. The page is one HTML file plus about 1.4MB of resized images.

## Images

`images/` holds each project's thumbnail from the home page (square, at most 720px),
the logo, both bio photos, the talk and workshop video stills (cropped to 16:9) and
the Earlier Work images. To swap one, replace the file with the same name.

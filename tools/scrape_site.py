"""Turn a wget mirror of ericrosenbaum.com into structured content.

Reads every HTML page under the mirror directory, writes scrape/pages.json
(url, title, description, headings, text paragraphs, links, images) and
downloads each page's images at full width into scrape/images/.

Squarespace lazy-loads images, so the real URLs live in data-src /
data-image / srcset attributes rather than src; this picks all of them up.
Standard library only.
"""
import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser

MIRROR, OUT = sys.argv[1], sys.argv[2]
SITE = 'https://www.ericrosenbaum.com'
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'
IMG_HOSTS = ('images.squarespace-cdn.com', 'static1.squarespace.com')
SKIP_TAGS = {'script', 'style', 'noscript', 'svg', 'template'}
BLOCK_TAGS = {'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'figcaption', 'pre'}


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ''
        self.meta = {}
        self.blocks = []      # [{tag, text}]
        self.links = []       # [{href, text}]
        self.images = []      # [{src, alt}]
        self._skip = 0
        self._in_title = False
        self._block = None
        self._buf = []
        self._link = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in SKIP_TAGS:
            self._skip += 1
            return
        if self._skip:
            return
        if tag == 'title':
            self._in_title = True
        elif tag == 'meta':
            k = a.get('property') or a.get('name')
            if k and a.get('content'):
                self.meta[k] = a['content']
        elif tag in BLOCK_TAGS:
            self._flush()
            self._block = tag
        elif tag == 'br':
            self._buf.append('\n')
        elif tag == 'a' and a.get('href'):
            self._link = {'href': a['href'], 'text': ''}
        elif tag == 'img':
            src = a.get('data-src') or a.get('data-image') or a.get('src') or ''
            if not src and a.get('srcset'):
                src = a['srcset'].split(',')[-1].strip().split(' ')[0]
            if src and not src.startswith('data:'):
                self.images.append({'src': src, 'alt': a.get('alt', '')})

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS:
            self._skip = max(0, self._skip - 1)
            return
        if self._skip:
            return
        if tag == 'title':
            self._in_title = False
        elif tag in BLOCK_TAGS and self._block == tag:
            self._flush()
        elif tag == 'a' and self._link:
            self._link['text'] = self._link['text'].strip()
            self.links.append(self._link)
            self._link = None

    def handle_data(self, data):
        if self._skip:
            return
        if self._in_title:
            self.title += data
            return
        if self._link is not None:
            self._link['text'] += data
        if self._block:
            self._buf.append(data)

    def _flush(self):
        text = re.sub(r'[ \t\r\f\v]+', ' ', ''.join(self._buf))
        text = re.sub(r' *\n *', '\n', text).strip()
        if self._block and text:
            self.blocks.append({'tag': self._block, 'text': text})
        self._block = None
        self._buf = []


def page_url(path):
    rel = os.path.relpath(path, MIRROR).replace(os.sep, '/')
    rel = re.sub(r'^(www\.)?ericrosenbaum\.com/?', '', rel)
    rel = re.sub(r'(^|/)index\.html$', r'\1', rel)
    rel = re.sub(r'\.html$', '', rel)
    return SITE + '/' + rel


def full_size(src, base):
    u = urllib.parse.urljoin(base, src)
    p = urllib.parse.urlsplit(u)
    if p.hostname not in IMG_HOSTS:
        return None
    return urllib.parse.urlunsplit((p.scheme or 'https', p.netloc, p.path, 'format=2500w', ''))


def download(url, dest_dir):
    name = urllib.parse.unquote(os.path.basename(urllib.parse.urlsplit(url).path)) or 'image'
    name = re.sub(r'[^A-Za-z0-9._+-]', '-', name)
    name = hashlib.sha1(url.encode()).hexdigest()[:8] + '-' + name
    dest = os.path.join(dest_dir, name)
    if os.path.exists(dest):
        return name
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r, open(dest, 'wb') as f:
                f.write(r.read())
            return name
        except Exception as e:  # noqa: BLE001 - log and keep going
            err = e
            time.sleep(2 * (attempt + 1))
    print(f'  image failed: {url} ({err})', file=sys.stderr)
    return None


def main():
    img_dir = os.path.join(OUT, 'images')
    os.makedirs(img_dir, exist_ok=True)
    pages = []
    for root, _, files in os.walk(MIRROR):
        for fn in sorted(files):
            if not fn.endswith('.html'):
                continue
            path = os.path.join(root, fn)
            with open(path, encoding='utf-8', errors='replace') as f:
                html = f.read()
            p = Page()
            p.feed(html)
            p._flush()
            url = page_url(path)
            images, seen = [], set()
            for im in p.images:
                big = full_size(im['src'], url)
                if not big or big in seen:
                    continue
                seen.add(big)
                images.append({'url': big, 'alt': im['alt'], 'file': download(big, img_dir)})
            # Squarespace also puts gallery/background images in data-image attributes on divs.
            for m in re.finditer(r'data-(?:image|src)="([^"]+)"', html):
                big = full_size(m.group(1), url)
                if big and big not in seen:
                    seen.add(big)
                    images.append({'url': big, 'alt': '', 'file': download(big, img_dir)})
            pages.append({
                'url': url,
                'title': p.title.strip(),
                'description': p.meta.get('description') or p.meta.get('og:description', ''),
                'og_image': p.meta.get('og:image', ''),
                'blocks': p.blocks,
                'links': [l for l in p.links if l['href'] and not l['href'].startswith('#')],
                'images': images,
            })
            print(f'{url}: {len(p.blocks)} blocks, {len(images)} images')
    pages.sort(key=lambda x: x['url'])
    with open(os.path.join(OUT, 'pages.json'), 'w') as f:
        json.dump(pages, f, indent=2, ensure_ascii=False)
    print(f'{len(pages)} pages')


if __name__ == '__main__':
    main()

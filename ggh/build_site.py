"""
Builds ggh/site/: a full static copy of ggholding.ru (every page from the
sitemap and every news post, saved in ggh/source/) with the Global Group
Development card added at the end of the "Группа компаний GGH" slider.

    python3 ggh/build_site.py                      # card links to ../../dist/
    python3 ggh/build_site.py https://ваш-домен.ru/ # card links to the live site

Links between pages are rewritten to relative paths, so the copy works from
any folder (Live Server, a subfolder) and at the root of any static hosting.
Images, scripts and fonts keep loading from the Tilda CDN, as on the live site.
"""
import json
import re
import shutil
import sys
from pathlib import Path
from posixpath import dirname, relpath

ORIGIN = 'https://ggholding.ru'
HOST = re.compile(r'^(?:https?:)?//(?:www\.)?ggholding\.ru', re.I)
ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'source'
OUT = ROOT / 'site'

SITE_URL = sys.argv[1] if len(sys.argv) > 1 else '../../dist/index.html'
CARD_IMAGE = 'img/ggd-card.png'
CARD_TITLE = 'ООО «Глобал Групп Девелопмент»'
CARD_COUNTRY = 'Российская Федерация'
GROUP_BLOCK = 'rec2058613391'  # the "Группа компаний GGH" slider (Tilda T1196)


def file_of(path):
    """URL path -> file inside the copy ('/flc' -> 'flc/index.html')."""
    path = path.strip('/')
    if not path:
        return 'index.html'
    if path.endswith('.html'):
        return path
    return f'{path}/index.html'


# source/ holds the pages saved from the live site, one file per URL path:
# '/' -> _root.html, '/flc/form' -> flc__form.html
pages = {}
for f in sorted(SRC.glob('*.html')):
    name = f.name[: -len('.html')]
    key = '/' if name == '_root' else '/' + name.replace('__', '/')
    pages[key] = f.read_text(encoding='utf-8')


# ------------------------------------------------------------------ card
def element_end(html, start, tag='div'):
    depth = 0
    for m in re.finditer(rf'<{tag}\b|</{tag}>', html[start:]):
        depth += -1 if m.group(0).startswith('</') else 1
        if depth == 0:
            return start + m.end()
    raise ValueError('unbalanced markup')


def add_card(src, image, link):
    b0 = src.index(f'<div id="{GROUP_BLOCK}"')
    b1 = element_end(src, b0)
    block = src[b0:b1]
    items = [m.start() for m in re.finditer(r'<div class="t1196__item\b', block)]
    total = len(items)
    # copy the markup of the last card that has a "Подробнее" link
    template = next(
        block[s:element_end(block, s)] for s in reversed(items)
        if re.search(r'<a\s+class="t-btntext', block[s:element_end(block, s)])
    )
    card = template
    card = re.sub(r'content="https://static\.tildacdn\.com/[^"]+"', f'content="{image}"', card)
    card = re.sub(r'data-original="[^"]+"', f'data-original="{image}"', card)
    card = re.sub(r"background-image:url\('[^']+'\)", f"background-image:url('{image}')", card)
    card = re.sub(r'(data-customstyle="yes">)(?:<span[^>]*>)?[^<]+(?:</span>)?(</div>)',
                  rf'\g<1>{CARD_TITLE}\g<2>', card, count=1)
    card = re.sub(r'(field="li_descr__\d+"[^>]*>)\s*(?:<span[^>]*>)?[^<]+(?:</span>)?\s*(</div>)',
                  rf'\g<1>\n{CARD_COUNTRY}\n\g<2>', card, count=1)
    card = re.sub(r'(li_(?:title|descr)__|data-lid=")\d+', r'\g<1>1900000000001', card)
    card = re.sub(r'href="[^"]*"(\s+data-lid)', rf'href="{link}"\1', card)
    card = re.sub(r'aria-label="\d+ из \d+"', f'aria-label="{total + 1} из {total + 1}"', card)
    card = card.replace('aria-current="true"', 'aria-current="false"')
    # the whole card is a link, not only "Подробнее"
    card = re.sub(r'<div\s+class="t1196__imgwrapper"',
                  f'<a href="{link}" aria-label="{CARD_TITLE}" '
                  'style="position:absolute;inset:0;z-index:5;"></a> \\g<0>', card, count=1)
    end = element_end(block, items[-1])
    block = block[:end] + ' ' + card + block[end:]
    block = re.sub(r'aria-label="(\d+) из \d+"', rf'aria-label="\1 из {total + 1}"', block)
    return src[:b0] + block + src[b1:]


# ------------------------------------------------------------------ news
# Tilda serves news feeds only to pages opened on ggholding.ru itself, so the
# feed blocks are replaced with static lists built from the saved posts.
FEEDS = json.loads((SRC / 'feeds.json').read_text(encoding='utf-8'))

FEED_CSS = '''<style>
.ggd-feed{display:grid;gap:24px;max-width:1160px;margin:0 auto;padding:0 20px;box-sizing:border-box}
.ggd-feed *{box-sizing:border-box}
.ggd-feed__post{display:grid;grid-template-columns:minmax(0,360px) minmax(0,1fr);gap:32px;align-items:start;padding-bottom:24px;border-bottom:1px solid rgba(0,0,0,.1);color:inherit;text-decoration:none}
.ggd-feed__post_noimg{grid-template-columns:minmax(0,1fr)}
.ggd-feed__img{aspect-ratio:4/3;background:#eee center/cover no-repeat}
.ggd-feed__body{display:grid;gap:10px}
.ggd-feed__date{color:#8a8a8a}
.ggd-feed__title{color:#000;transition:color .2s}
.ggd-feed__post:hover .ggd-feed__title{color:#97915e}
.ggd-feed__descr{color:#555}
.ggd-feed_cards{display:flex;gap:20px;max-width:none;padding:0 max(20px,calc((100% - 1160px)/2)) 12px;overflow-x:auto;scroll-snap-type:x mandatory}
.ggd-feed_cards .ggd-feed__post{flex:0 0 280px;grid-template-columns:1fr;gap:12px;padding:24px;border:0;background:#fff;scroll-snap-align:start}
.ggd-feed_cards .ggd-feed__body{align-content:start}
.ggd-feed_cards .ggd-feed__title,.ggd-feed_cards .ggd-feed__descr{display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}
.ggd-feed_cards .ggd-feed__title{-webkit-line-clamp:4}
.ggd-feed_cards .ggd-feed__descr{-webkit-line-clamp:5}
@media (max-width:760px){.ggd-feed__post{grid-template-columns:1fr;gap:16px}}
</style>'''


def meta(html, prop):
    m = re.search(rf'<meta (?:property|name|itemprop)="{prop}" content="([^"]*)"', html)
    return m.group(1).strip() if m else ''


def post_info(key):
    html = pages[key]
    title = meta(html, 'og:title') or key
    date = meta(html, 'datePublished')[:10]
    text = re.search(r'class="js-feed-post-text[^"]*"[^>]*>(.*?)</div>\s*</div>', html, re.S)
    text = re.sub(r'<[^>]+>', ' ', text.group(1)) if text else ''
    text = re.sub(r'\s+', ' ', text).strip()
    if len(text) > 220:
        text = text[:220].rsplit(' ', 1)[0] + '…'
    return {'key': key, 'title': title, 'date': date, 'image': meta(html, 'og:image'), 'text': text}


def static_feed(html, here):
    for rec, uid in re.findall(r"options=\{recid:'(\d+)',feeduid:'(\d+)'", html):
        start = html.find(f'data-feed-recid="{rec}"')
        if start < 0:
            continue
        start = html.rfind('<div', 0, start)
        end = element_end(html, start)
        posts = sorted((post_info(k) for k in FEEDS.get(uid, []) if k in pages), key=lambda p: p['date'], reverse=True)
        cards = 'data-feed-grid-type="slider"' in html[start:html.find('>', start)]
        show_image = re.search(rf"recid:'{rec}'.*?showImage:(\w+)", html, re.S).group(1) == 'true'
        items = []
        for p in posts:
            href = relpath(file_of(p['key']), dirname(here) or '.')
            date = '.'.join(reversed(p['date'].split('-'))) if p['date'] else ''
            img = f'<div class="ggd-feed__img" style="background-image:url(\'{p["image"]}\')"></div>' if p['image'] and show_image else ''
            items.append(
                f'<a class="ggd-feed__post{"" if img else " ggd-feed__post_noimg"}" href="{href}">{img}'
                f'<div class="ggd-feed__body"><span class="ggd-feed__date t-uptitle t-uptitle_xs">{date}</span>'
                f'<span class="ggd-feed__title t-name t-name_md">{p["title"]}</span>'
                + (f'<span class="ggd-feed__descr t-descr t-descr_xxs">{p["text"]}</span>' if p['text'] else '')
                + '</div></a>'
            )
        html = html[:start] + f'<div class="ggd-feed{" ggd-feed_cards" if cards else ""}">' + ''.join(items) + '</div>' + html[end:]
        html = html.replace(f"t_feed_init('{rec}',options)", 'void 0')
        if FEED_CSS not in html:
            html = html.replace('</head>', FEED_CSS + '</head>', 1)
    return html


# ------------------------------------------------------------------ links
def localize(html, here):
    """Point links to pages of the copy at their files; the rest to the live site."""
    base = dirname(here) or '.'

    def fix(m):
        attr, url = m.group(1), m.group(2)
        if not (url.startswith('/') and not url.startswith('//')) and not HOST.match(url):
            return m.group(0)
        path = HOST.sub('', url) or '/'
        tail = re.search(r'[?#].*$', path)
        tail = tail.group(0) if tail else ''
        key = path[: len(path) - len(tail)].rstrip('/') or '/'
        if attr == 'href' and key in pages:
            target = relpath(file_of(key), base)
            return f'{attr}="{target}{tail}"'
        return f'{attr}="{ORIGIN}{path}"'

    # canonical addresses must stay absolute
    kept = []
    html = re.sub(r'<link\b[^>]*rel="(?:canonical|alternate)"[^>]*>', lambda m: kept.append(m.group(0)) or f'\0{len(kept) - 1}\0', html)
    html = re.sub(r'\b(href|src)="([^"]*)"', fix, html)
    return re.sub(r'\0(\d+)\0', lambda m: kept[int(m.group(1))], html)


# ------------------------------------------------------------------ write
if OUT.exists():
    shutil.rmtree(OUT)
(OUT / 'img').mkdir(parents=True)
shutil.copy(ROOT / 'ggd-card.png', OUT / CARD_IMAGE)

for key, html in pages.items():
    here = file_of(key)
    if key == '/':
        html = add_card(html, CARD_IMAGE, SITE_URL)
    html = static_feed(html, here)
    html = localize(html, here)
    # keep visits to the copy out of the holding's Tilda statistics
    html = re.sub(r'<script\b[^>]*>(?:(?!</script>).)*?tilda-stat(?:(?!</script>).)*</script>', '', html, flags=re.S)
    dest = OUT / here
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(html, encoding='utf-8')

print(f'{len(pages)} pages -> {OUT}')

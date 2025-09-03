#!/usr/bin/env python3
import os, datetime, re, html
from urllib.request import urlopen, Request
import xml.etree.ElementTree as ET

FEEDS = [
  "https://www.marketwatch.com/feeds/topstories",
  "https://finance.yahoo.com/news/rssindex",
  "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
]

def fetch(url):
  req = Request(url, headers={"User-Agent":"Mozilla/5.0"})
  with urlopen(req, timeout=30) as r:
    return r.read()

def parse_rss(xml_bytes):
  out = []
  try:
    root = ET.fromstring(xml_bytes)
    for item in root.iterfind(".//item"):
      title = (item.findtext("title") or "").strip()
      link = (item.findtext("link") or "").strip()
      pub = (item.findtext("pubDate") or "").strip()
      desc = (item.findtext("description") or "").strip()
      out.append({"title":title, "link":link, "pub":pub, "desc":desc})
  except Exception as e:
    pass
  return out

def today_iso():
  return datetime.date.today().isoformat()

def summarize(titles):
  # very simple: choose first 2-3 representative titles
  return "; ".join(titles[:3])

def main():
  base = os.path.dirname(os.path.abspath(__file__))
  data_dir = os.path.abspath(os.path.join(base, "..", "data", "research"))
  os.makedirs(data_dir, exist_ok=True)
  items = []
  for url in FEEDS:
    try:
      xml = fetch(url)
      items.extend(parse_rss(xml))
    except Exception:
      continue
  # keep top 20 for today
  titles = [x["title"] for x in items][:20]
  tldr = summarize(titles)
  day = today_iso()
  html_out = f\"\"\"<div class='kicker'>Daily research note</div>
<h2>{day}</h2>
<div class='rule'></div>
<p><strong>TL;DR:</strong> {html.escape(tldr)}</p>
<ul>
{''.join(f\"<li><a href='{html.escape(x['link'])}' target='_blank' rel='noopener'>{html.escape(x['title'])}</a></li>\" for x in items[:15])}
</ul>
\"\"\"
  path = os.path.join(data_dir, f"{day}.html")
  with open(path, "w") as f:
    f.write(html_out)
  # prune > 120 days
  cutoff = datetime.date.today() - datetime.timedelta(days=120)
  for name in os.listdir(data_dir):
    if name.endswith('.html'):
      try:
        d = datetime.date.fromisoformat(name[:-5])
        if d < cutoff:
          os.remove(os.path.join(data_dir, name))
      except Exception:
        pass

if __name__ == "__main__":
  main()

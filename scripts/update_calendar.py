#!/usr/bin/env python3
import os, json, datetime, time
from urllib.request import urlopen, Request
import xml.etree.ElementTree as ET

FEEDS = [
  "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
  "https://www.marketwatch.com/feeds/topstories",
  "https://finance.yahoo.com/news/rssindex",
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

def normalize_date(rss_date):
  try:
    # Example: Sat, 30 Aug 2025 04:15:00 GMT
    return datetime.datetime.strptime(rss_date[:25], "%a, %d %b %Y %H:%M:%S").date().isoformat()
  except Exception:
    return datetime.date.today().isoformat()

def main():
  base = os.path.dirname(os.path.abspath(__file__))
  data_dir = os.path.abspath(os.path.join(base, "..", "data", "calendar"))
  os.makedirs(data_dir, exist_ok=True)
  items = []
  for url in FEEDS:
    try:
      xml = fetch(url)
      items.extend(parse_rss(xml))
    except Exception:
      continue
  # Group by date and persist
  by_day = {}
  for it in items:
    day = normalize_date(it.get("pub",""))
    by_day.setdefault(day, [])
    # de-dupe by link
    if not any(x.get("link")==it.get("link") for x in by_day[day]):
      by_day[day].append({"title":it.get("title",""),"link":it.get("link","")})
  # write each day file
  for day, arr in by_day.items():
    path = os.path.join(data_dir, f"{day}.json")
    existing = []
    if os.path.exists(path):
      try:
        existing = json.load(open(path))
      except Exception:
        existing = []
    # merge & de-dupe
    links = set(x.get("link") for x in existing)
    for x in arr:
      if x["link"] not in links:
        existing.append(x)
    with open(path, "w") as f:
      json.dump(existing, f, indent=2)
  # prune files older than 92 days
  cutoff = datetime.date.today() - datetime.timedelta(days=92)
  for name in os.listdir(data_dir):
    if name.endswith(".json"):
      day = name[:-5]
      try:
        d = datetime.date.fromisoformat(day)
        if d < cutoff:
          os.remove(os.path.join(data_dir,name))
      except Exception:
        pass

if __name__ == "__main__":
  main()

"""Rebuild the JMA seismic-area / GSI municipality reference from primary sources.

Run with the backend virtualenv Python on Windows or macOS. Unknown/ambiguous
names are omitted rather than assigned a guessed region. Review the diff before
committing; the official table's publication date can differ from retrieval date.
"""

from datetime import date
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import httpx

SOURCES = [
    "https://www.data.jma.go.jp/eqev/data/joho/shindo-name.html",
    "https://maps.gsi.go.jp/js/muni.js",
]


class AreaTable(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = []
        self.cell = False
        self.parts = []
        self.span = 1

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        if tag == "td":
            self.cell = True
            self.parts = []
            self.span = int(dict(attrs).get("rowspan", 1))

    def handle_data(self, data):
        if self.cell:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == "td":
            self.row.append(("".join(self.parts).strip(), self.span))
            self.cell = False
        if tag == "tr" and self.row:
            self.rows.append(self.row)


def build(table, municipality_js):
    parser = AreaTable()
    parser.feed(table)
    pending, regions = {}, []
    for row in parser.rows:
        full, index = [], 0
        for column in range(4):
            if column in pending:
                value, remaining = pending[column]
                full.append(value)
                if remaining == 1:
                    del pending[column]
                else:
                    pending[column] = (value, remaining - 1)
            elif index < len(row):
                value, remaining = row[index]
                index += 1
                full.append(value)
                if remaining > 1:
                    pending[column] = (value, remaining - 1)
        if len(full) == 4:
            regions.append(full)
    municipalities, areas = {}, {}
    pattern = r'GSI.MUNI_ARRAY\["(\d+)"\] = \'([^\']+)\';'
    for code, content in re.findall(pattern, municipality_js):
        _, pref, _, city = content.split(",")
        name = city.replace("市\u3000", "").replace("\u3000", "")
        variants = {city, name, pref[:-1] + name}
        matches = [
            (region, names.split("、"))
            for pf, _, region, names in regions
            if pf == pref and any(v in names.split("、") for v in variants)
        ]
        if len(matches) == 1:
            region, names = matches[0]
            municipalities[code.zfill(5)] = {
                "prefecture": pref,
                "municipality": city,
                "area": region,
            }
            areas[region] = names
    if len(municipalities) < 1700 or len(areas) < 170:
        raise ValueError("Official format changed; refusing to replace the reference")
    return {
        "sources": SOURCES,
        "retrievedAt": date.today().isoformat(),
        "municipalities": municipalities,
        "areas": areas,
    }


def main():
    with httpx.Client(timeout=15, follow_redirects=True) as client:
        responses = [client.get(url) for url in SOURCES]
        for response in responses:
            response.raise_for_status()
    data = build(*[response.text for response in responses])
    target = Path(__file__).resolve().parents[1] / "data/reference/seismic-areas.json"
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {len(data['municipalities'])} municipalities from JMA/GSI")


if __name__ == "__main__":
    main()

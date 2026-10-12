#!/usr/bin/env python3
"""Bygger apps-script/Code.gs: skabelonen + udtrækskoden fra index.html, så de to altid er ens."""
from pathlib import Path

root = Path(__file__).resolve().parent.parent
html = (root / 'index.html').read_text(encoding='utf-8')
start = html.index('const CARRIERS')
end = html.index('/* ---------- Visning')
parser = html[start:end].rstrip() + '\n'
template = (root / 'apps-script' / 'template.gs').read_text(encoding='utf-8')
assert '//@@PARSER@@' in template
(root / 'apps-script' / 'Code.gs').write_text(template.replace('//@@PARSER@@', parser), encoding='utf-8')
print('apps-script/Code.gs bygget')

#!/usr/bin/env python3
"""
Chinread Editor Builder
========================
Merges CSS + JS + HTML into a single fully-offline Editor.html.

Usage:
    python3 build_editor.py           # build
    python3 build_editor.py --verify  # build + open in default browser

What it does:
  1. Reads editor.html as the skeleton.
  2. Inlines all CSS, rewriting @font-face paths to fonts/ sibling folder.
  3. Inlines js/editor.js.
  4. Copies fonts/ → android/fonts/ next to the HTML.
  5. Writes android/Editor.html — 100% offline, open with one click.
"""

import os, re, shutil, sys, textwrap

BASE     = os.path.dirname(os.path.abspath(__file__))
OUT_DIR  = os.path.join(BASE, 'android')
OUT_FILE = os.path.join(OUT_DIR, 'Editor.html')

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def read(path: str) -> str:
    with open(path, encoding='utf-8') as f:
        return f.read()

# ─────────────────────────────────────────────────────────────────────────────
# CSS
# ─────────────────────────────────────────────────────────────────────────────

FONT_FILES = ['dian.ttf', 'OPPOSans.ttf', 'Tsanger.ttf', 'Taipei.ttf', 'zixiao.ttf']

CSS_FILES = ['css/base.css', 'css/editor.css']


def copy_fonts(out_fonts_dir: str) -> int:
    """Copy project fonts/ → android/fonts/."""
    src_dir = os.path.join(BASE, 'fonts')
    os.makedirs(out_fonts_dir, exist_ok=True)
    copied = 0
    for filename in FONT_FILES:
        src = os.path.join(src_dir, filename)
        dst = os.path.join(out_fonts_dir, filename)
        if os.path.exists(src):
            shutil.copy2(src, dst)
            print(f'   🔤 Copied: {filename}')
            copied += 1
        else:
            print(f'   ⚠️  Font not found, skipping: {src}')
    return copied


def build_css() -> str:
    parts = []
    for f in CSS_FILES:
        content = read(os.path.join(BASE, f))
        # Rewrite @font-face paths: ../fonts/X.ttf → fonts/X.ttf
        # (HTML is in android/, fonts are in android/fonts/)
        content = re.sub(
            r'(src:\s*url\(["\']?)(?:\.\./)?(fonts/[^\'")\s]+)(["\']?\))',
            r'\1\2\3',
            content,
        )
        # Strip @import lines
        content = re.sub(r'@import\s+(?:url\()?[\'"][^\'"]*[\'"][\)]?.*?;[ \t]*', '', content)
        content = content.strip()
        if content:
            parts.append(f'/* ── {f} ── */\n{content}')
    return '\n\n'.join(parts)


# ─────────────────────────────────────────────────────────────────────────────
# JS
# ─────────────────────────────────────────────────────────────────────────────

JS_FILES = [
    'js/editor.js',
]

def build_js() -> str:
    parts = []
    for f in JS_FILES:
        content = read(os.path.join(BASE, f))
        content = content.strip()
        parts.append(f'/* ── {f} ── */\n{content}')
    return '\n\n'.join(parts)


# ─────────────────────────────────────────────────────────────────────────────
# HTML assembly
# ─────────────────────────────────────────────────────────────────────────────

def build_html(css: str, js: str) -> str:
    html = read(os.path.join(BASE, 'editor.html'))

    # Remove <link> tags for local CSS files
    html = re.sub(r'<link[^>]+href=["|\'][^"\']*\.css["|\'][^>]*>\s*', '', html)

    # Remove <script src="js/editor.js"> entry tag
    html = re.sub(
        r'<script[^>]+src=["|\'][^"\']*editor\.js["|\'][^>]*>.*?</script>',
        '',
        html,
        flags=re.DOTALL,
    )

    # Inject into <head>
    html = html.replace('</head>', f'<style>\n{css}\n</style>\n</head>')

    # Inject inlined JS before </body>
    html = html.replace('</body>', f'<script>\n{js}\n</script>\n</body>')

    return html


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    verify = '--verify' in sys.argv

    print('🔨 Building Editor.html (fully offline) …\n')

    css = build_css()
    print(f'   CSS: {len(css):,} chars from {len(CSS_FILES)} files')

    js = build_js()
    print(f'   JS:  {len(js):,} chars from {len(JS_FILES)} files')

    html = build_html(css, js)

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        f.write(html)

    print('\n   Copying fonts …')
    out_fonts_dir = os.path.join(OUT_DIR, 'fonts')
    n_fonts = copy_fonts(out_fonts_dir)

    size_kb = os.path.getsize(OUT_FILE) / 1024
    print(f'\n✅  {OUT_FILE}')
    print(f'    HTML size:  {size_kb:.1f} KB  (fully self-contained)')
    print(f'    Fonts:      {n_fonts} files → android/fonts/')
    print()
    print(textwrap.dedent("""\
        📱 How to deploy (Android or any device):
           Copy the entire  android/  folder:
             android/
             ├── Editor.html   ← open this in Chrome
             └── fonts/*.ttf

           100% offline — no internet required at runtime.

        💡 Dev workflow:
           • Edit source:  editor.html  +  css/  +  js/
           • Rebuild:      python3 build_editor.py
           • Desktop dev:  python3 -m http.server 8080
                           → http://localhost:8080/editor.html
        """))

    if verify:
        import webbrowser
        webbrowser.open(f'file://{OUT_FILE}')
        print('🌐 Opened in browser for verification.')


if __name__ == '__main__':
    main()

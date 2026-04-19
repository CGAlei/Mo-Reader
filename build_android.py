#!/usr/bin/env python3
"""
Chinread Android Builder
========================
Merges CSS + JS + HTML into a single fully-offline Chinread-Mobile.html.

Usage:
    python3 build_android.py           # build
    python3 build_android.py --verify  # build + open in default browser

What it does:
  1. Reads reader.html as the skeleton.
  2. Inlines all CSS, rewriting @font-face paths to fonts/ sibling folder.
  3. Inlines all JS modules IN DEPENDENCY ORDER, stripping all import/export syntax.
  4. Inlines pinyin-pro from libs/pinyin-pro.js  (no CDN needed).
  5. Injects a Web Animations API shim for animate() + spring()  (no CDN needed).
  6. Copies fonts/ → android/fonts/ next to the HTML.
  7. Writes android/Chinread-Mobile.html — 100% offline, open with one click.

Project layout:
    Chinread/
    ├── reader.html
    ├── css/base.css  +  components.css
    ├── js/dict.js  audio.js  ui.js  library.js  app.js
    ├── fonts/           ← canonical TTF files (dev + build)
    ├── libs/
    │   └── pinyin-pro.js   ← run once: curl -sL https://cdn.jsdelivr.net/npm/pinyin-pro@3.16.4/dist/index.js -o libs/pinyin-pro.js
    └── android/         ← OUTPUT (copy this whole folder to Android)
        ├── Chinread-Mobile.html
        └── fonts/*.ttf

100% offline after build — no internet required at runtime.
"""

import os, re, shutil, sys, textwrap

BASE     = os.path.dirname(os.path.abspath(__file__))
OUT_DIR  = os.path.join(BASE, 'android')
OUT_FILE = os.path.join(OUT_DIR, 'Chinread-Mobile.html')

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def read(path: str) -> str:
    with open(path, encoding='utf-8') as f:
        return f.read()


def strip_module_syntax(js: str) -> str:
    """
    Remove ES-module import/export syntax so code runs in a plain <script> tag.

    Handles:
      import ... from '...'          (static — local AND CDN ESM URLs)
      export default function/class  → keeps declaration, drops 'export default'
      export { a, b as c }          → removed entirely
      export { a } from '...'       → removed entirely (re-export)
      export const/let/var/function/class → keeps declaration, drops 'export'
    """
    # 1. Remove all static import lines (local and CDN)
    js = re.sub(
        r'^[ \t]*import\s+(?!.*\().*?[\'"][^\'"]+[\'"].*?;[ \t]*$',
        '',
        js,
        flags=re.MULTILINE,
    )
    # 2. Remove  export { ... } from '...';
    js = re.sub(
        r'^[ \t]*export\s*\{[^}]*\}\s*from\s*[\'"][^\'"]*[\'"].*?;[ \t]*$',
        '',
        js,
        flags=re.MULTILINE,
    )
    # 3. Remove  export { ... };
    js = re.sub(
        r'^[ \t]*export\s*\{[^}]*\}\s*;[ \t]*$',
        '',
        js,
        flags=re.MULTILINE,
    )
    # 4. Drop 'export default', keep the declaration
    js = re.sub(r'\bexport\s+default\s+', '', js)
    # 5. Drop 'export' prefix from declarations
    js = re.sub(r'\bexport\s+(async\s+)?(?=function|class|const|let|var)', r'\1', js)
    return js


# ─────────────────────────────────────────────────────────────────────────────
# CSS
# ─────────────────────────────────────────────────────────────────────────────

FONT_FILES = ['dian.ttf', 'OPPOSans.ttf', 'Tsanger.ttf', 'Taipei.ttf', 'zixiao.ttf']

CSS_FILES = ['css/base.css', 'css/components.css']


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
# JS — dependency order
# ─────────────────────────────────────────────────────────────────────────────

JS_FILES = [
    'js/dict.js',
    'js/audio.js',
    'js/ui.js',
    'js/library.js',
    'js/app.js',     # orchestrator — must be last
]


def build_js() -> str:
    parts = []
    for f in JS_FILES:
        content = read(os.path.join(BASE, f))
        content = strip_module_syntax(content)
        content = content.strip()
        parts.append(f'/* ── {f} ── */\n{content}')
    return '\n\n'.join(parts)


# ─────────────────────────────────────────────────────────────────────────────
# Offline shims
# ─────────────────────────────────────────────────────────────────────────────

def build_pinyin_script() -> str:
    """Inline pinyin-pro from the local libs/ copy."""
    path = os.path.join(BASE, 'libs', 'pinyin-pro.js')
    if not os.path.exists(path):
        print('   ⚠️  libs/pinyin-pro.js not found!')
        print('       Run: curl -sL https://cdn.jsdelivr.net/npm/pinyin-pro@3.16.4/dist/index.js -o libs/pinyin-pro.js')
        sys.exit(1)
    code = read(path)
    kb = len(code) / 1024
    print(f'   📦 Inlined pinyin-pro ({kb:.0f} KB)')
    return f'<script>\n{code}\n</script>'


# Web Animations API shim for Motion's animate() and spring().
# Uses el.animate() which is built into every modern browser and Android Chrome —
# no library needed. Covers all three animation styles used in ui.js.
MOTION_WAAPI_SHIM = """\
<script>
/* ── Motion shim: native Web Animations API replaces motion@10 CDN ── */
function animate(el, keyframes, options) {
    options = options || {};
    var frames = {};
    var transformParts = {};

    // Collect transform-related props separately
    Object.keys(keyframes).forEach(function(prop) {
        if (prop === 'y') {
            transformParts.y = keyframes[prop];
        } else if (prop === 'transform') {
            frames.transform = keyframes[prop];
        } else {
            frames[prop] = keyframes[prop];
        }
    });

    // Merge y into transform if needed
    if (transformParts.y) {
        var yFrames = transformParts.y.map(function(v) {
            return 'translateY(' + v + 'px)';
        });
        if (frames.transform) {
            // Combine existing transform with y translation
            frames.transform = frames.transform.map(function(t, i) {
                return t + ' ' + yFrames[i];
            });
        } else {
            frames.transform = yFrames;
        }
    }

    var duration = (options.duration || 0.3) * 1000;
    var easing   = (typeof options.easing === 'string') ? options.easing : 'ease-out';

    el.animate(frames, { duration: duration, easing: easing, fill: 'none' });
}

function spring() {
    // Approximate spring physics with a snappy cubic-bezier overshoot curve
    return 'cubic-bezier(0.34, 1.56, 0.64, 1)';
}
</script>"""


# ─────────────────────────────────────────────────────────────────────────────
# HTML assembly
# ─────────────────────────────────────────────────────────────────────────────

def build_html(css: str, js: str, pinyin_script: str) -> str:
    html = read(os.path.join(BASE, 'reader.html'))

    # Remove <link> tags for local CSS files
    html = re.sub(r'<link[^>]+href=["|\'][^"\']*\.css["|\'][^>]*>\s*', '', html)

    # Remove the CDN pinyin-pro <script> tag (we inline our own copy)
    html = re.sub(r'<script[^>]+pinyin-pro[^>]*>\s*</script>\s*', '', html)

    # Remove <script type="module"> entry tag (we inline everything)
    html = re.sub(
        r'<script[^>]+type=["|\']module["|\'][^>]*>.*?</script>',
        '',
        html,
        flags=re.DOTALL,
    )

    # Inject into <head> in order:
    #   1. Motion WAAPI shim   (defines animate + spring globals)
    #   2. pinyin-pro inline   (defines window.pinyinPro global)
    #   3. Inlined CSS
    html = html.replace('</head>', f'{MOTION_WAAPI_SHIM}\n</head>')
    html = html.replace('</head>', f'{pinyin_script}\n</head>')
    html = html.replace('</head>', f'<style>\n{css}\n</style>\n</head>')

    # Inject inlined JS before </body>
    html = html.replace('</body>', f'<script>\n{js}\n</script>\n</body>')

    return html


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    verify = '--verify' in sys.argv

    print('🔨 Building Chinread-Mobile.html (fully offline) …\n')

    pinyin_script = build_pinyin_script()

    css = build_css()
    print(f'   CSS: {len(css):,} chars from {len(CSS_FILES)} files')

    js = build_js()
    print(f'   JS:  {len(js):,} chars from {len(JS_FILES)} files')

    html = build_html(css, js, pinyin_script)

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
             ├── Chinread-Mobile.html   ← open this in Chrome
             └── fonts/*.ttf

           100% offline — no internet required at runtime.

        💡 Dev workflow:
           • Edit source:  reader.html  +  css/  +  js/
           • Rebuild:      python3 build_android.py
           • Desktop dev:  python3 -m http.server 8080
                           → http://localhost:8080/reader.html
        """))

    if verify:
        import webbrowser
        webbrowser.open(f'file://{OUT_FILE}')
        print('🌐 Opened in browser for verification.')


if __name__ == '__main__':
    main()

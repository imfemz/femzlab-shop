"""Recopie les presets du plugin MotionLAB dans src/motionlab.html (démo interactive + héros).
Usage (depuis femzlab-shop-front/) : python3 docs/resnapshot-presets.py [chemin/vers/MotionLAB] [src/page.html …]
(par défaut : src/motionlab.html et src/index.html, qui embarquent toutes deux les presets)
Remplace le <script> qui commence par « Presets MotionLAB » : registry.js + presets dans l'ordre
de panel/index.html + window.MLSplit de panel/app.js. Seuls les web() tournent sur la page."""
import re, subprocess, sys
ML = (sys.argv[1] if len(sys.argv) > 1 else '../MotionLAB').rstrip('/') + '/panel/'
PAGES = sys.argv[2:] or ['src/motionlab.html', 'src/index.html']
for page_p in PAGES:
    s = open(page_p, encoding='utf-8').read()
    start = s.index('<script>\n/* ============================================================\n   Presets MotionLAB')
    end = s.index('</script>', start)
    order = re.findall(r'<script src="presets/([a-z-]+\.js)"></script>', open(ML + 'index.html', encoding='utf-8').read())
    assert order and order[0] == 'registry.js', order
    app = open(ML + 'app.js', encoding='utf-8').read()
    i = app.index('  window.MLSplit = function (container, text, cls) {')
    j = app.index('    return spans;\n  };', i) + len('    return spans;\n  };')
    head = subprocess.run(['git', '-C', ML + '..', 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip()
    out = ['<script>\n/* ============================================================\n   Presets MotionLAB — snapshot 1:1 des fichiers du plugin\n'
           f'   (panel/presets/*.js + MLSplit de panel/app.js, commit {head}).\n'
           '   Seul le web() est exécuté ici : la preview de la page EST la\n   preview du panel. Re-snapshotter : docs/resnapshot-presets.py\n'
           '   ============================================================ */\n', app[i:j].replace('\n  ', '\n')[2:] + '\n']
    for f in order:
        out.append('/* ---- %s ---- */\n' % f)
        out.append(open(ML + 'presets/' + f, encoding='utf-8').read().rstrip() + '\n')
    s = s[:start] + ''.join(out) + s[end:]
    open(page_p, 'w', encoding='utf-8').write(s)
    print(page_p, ': presets recopiés :', ', '.join(order[1:]))

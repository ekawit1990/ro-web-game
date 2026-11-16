"""
Imports recorded sounds (e.g. downloaded from ElevenLabs) into src/assets/sounds/, small enough for phones:
  python3 tools/import_sounds.py <folder or .zip> [...]
File names follow tools/sound_catalog.json: "skill.x_wave.mp3" (or a zip holding skill/x_wave.mp3).
Effects: mono, silence trimmed, loudness evened out, cut to a few seconds with a fade, 96 kbps mp3.
Music: stereo 112 kbps mp3, loudness evened out. Needs ffmpeg.
"""
import json, os, re, shutil, subprocess, sys, tempfile, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'src', 'assets', 'sounds')
CAT = {c['key']: c for c in json.load(open(os.path.join(HERE, 'sound_catalog.json')))}
DATA = json.load(open(os.path.join(ROOT, 'src', 'data', 'gamedata.json')))
EXT = ('.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac')
MAX_SEC = {'skill': 5, 'cast': 4, 'boss': 5, 'mon': 4, 'attack': 1.5, 'sfx': 4}


def key_of(path):
    rel = path.replace('\\', '/')
    m = re.search(r'(?:^|/)(skill|cast|attack|mon|sfx|boss|music)/([^/]+)$', rel)
    name = os.path.splitext(os.path.basename(rel))[0].strip().lower()
    if m:
        return f"{m.group(1)}/{os.path.splitext(m.group(2))[0].lower()}"
    if '.' in name:
        a, b = name.split('.', 1)
        return f'{a}/{b}'
    return name


def known(key):
    if key in CAT:
        return True
    folder, _, name = key.partition('/')
    if folder == 'mon':  # a file for one monster: mon/<monster key>_hurt|die
        mk, _, kind = name.rpartition('_')
        return kind in ('hurt', 'die') and mk in DATA['monsters']
    if folder in ('skill', 'cast'):
        return name in DATA['skills'] or name in ('teen', 'singer', 'guitarist', 'drummer', 'bassist', 'keyboardist', 'dj')
    return False


def convert(src, key):
    folder = key.split('/')[0]
    dst = os.path.join(OUT, key + '.mp3')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if folder == 'music':
        af = 'loudnorm=I=-16:TP=-1.5:LRA=11'
        args = ['-ac', '2', '-ar', '44100', '-b:a', '112k']
    else:
        cap = MAX_SEC.get(folder, 4)
        af = ('silenceremove=start_periods=1:start_threshold=-50dB,'
              'areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse,'
              f'atrim=0:{cap},afade=t=out:st={max(0.1, cap - 0.25)}:d=0.25,'
              'loudnorm=I=-14:TP=-1:LRA=7')
        args = ['-ac', '1', '-ar', '44100', '-b:a', '96k']
    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src, '-af', af, *args, '-map_metadata', '-1', dst], check=True)
    return dst


def files_in(arg, tmp):
    if arg.lower().endswith('.zip'):
        d = tempfile.mkdtemp(dir=tmp)
        with zipfile.ZipFile(arg) as z:
            for n in z.namelist():
                if n.lower().endswith(EXT) and not n.startswith('__MACOSX'):
                    p = os.path.normpath(os.path.join(d, n))
                    if not p.startswith(d):
                        continue  # no paths out of the folder
                    os.makedirs(os.path.dirname(p), exist_ok=True)
                    with z.open(n) as f, open(p, 'wb') as o:
                        shutil.copyfileobj(f, o)
                    yield p, n
    elif os.path.isdir(arg):
        for dp, _, fs in os.walk(arg):
            for f in fs:
                if f.lower().endswith(EXT):
                    p = os.path.join(dp, f)
                    yield p, os.path.relpath(p, arg)
    else:
        yield arg, os.path.basename(arg)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    ok, skipped = [], []
    with tempfile.TemporaryDirectory() as tmp:
        for arg in sys.argv[1:]:
            for path, rel in files_in(arg, tmp):
                key = key_of(rel)
                if not known(key):
                    skipped.append(rel)
                    continue
                dst = convert(path, key)
                ok.append((key, os.path.getsize(path), os.path.getsize(dst)))
    for k, a, b in ok:
        print(f'  {k:34s} {a // 1024:6d} KB -> {b // 1024:4d} KB')
    print(f'{len(ok)} imported, {len(skipped)} skipped (unknown name)')
    for s in skipped:
        print('  skipped:', s)
    missing = [k for k in CAT if not os.path.exists(os.path.join(OUT, k + '.mp3'))]
    print(f'{len(CAT) - len(missing)}/{len(CAT)} catalog sounds present')


main()

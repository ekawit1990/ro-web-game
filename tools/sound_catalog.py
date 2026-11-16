"""
The list of every sound the game can take as a recorded file, with a ready-to-paste ElevenLabs prompt for each.
Run `python3 tools/sound_catalog.py` to rewrite src/assets/sounds/README.md and tools/sound_catalog.json.
File name = key with the first "/" written as "." (skill/x_wave -> skill.x_wave.mp3), or the key path itself.
"""
import json, os

FX = ', epic cinematic fantasy RPG game sound effect, heavy and powerful, punchy transient, deep sub-bass impact, crisp high-end detail, no music, no voice, no speech'
SOFT = ', epic cinematic fantasy RPG game sound effect, grand and shimmering, clean, no music, no voice, no speech'
MON = ', fantasy creature game sound effect, close-up, dry, no music, no speech'
UI = ', fantasy RPG game UI sound effect, polished, no voice'
MUS = ' Instrumental only, no vocals, seamless loop, game background music.'

C = []
def add(group, key, label, sec, prompt, kind='sfx'):
    C.append(dict(group=group, key=key, file=key.replace('/', '.', 1) + '.mp3', label=label, seconds=sec, prompt=prompt, kind=kind))

# ---------------------------------------------------------------- skills
G = 'สกิลวัยรุ่น (อาชีพเริ่มต้น)'
add(G, 'skill/quick_slash', 'ฟันฉับไว', 1.5, 'A lightning-fast sword slash, sharp metallic swish cutting the air followed by a heavy blade impact' + FX)
add(G, 'skill/dash_stab', 'พุ่งแทง', 1.5, 'A rapid forward dash with a whoosh, then a brutal piercing sword thrust impact with a metal ring' + FX)
add(G, 'skill/whirl_stab', 'หมุนตัวแทง', 2, 'A spinning blade whirlwind, three fast circular sword swooshes ending in a heavy ground slam' + FX)
add(G, 'skill/pump_up', 'ฮึดสู้', 2, 'A fighter powering up, rising energy surge with a deep heartbeat thump and a bright golden power burst' + SOFT)

G = 'สกิลนักร้อง (โทนทอง)'
add(G, 'skill/dynamics', 'การใส่ไดนามิกและอารมณ์', 2, 'A golden microphone thrown like a missile, fast whoosh then a huge sonic boom impact with shimmering golden sparkles' + FX)
add(G, 'skill/warm_up', 'การวอร์มเสียง', 2.5, 'A warm magical blessing, rising golden choir-like shimmer pad and soft chimes, holy aura forming' + SOFT)
add(G, 'skill/enunciation', 'Enunciation', 2, 'A focused magical buff, crisp crystal ping, rising sparkle sweep and a clean golden aura bloom' + SOFT)
add(G, 'skill/ear_training', 'Ear Training', 2.5, 'A spinning golden microphone hurled at an enemy, explodes into a massive shockwave of sound with ringing feedback and debris' + FX)
add(G, 'skill/high_voice', 'เสียงสูง', 3, 'A colossal beam of pure sound energy fired forward, screaming high-pitched resonance, thunderous sonic shockwaves and shattering glass' + FX)

G = 'สกิลกีตาร์ (โทนแดง)'
add(G, 'skill/hammer_on', 'Hammer-on', 2, 'A distorted heavy metal power chord smashed into the ground like a war hammer, huge earth-shattering boom and rock debris' + FX)
add(G, 'skill/slide', 'Slide', 1.5, 'A blazing dash forward with a screaming electric guitar slide whoosh, ending in a fiery slash impact' + FX)
add(G, 'skill/vibrato', 'Vibrato', 2, 'A fiery power-up aura, wobbling electric energy hum rising in intensity, crackling red flames' + SOFT)
add(G, 'skill/bending', 'Bending', 2.5, 'A storm of fire blades spinning around the warrior, screaming bent guitar note, roaring flames and repeated heavy slashes' + FX)
add(G, 'skill/palm_muting', 'Palm muting', 2.5, 'A massive area attack, chugging palm-muted metal guitar riff turned into ground-shaking explosions, fire bursts erupting' + FX)

G = 'สกิลมือกลอง (โทนม่วง)'
add(G, 'skill/snare_roll', 'รัวสแนร์', 2, 'A furious storm of rapid blade strikes like a machine-gun snare drum roll, violet energy slashes, final heavy crash' + FX)
add(G, 'skill/ghost_exit', 'หนีไปกลับ PR', 1.5, 'A ninja vanishing into shadow, quick dark whoosh, smoke puff and a fading ghostly echo' + SOFT)
add(G, 'skill/double_kick', 'กระเดื่องคู่', 2, 'Two colossal kick drum blasts shaking the earth, magic circle erupting, pillar of violet light with thunderous boom' + FX)
add(G, 'skill/send_off', 'จังหวะส่ง', 1.5, 'A violet comet dashing forward at blinding speed, sharp whoosh then a star-shattering explosion impact' + FX)
add(G, 'skill/x_wave', 'คลื่นเสียงทำลาย', 2.5, 'A giant X-shaped sonic shockwave tearing across the ground, purple magic blast, cracking stone and flying rocks' + FX)

G = 'สกิลเบส (โทนเขียวมรกต)'
add(G, 'skill/root_note', 'โน้ตราก', 1.5, 'A massive two-handed axe chop with a deep bass guitar note, crushing heavy impact and emerald energy crackle' + FX)
add(G, 'skill/kick_drum', 'Kick Drum', 2, 'A protective guardian shield forming, deep bass pulse, solid low thud and a green energy barrier hum' + SOFT)
add(G, 'skill/straight_beat', 'จังหวะ Straight', 2.5, 'An earthquake ground pound, ultra-low bass drop, the ground cracking around in a ring, heavy rumble' + FX)
add(G, 'skill/lift_beat', 'จังหวะยก', 2, 'A reflecting armor buff, deep bass wobble rising, metallic resonance and a green hexagon shield clank' + SOFT)
add(G, 'skill/push_note', 'ลูกส่ง', 2, 'A regeneration buff, warm deep bass swell, soft heartbeat and emerald healing sparkles' + SOFT)

G = 'สกิลคีย์บอร์ด (โทนฟ้า)'
add(G, 'skill/note_blast', 'ตัวโน้ตทำลาย', 3, 'A rain of giant crystal music notes crashing down like meteors, ice-blue magic explosions, glassy shattering, heavy impacts' + FX)
add(G, 'skill/restore', 'ฟื้นฟู', 2, 'A holy healing spell, soft piano arpeggio rising, bright blue sparkles and a warm glow' + SOFT)
add(G, 'skill/tempo_up', 'เร่งจังหวะ', 2, 'A haste spell, fast ascending piano run, wind rush and an energetic blue magic burst' + SOFT)
add(G, 'skill/tempo_control', 'คุมจังหวะ', 2, 'A power blessing, solemn grand piano chord with a deep magical boom and shimmering crystals' + SOFT)
add(G, 'skill/solo', 'โซโล่', 2, 'A lucky star blessing, sparkling piano glissando, twinkling stars and a bright chime' + SOFT)
add(G, 'skill/calm_melody', 'ทำนองผ่อนคลาย', 2.5, 'A calming mana restoration spell, gentle flowing piano, soft water ripple and a blue aura hum' + SOFT)
add(G, 'skill/chorus_ward', 'ประสานเสียง', 2.5, 'A magic shield of sound forming around the party, layered choir-like pad, crystal barrier locking in with a solid clang' + SOFT)
add(G, 'skill/revive', 'ชุบชีวิต', 3, 'A resurrection spell, heavenly rising choir pad, a column of holy light descending, heartbeat returning, bright bloom' + SOFT)

G = 'สกิลดีเจ (สายเวทย์ นีออน)'
add(G, 'skill/dj_edm', 'EDM (สายฟ้า)', 3, 'Neon lightning bolts striking the ground repeatedly, electric crackle, thunderclaps and a massive EDM bass drop' + FX)
add(G, 'skill/dj_cha3', '3 ช่า (อุกกาบาต)', 3, 'Burning meteors falling from the sky, descending whistle then huge explosions, rumbling ground' + FX)
add(G, 'skill/dj_joja', 'โจ๊ะๆ (หนามหิน)', 2.5, 'Giant stone spikes bursting out of the ground in waves, rock cracking, heavy crunching impacts' + FX)
add(G, 'skill/dj_chill', 'เบาๆสบายๆ (พายุหิมะ)', 3, 'A freezing blizzard spell, howling icy wind, ice crystals shattering, deep frost boom' + FX)
add(G, 'skill/dj_parade', 'รถแห่ (กำแพงไฟ)', 2.5, 'A wall of fire erupting from the ground, roaring flames whoosh, crackling embers and a heavy bass thump' + FX)
add(G, 'skill/dj_serenade', 'เปิดเพลงให้สาว (ลูกไฟ)', 2, 'Fire bolts launched at a target, fast fiery whooshes then explosive fireball impacts' + FX)
add(G, 'skill/dj_booth', 'บูทดีเจ', 2.5, 'A magical DJ booth summoned onto the ground, record scratch, deep bass drop and a neon magic circle humming' + FX)

G = 'เสียงร่ายสกิล (ตอนหลอดร่ายสีเขียววิ่ง ใส่แทนเสียง "วีด")'
for cls, name, desc in [('teen', 'วัยรุ่น', 'a young fighter gathering strength'), ('singer', 'นักร้อง', 'golden holy energy gathering'),
                        ('guitarist', 'กีตาร์', 'fiery red energy gathering with crackling flames'), ('drummer', 'มือกลอง', 'violet energy gathering with a rising drum pulse'),
                        ('bassist', 'เบส', 'deep emerald energy gathering with a rumbling bass swell'), ('keyboardist', 'คีย์บอร์ด', 'icy blue crystal magic gathering'),
                        ('dj', 'ดีเจ', 'neon electric magic gathering with a rising synth riser')]:
    add(G, f'cast/{cls}', f'ร่าย {name}', 2, f'A magic spell charging up, {desc}, rising tension building to a peak' + SOFT)

# ---------------------------------------------------------------- normal attacks + combat
G = 'โจมตีปกติ + การต่อสู้'
add(G, 'attack/teen', 'ตีปกติ วัยรุ่น', 0.6, 'A quick sword swing whoosh with a light metal ring' + FX)
add(G, 'attack/singer', 'ตีปกติ นักร้อง', 0.6, 'A microphone thrown fast, short whoosh with a sparkling golden ping' + FX)
add(G, 'attack/guitarist', 'ตีปกติ กีตาร์', 0.7, 'A heavy greatsword swing with a short distorted guitar chord stab' + FX)
add(G, 'attack/drummer', 'ตีปกติ มือกลอง', 0.6, 'Two fast drumstick strikes, sharp snare crack and a punchy hit' + FX)
add(G, 'attack/bassist', 'ตีปกติ เบส', 0.7, 'A heavy axe swing with a deep plucked bass note thud' + FX)
add(G, 'attack/keyboardist', 'ตีปกติ คีย์บอร์ด', 0.6, 'A magic bolt shot from a keyboard, bright piano note with a crystal zap' + FX)
add(G, 'attack/dj', 'ตีปกติ ดีเจ', 0.6, 'A neon energy shot, quick record scratch and an electric zap' + FX)
add(G, 'sfx/hit', 'ตีโดน', 0.4, 'A brutal melee hit, crunchy punchy impact with a heavy body thump' + FX)
add(G, 'sfx/crit', 'คริติคอล', 0.6, 'A devastating critical hit, explosive crack, heavy bass thump and a sharp metallic ring' + FX)
add(G, 'sfx/miss', 'หลบ/พลาด', 0.4, 'A fast weapon swing missing its target, clean air whoosh' + FX)
add(G, 'sfx/hurt', 'เราโดนตี', 0.4, 'A hero taking a heavy hit, dull body impact and armor rattle, no voice' + FX)
add(G, 'sfx/death', 'เราตาย', 2.5, 'A hero falling in battle, dramatic low brass-like swell fading, heavy body collapse, somber' + SOFT)
add(G, 'sfx/mdie', 'มอนตาย (ใช้เมื่อไม่มีเสียงมอนแบบเฉพาะ)', 1.2, 'A monster bursting into magical pieces, wet pop, sparkle explosion and debris falling' + MON)

# ---------------------------------------------------------------- monsters (one voice file covers every monster of that kind)
G = 'เสียงมอนสเตอร์ (ไฟล์เดียวใช้ได้กับมอนทุกตัวในกลุ่ม เกมปรับเสียงสูงต่ำตามขนาดให้เอง)'
VOICES = [
    ('squish', 'วุ้น/สไลม์/บลอบ (เจลลี่ วุ้นเขียว เม่นหนาม ฯลฯ)', 'a jelly slime creature', 'a squishy wet squelch yelp', 'bursting with a big wet splat'),
    ('squeak', 'กระต่าย/เห็ด', 'a small cute critter', 'a high squeak of pain', 'a long squeal then a pop'),
    ('wail', 'ผี/ค้างคาวผี/วิญญาณ', 'a ghost', 'an eerie ghostly wail', 'a long haunting shriek fading away'),
    ('rattle', 'โครงกระดูก/กะโหลก', 'a skeleton', 'a bony rattle and clack', 'bones collapsing and scattering on stone'),
    ('growl', 'ออร์ค/ปีศาจ/เยติ/นินจา/นักรบ', 'a big brute monster', 'an angry guttural growl', 'a deep dying roar and heavy body fall'),
    ('roar', 'มังกร/ไดโน/โกเลม', 'a dragon', 'a fierce short roar', 'an enormous dying roar shaking the ground'),
    ('chirp', 'นก/ไก่/นกพิราบ', 'a bird monster', 'a sharp angry squawk', 'a frantic screech and flutter of falling feathers'),
    ('buzz', 'ผึ้ง/แมลง', 'a giant bee', 'an angry buzzing sting', 'a sputtering buzz crashing down'),
    ('ribbit', 'กบ', 'a giant frog', 'a croaking grunt', 'a long gurgling croak and wet splat'),
    ('bark', 'หมา', 'a monster dog', 'a vicious bark and snarl', 'a howl fading into a whimper'),
    ('meow', 'แมว', 'a monster cat', 'an angry hiss and yowl', 'a long yowl fading out'),
    ('blub', 'ปลา/หมึก', 'a fish monster', 'a bubbly gurgle', 'a big bubbling splash'),
    ('warble', 'เอเลี่ยน/อัลปาคิง', 'an alien creature', 'a strange warbling alien chirp', 'a glitchy warbling scream fading out'),
    ('crunch', 'กระบองเพชร', 'a cactus monster', 'a woody crunch and creak', 'a wooden crack and the body crumbling apart'),
]
for v, label, who, hurt, die in VOICES:
    add(G, f'mon/{v}_hurt', f'{label} โดนตี', 0.6, f'{who} being hit, {hurt}' + MON)
    add(G, f'mon/{v}_die', f'{label} ตาย', 1.5, f'{who} dying, {die}' + MON)
add(G, 'mon/boss_hurt', 'บอส MVP โดนตี (บอสทุกตัว)', 0.8, 'A colossal boss monster being hit, monstrous furious roar with heavy armor impact' + FX)
add(G, 'mon/boss_die', 'บอส MVP ตาย (บอสทุกตัว)', 4, 'A colossal boss monster dying, earth-shaking final roar, huge explosion and the body crashing down, debris raining' + FX)
add(G, 'sfx/mvp', 'ประกาศ MVP (ฆ่าบอสได้)', 3, 'A triumphant victory fanfare stinger, epic brass and orchestral hit with a cymbal swell' + UI)

G = 'บอสยมทูตเคียวโลหิต (อเวจี)'
add(G, 'boss/reaper_warn', 'เตือนก่อนใช้สกิล', 2, 'A grim reaper preparing a deadly attack, dark ominous rising drone, whispering wind, a bell toll' + FX)
add(G, 'boss/reaper_sweep', 'กวาดเคียว', 2, 'A giant blood scythe sweeping in a huge arc, terrifying whoosh and a brutal slashing impact' + FX)
add(G, 'boss/reaper_chain', 'โซ่วิญญาณ', 2.5, 'Spectral chains shooting out and binding souls, rattling heavy chains, ghostly screams' + FX)
add(G, 'boss/reaper_fire', 'ไฟนรก', 3, 'Hellfire erupting from the ground, roaring infernal flames and deep demonic rumble' + FX)
add(G, 'boss/reaper_judge', 'พิพากษา', 3, 'A divine dark judgment strike from the sky, massive thunderous blast with a choir of doom' + FX)

# ---------------------------------------------------------------- ui
G = 'เสียงระบบ'
add(G, 'sfx/levelup', 'เลเวลอัป', 2.5, 'An epic level up, triumphant orchestral brass hit with rising golden sparkles' + UI)
add(G, 'sfx/joblevel', 'Job เลเวลอัป', 2, 'A job level up chime, bright magical ascending arpeggio with a shimmering burst' + UI)
add(G, 'sfx/potion', 'กินยา', 1, 'Drinking a magic potion, quick gulp and a sparkling healing chime' + UI)
add(G, 'sfx/heal', 'ได้รับการฮีล', 1, 'A gentle healing sparkle, soft rising chime' + UI)
add(G, 'sfx/warp', 'วาร์ป', 2, 'A teleport portal, swirling magic whoosh rising then a soft pop' + UI)
add(G, 'sfx/enter', 'เข้าเกม', 2.5, 'Entering a fantasy world, grand magical swell and a warm orchestral chord' + UI)
add(G, 'sfx/item', 'เก็บไอเท็ม', 0.5, 'Picking up an item, short bright pickup blip' + UI)
add(G, 'sfx/coin', 'ได้เงิน', 0.5, 'Coins clinking, short sparkling coin pickup' + UI)
add(G, 'sfx/click', 'คลิกปุ่ม', 0.2, 'A soft clean UI button click' + UI)

# ---------------------------------------------------------------- music (Eleven Music)
G = 'เพลงพื้นหลัง (ใช้ Music ของ ElevenLabs ยาว 1-2 นาที)'
M = [
    ('title', 'หน้าเลือกตัวละคร', 'Epic fantasy main theme, slow majestic orchestral opening with choir, soaring strings and a heroic brass melody, 80 BPM, awe-inspiring.'),
    ('town', 'เมืองเมโลเดีย (ใช้กับเมืองที่ไม่มีเพลงของตัวเองด้วย)', 'Grand fantasy kingdom town theme, warm orchestral strings, harp and flute melody with a heroic brass swell, uplifting and majestic, 95 BPM.'),
    ('desert', 'เมืองทะเลทรายตะโพน', 'Epic Arabian desert city theme, heavy taiko and frame drums, oud and ney flute melody, deep cinematic strings, powerful and exotic, 100 BPM.'),
    ('magic', 'เมืองคีย์มนตรา', 'Mystical grand magic academy city theme, sparkling celesta and grand piano, choir and sweeping strings, wondrous and majestic, 90 BPM.'),
    ('field', 'ทุ่งเมโลดี้ (ใช้กับแผนที่ล่ามอนที่ไม่มีเพลงของตัวเองด้วย)', 'Epic fantasy adventure field battle theme, driving orchestral percussion, heroic brass and fast strings, energetic, 130 BPM.'),
    ('forest', 'ป่าเพลงกระซิบ', 'Epic enchanted forest adventure theme, tribal drums, celtic flute and pounding orchestral strings, mysterious yet heroic, 115 BPM.'),
    ('marsh', 'บึงจังหวะ', 'Dark swamp exploration theme, deep murky low strings, heavy tribal drums, eerie woodwinds, tense and heavy, 100 BPM.'),
    ('canyon', 'หุบผาร็อค', 'Epic rock canyon battle theme, heavy distorted electric guitars with orchestra, pounding drums, powerful and intense, 140 BPM.'),
    ('snow', 'ยอดเขาหิมะโซปราโน', 'Epic frozen mountain theme, soaring female choir aahs, icy bells and huge orchestral strings, cold and majestic, 110 BPM.'),
    ('volcano', 'ภูเขาไฟเมทัล', 'Epic volcanic heavy metal battle theme, crushing metal guitars, double kick drums, dark orchestra and choir, fiery and intense, 160 BPM.'),
    ('beach', 'หาดคลื่นซินธ์', 'Epic synthwave beach adventure, driving retro synths with big drums and heroic orchestral layers, bright and powerful, 120 BPM.'),
    ('cave', 'ถ้ำคริสตัลก้องกังวาน', 'Epic crystal cave theme, echoing bells, deep drones, heavy cinematic percussion hits, mysterious and huge, 95 BPM.'),
    ('deadwood', 'ป่าไม้ตายเพลงหลอน', 'Dark horror forest battle theme, haunting music box over heavy orchestral drums, dissonant strings and whispering choir, 105 BPM.'),
    ('ruins', 'เมืองปราสาทร้างโอเปร่า', 'Epic gothic opera ruins theme, pipe organ, dramatic operatic choir, thunderous orchestra and timpani, 120 BPM.'),
    ('inferno', 'ปล่องลาวานรกเมทัล', 'Apocalyptic hellfire symphonic metal, brutal guitars, blast beats, massive choir and orchestra, extremely intense, 170 BPM.'),
    ('abyss', 'อเวจี (บอสยมทูต)', 'Ultimate final boss battle theme, dark symphonic metal with demonic choir, pounding taiko, pipe organ and crushing guitars, terrifying and epic, 150 BPM.'),
    ('pvp', 'ลานประลอง + ปราสาทกิลด์วอร์', 'Epic PvP arena war theme, massive war drums, aggressive brass, choir chants and rock guitars, adrenaline-pumping, 145 BPM.'),
]
for key, label, prompt in M:
    add(G, f'music/{key}', label, 90, prompt + MUS, kind='music')

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
json.dump(C, open(os.path.join(here, 'sound_catalog.json'), 'w'), ensure_ascii=False, indent=1)
out = ['# เสียงที่ใส่ได้ (ElevenLabs)', '',
       'วางไฟล์ไว้ในโฟลเดอร์นี้ตามชื่อในตาราง (หรือใช้ `python3 tools/import_sounds.py <โฟลเดอร์หรือ zip>` ซึ่งจะบีบอัด ตัดเงียบ และปรับความดังให้).',
       'ไฟล์ไหนไม่มี เกมใช้เสียงสังเคราะห์เดิม. ชื่อไฟล์ `skill.x_wave.mp3` = `skill/x_wave.mp3` ในโฟลเดอร์นี้.',
       'เมื่อมีไฟล์อย่างน้อย 1 ไฟล์ เกมแสดงเครดิต ElevenLabs ที่หน้าล็อกอินและหน้าตั้งค่าเสียงเอง.', '']
g = None
for c in C:
    if c['group'] != g:
        g = c['group']
        out += ['', f'## {g}', '', '| ไฟล์ | อะไร | ยาว (วิ) | Prompt |', '|---|---|---|---|']
    out.append(f"| `{c['key']}` | {c['label']} | {c['seconds']} | {c['prompt']} |")
open(os.path.join(root, 'src/assets/sounds/README.md'), 'w').write('\n'.join(out) + '\n')
print(len(C), 'sounds')

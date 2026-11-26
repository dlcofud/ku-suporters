"""콘텐츠 탭 예시 그림 (코드로 그린 일러스트). SVG → PNG(2배) → WebP"""
import pathlib
OUT = pathlib.Path(__file__).parent / "svg"; OUT.mkdir(exist_ok=True)

DEFS = """
<defs>
 <filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
 <filter id="soft2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
 <filter id="tiny"><feGaussianBlur stdDeviation="1.2"/></filter>
 <linearGradient id="caseG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e4e0d9"/></linearGradient>
 <linearGradient id="skin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2c6a5"/><stop offset="1" stop-color="#d99d78"/></linearGradient>
</defs>"""

def svg(w, h, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{DEFS}{body}</svg>'

def bud(x, y, s=1, rot=0, fill="#ffffff"):
    # 이어폰 한 쪽: 둥근 머리 + 짧은 막대
    return f'''<g transform="translate({x} {y}) rotate({rot}) scale({s})">
      <rect x="-4" y="6" width="8" height="26" rx="4" fill="{fill}" stroke="#cfc9bf" stroke-width="1"/>
      <ellipse cx="0" cy="4" rx="11" ry="10" fill="{fill}" stroke="#cfc9bf" stroke-width="1"/>
      <ellipse cx="-3" cy="1" rx="4" ry="3" fill="#fff" opacity=".9"/>
      <circle cx="5" cy="6" r="2.4" fill="#3a3a3a" opacity=".55"/></g>'''

def case(x, y, s=1, open_=False):
    lid = ''
    if open_:
        lid = f'''<path d="M-58 -6 Q-58 -66 0 -66 Q58 -66 58 -6 Z" fill="#f6f4f0" stroke="#d6d0c6" stroke-width="1.5"/>
        <path d="M-46 -10 Q-46 -54 0 -54 Q46 -54 46 -10 Z" fill="#ebe7e0"/>'''
    tray = '<ellipse cx="-20" cy="6" rx="15" ry="9" fill="#d8d2c8"/><ellipse cx="20" cy="6" rx="15" ry="9" fill="#d8d2c8"/>' if open_ else '<line x1="-56" y1="0" x2="56" y2="0" stroke="#d6d0c6" stroke-width="1.5"/><circle cx="0" cy="22" r="2.5" fill="#9bd29a"/>'
    if not open_:
        lid = '<path d="M-58 -6 L-58 -16 Q-58 -46 -20 -46 L20 -46 Q58 -46 58 -16 L58 -6 Z" fill="url(#caseG)" stroke="#d6d0c6" stroke-width="1.5"/><path d="M-40 -38 Q0 -44 36 -38" stroke="#fff" stroke-width="3" fill="none" opacity=".8"/>'
    return f'''<g transform="translate({x} {y}) scale({s})">
      <ellipse cx="4" cy="52" rx="70" ry="12" fill="#5a4632" opacity=".28" filter="url(#soft)"/>
      {lid}
      <path d="M-58 -6 L58 -6 L58 14 Q58 52 0 52 Q-58 52 -58 14 Z" fill="url(#caseG)" stroke="#d6d0c6" stroke-width="1.5"/>
      {tray}</g>'''

def sunbeams(w, h, op=.22):
    return f'''<g opacity="{op}" fill="#fff"><polygon points="0,{h*0.05} {w*0.55},0 {w*0.95},{h} {w*0.35},{h}"/>
      <polygon points="{w*0.65},0 {w*0.8},0 {w*1.2},{h} {w*1.02},{h}" opacity=".7"/></g>'''

def plant(x, y, s=1):
    return f'''<g transform="translate({x} {y}) scale({s})">
      <path d="M-14 0 L14 0 L11 26 L-11 26 Z" fill="#c8805c"/><rect x="-16" y="-4" width="32" height="7" rx="2" fill="#b56f4d"/>
      <path d="M0 -2 C-4 -24 -26 -30 -30 -44 C-12 -42 -2 -28 0 -2" fill="#6f9a6a"/>
      <path d="M0 -2 C4 -30 22 -36 30 -52 C10 -50 2 -32 0 -2" fill="#5e8a5c"/>
      <path d="M0 -2 C-1 -30 4 -50 0 -62 C-8 -48 -6 -26 0 -2" fill="#7fae78"/></g>'''

def mug(x, y, s=1, c="#f6f4f0", steam=False):
    st = '<path d="M-6 -16 q-6 -8 0 -14 q6 -6 0 -14 M6 -16 q-6 -8 0 -14 q6 -6 0 -14" stroke="#fff" stroke-width="2" fill="none" opacity=".55"/>' if steam else ''
    return f'''<g transform="translate({x} {y}) scale({s})">{st}
      <ellipse cx="2" cy="28" rx="22" ry="5" fill="#000" opacity=".2" filter="url(#tiny)"/>
      <path d="M22 4 q14 0 14 10 q0 10 -14 10" stroke="{c}" stroke-width="5" fill="none"/>
      <rect x="-18" y="-6" width="40" height="34" rx="6" fill="{c}"/><ellipse cx="2" cy="-6" rx="20" ry="5" fill="#6b4a33"/></g>'''

def books(x, y, s=1, cols=("#7d8f9e", "#d4a373", "#efe6d8")):
    out = f'<g transform="translate({x} {y}) scale({s})">'
    for i, c in enumerate(cols):
        out += f'<rect x="{-40 + i*3}" y="{-12*i - 12}" width="80" height="12" rx="2" fill="{c}" stroke="#00000022"/>'
    return out + '</g>'

def lamp(x, y, s=1, on=True, glow="#ffd89a"):
    g = f'<ellipse cx="44" cy="60" rx="70" ry="40" fill="{glow}" opacity=".45" filter="url(#soft2)"/>' if on else ''
    return f'''<g transform="translate({x} {y}) scale({s})">{g}
      <ellipse cx="0" cy="96" rx="22" ry="5" fill="#2b2b2b"/>
      <path d="M0 94 L-6 40 L30 6" stroke="#2b2b2b" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M22 -4 L52 10 L44 30 L14 16 Z" fill="#2b2b2b"/>
      {f'<polygon points="44,26 18,14 -10,100 90,100" fill="{glow}" opacity=".35"/>' if on else ''}</g>'''

def hand_pinch(x, y, s=1):
    """엄지와 검지 끝이 (0,0)에서 만나 무언가를 집는 손. 손등·소매는 오른쪽 아래로"""
    sk = "#eab99a"; dk = "#d49a76"
    return f'''<g transform="translate({x} {y}) scale({s})">
      <ellipse cx="60" cy="110" rx="70" ry="20" fill="#5a4632" opacity=".22" filter="url(#soft)"/>
      <path d="M150 300 L78 104 Q118 76 162 96 L230 300 Z" fill="#8a7460"/>
      <path d="M78 106 Q118 78 162 98 L168 116 Q124 98 86 124 Z" fill="#76614e"/>
      <ellipse cx="96" cy="78" rx="48" ry="36" transform="rotate(-28 96 78)" fill="{dk}"/>
      <ellipse cx="96" cy="78" rx="46" ry="34" transform="rotate(-28 96 78)" fill="{sk}"/>
      <path d="M66 50 L10 -2" stroke="{dk}" stroke-width="21" stroke-linecap="round"/>
      <path d="M66 50 L10 -2" stroke="{sk}" stroke-width="17" stroke-linecap="round"/>
      <path d="M62 92 L14 14" stroke="{dk}" stroke-width="20" stroke-linecap="round"/>
      <path d="M62 92 L14 14" stroke="{sk}" stroke-width="16" stroke-linecap="round"/>
      <path d="M92 44 Q70 40 60 60" stroke="{dk}" stroke-width="15" stroke-linecap="round" fill="none"/>
      <path d="M114 50 Q92 50 84 70" stroke="{dk}" stroke-width="14" stroke-linecap="round" fill="none"/>
      <ellipse cx="4" cy="-4" rx="5" ry="4" fill="#f6d2bb"/></g>'''

def person_back(x, y, s=1, top="#f2efe9"):
    return f'''<g transform="translate({x} {y}) scale({s})">
      <path d="M-80 200 Q-80 90 0 80 Q80 90 80 200 Z" fill="{top}"/>
      <path d="M-14 60 L14 60 L16 90 L-16 90 Z" fill="#e5b190"/>
      <ellipse cx="0" cy="10" rx="46" ry="54" fill="#3a2e28"/>
      <ellipse cx="-44" cy="18" rx="9" ry="13" fill="#e5b190"/>
      {bud(-50, 10, .75, -20)}</g>'''

def window(x, y, w, h, sky=("#fdf3df", "#f3e2c1"), frame="#ffffff", panes=2):
    lines = ''.join(f'<line x1="{x + w*i/panes}" y1="{y}" x2="{x + w*i/panes}" y2="{y+h}" stroke="{frame}" stroke-width="5"/>' for i in range(1, panes))
    return f'''<defs><linearGradient id="sky{x}{y}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{sky[0]}"/><stop offset="1" stop-color="{sky[1]}"/></linearGradient></defs>
      <rect x="{x}" y="{y}" width="{w}" height="{h}" fill="url(#sky{x}{y})" stroke="{frame}" stroke-width="7"/>{lines}
      <line x1="{x}" y1="{y+h/2}" x2="{x+w}" y2="{y+h/2}" stroke="{frame}" stroke-width="5"/>'''

def bg(w, h, a, b, id_):
    return f'<defs><linearGradient id="{id_}" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient></defs><rect width="{w}" height="{h}" fill="url(#{id_})"/>'

S = {}
# ① 참고 릴스 3컷 (9:16)
S["reel-1"] = svg(270, 480, bg(270, 480, "#f5ecdd", "#d6c2a5", "g1") +
    ''.join(f'<path d="M0 {60+i*70} Q135 {50+i*70} 270 {66+i*70}" stroke="#c9b293" stroke-width="1.5" fill="none" opacity=".5"/>' for i in range(7)) +
    sunbeams(270, 480, .25) + case(100, 310, 1.1, open_=True) + bud(78, 304, 1.0) +
    bud(134, 212, 1.05, 30) + hand_pinch(134, 230, .9))
S["reel-2"] = svg(270, 480, bg(270, 480, "#bfa98f", "#7a6653", "g2") +
    '<circle cx="50" cy="90" r="34" fill="#fff3d6" opacity=".25" filter="url(#soft)"/><circle cx="220" cy="140" r="22" fill="#fff3d6" opacity=".22" filter="url(#soft)"/><circle cx="210" cy="60" r="14" fill="#fff" opacity=".18" filter="url(#soft)"/>' +
    lamp(170, 230, .9, glow="#ffe2b0") + '<rect x="0" y="360" width="270" height="120" fill="#d2bd9d"/><rect x="0" y="356" width="270" height="8" fill="#b89f7f"/>' +
    person_back(115, 250, 1.05, top="#efe9df") +
    '<g transform="translate(196 366) rotate(-4) scale(.7)"><rect width="110" height="70" rx="3" fill="#fbf8f2"/><line x1="55" y1="0" x2="55" y2="70" stroke="#d8d0c2"/>' + ''.join(f'<line x1="8" y1="{12+i*10}" x2="47" y2="{12+i*10}" stroke="#cfc6b6"/><line x1="63" y1="{12+i*10}" x2="102" y2="{12+i*10}" stroke="#cfc6b6"/>' for i in range(5)) + '</g>' +
    '<rect width="270" height="480" fill="#000" opacity=".12"/>')
S["reel-3"] = svg(270, 480, bg(270, 480, "#6d7d8a", "#334049", "g3") +
    window(26, 60, 120, 150, sky=("#f6c891", "#7d8fa0"), frame="#e9e4dc") +
    '<rect x="0" y="300" width="270" height="14" fill="#c4ad90"/><rect x="0" y="314" width="270" height="40" fill="#9c8468"/><rect x="18" y="354" width="10" height="126" fill="#7a654f"/><rect x="242" y="354" width="10" height="126" fill="#7a654f"/>' +
    '<path d="M100 480 L104 400 Q135 380 166 400 L170 480 Z" fill="#2a3138"/>' +
    lamp(190, 204, .95) + plant(36, 274, .9) +
    '<g transform="translate(96 250)"><rect x="0" y="0" width="70" height="46" rx="3" fill="#cfd6dc" stroke="#2b2b2b" stroke-width="2"/><rect x="6" y="6" width="58" height="34" fill="#8fb3c9"/><path d="M-8 50 L78 50 L70 44 L0 44 Z" fill="#9aa3aa"/></g>' +
    books(222, 298, .55) + mug(70, 280, .55) + case(180, 288, .22))
# ② 분위기 사진 (정사각)
S["mood-1"] = svg(300, 300, bg(300, 300, "#fff7e6", "#efe0c6", "m1") +
    window(16, 14, 170, 172, sky=("#fffef8", "#ffeec8"), frame="#d9c3a0", panes=2) + '<rect x="16" y="14" width="170" height="172" fill="#fff" opacity=".35" filter="url(#soft2)"/>' +
    '<rect x="0" y="200" width="300" height="100" fill="#e8d6b8"/>' + sunbeams(300, 300, .35) +
    '<g opacity=".16" fill="#6b5235"><path d="M150 300 L196 210 L206 210 L166 300 Z"/><path d="M196 300 L232 210 L242 210 L212 300 Z"/></g>' +
    plant(230, 196, 1.0) + mug(110, 218, .8, steam=True))
S["mood-2"] = svg(300, 300, '<rect width="300" height="300" fill="#e6d8c3"/>' +
    ''.join(f'<line x1="0" y1="{i*6}" x2="300" y2="{i*6+3}" stroke="#d6c6ae" stroke-width="1" opacity=".5"/>' for i in range(50)) +
    '<g transform="translate(30 40) rotate(-6)"><rect width="150" height="110" rx="4" fill="#fbf8f2" stroke="#d9cfbf"/><line x1="75" y1="0" x2="75" y2="110" stroke="#d9cfbf"/>' + ''.join(f'<line x1="10" y1="{16+i*12}" x2="66" y2="{16+i*12}" stroke="#d2c7b5"/><line x1="84" y1="{16+i*12}" x2="140" y2="{16+i*12}" stroke="#d2c7b5"/>' for i in range(7)) + '</g>' +
    '<rect x="196" y="60" width="6" height="110" rx="3" fill="#6b4a33" transform="rotate(18 199 115)"/>' +
    '<circle cx="230" cy="220" r="34" fill="#f6f4f0"/><circle cx="230" cy="220" r="26" fill="#7a4e33"/><circle cx="222" cy="212" r="7" fill="#a5714d" opacity=".6"/>' +
    case(95, 225, .45) + '<path d="M270 20 C240 30 230 60 250 80 C262 60 272 40 270 20" fill="#8aa685"/>')
S["mood-3"] = svg(300, 300, bg(300, 300, "#2a3440", "#151b22", "m3") +
    window(170, 20, 110, 120, sky=("#1d2a3a", "#2c3e52"), frame="#3d4a57") +
    '<circle cx="250" cy="48" r="10" fill="#f8efc9"/><circle cx="196" cy="40" r="1.4" fill="#fff"/><circle cx="220" cy="90" r="1.2" fill="#fff"/><circle cx="262" cy="104" r="1" fill="#fff"/>' +
    '<rect x="0" y="210" width="300" height="90" fill="#3a2f28"/>' + lamp(50, 116, 1.0, glow="#ffc976") +
    '<g transform="translate(110 222) rotate(-4)"><path d="M0 8 Q40 -4 80 8 L80 56 Q40 44 0 56 Z" fill="#f3e6c9"/><path d="M80 8 Q120 -4 160 8 L160 56 Q120 44 80 56 Z" fill="#efe0bd"/></g>' +
    mug(230, 226, .7, c="#c9b59b", steam=True))
# ④ 찍을 대상·소품 사진
S["subject-1"] = svg(300, 300, bg(300, 300, "#f3eadb", "#d9c6aa", "s1") + sunbeams(300, 300, .2) +
    case(150, 160, 1.3) + bud(70, 220, 1.1, -30) + bud(232, 218, 1.1, 28))
S["subject-2"] = svg(300, 300, bg(300, 300, "#efe4d2", "#cdb898", "s2") +
    window(14, 20, 150, 170, sky=("#eaf3f6", "#cfe1e8"), frame="#fbf7ef") +
    ''.join(f'<rect x="184" y="{24+i*46}" width="110" height="6" fill="#8a6c50"/>' + ''.join(f'<rect x="{188+j*13}" y="{24+i*46-34+(j%3)*4}" width="10" height="{34-(j%3)*4}" fill="{["#7d8f9e", "#c98f5e", "#a9b48f", "#d8c3a0", "#8c6f8f"][(i+j)%5]}"/>' for j in range(8)) for i in range(4)) +
    '<rect x="0" y="212" width="300" height="14" fill="#a8855f"/><rect x="0" y="226" width="300" height="74" fill="#8e6f50"/>' +
    sunbeams(300, 300, .18) + '<path d="M60 300 L64 250 Q90 238 116 250 L120 300 Z" fill="#5b4636"/>' + mug(200, 186, .55) + books(110, 210, .6))

for k, v in S.items():
    (OUT / f"{k}.svg").write_text(v)
print(list(S))

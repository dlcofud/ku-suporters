/**
 * 계정 실험실의 플라스크와 그 안에서 자라는 생명체 (SVG). 사이트 톤: 평면 색 + 남색 잉크 외곽선.
 * 회차마다 종류(나무 · 선인장 · 버섯 · 슬라임)와 색이 달라진다 (core account.variantOf).
 * stage 0 빈 플라스크 → 1 씨앗 → 2 새싹 → 3 아기 → 4 어린 → 5 꽃 핀 → 6 다 자람(실험 뒤)
 * colors: 넣은 재료 색 (넣은 순서대로 층이 쌓이고, 많을수록 물이 높아진다)
 */
export type Species = "tree" | "cactus" | "mushroom" | "slime";

const INK = "#1C2140";
const LINE = { stroke: INK, strokeWidth: 2.2, strokeLinejoin: "round" as const };
const PINK = "#FF8DB9";
const HL = "#FFE45C";

function Face({ x, y, s = 1, happy = false }: { x: number; y: number; s?: number; happy?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {happy ? (
        <>
          <path d="M-10 0 q3 -4 6 0" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M4 0 q3 -4 6 0" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse cx="-7" cy="0" rx="2.6" ry="3.2" fill={INK} />
          <ellipse cx="7" cy="0" rx="2.6" ry="3.2" fill={INK} />
          <circle cx="-6.2" cy="-1.2" r=".9" fill="#fff" />
          <circle cx="7.8" cy="-1.2" r=".9" fill="#fff" />
        </>
      )}
      <ellipse cx="-12" cy="5" rx="3.4" ry="2" fill={PINK} />
      <ellipse cx="12" cy="5" rx="3.4" ry="2" fill={PINK} />
      <path d="M-3 4.5 Q0 8 3 4.5" stroke={INK} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Star({ x, y, r = 9 }: { x: number; y: number; r?: number }) {
  const k = r / 3;
  return <path d={`M${x} ${y - r} L${x + k} ${y - k} L${x + r} ${y} L${x + k} ${y + k} L${x} ${y + r} L${x - k} ${y + k} L${x - r} ${y} L${x - k} ${y - k} Z`} fill={HL} stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />;
}

function Flower({ x, y, c = PINK }: { x: number; y: number; c?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {[0, 72, 144, 216, 288].map((r) => (
        <ellipse key={r} cx="0" cy="-4" rx="3" ry="4.5" fill={c} stroke={INK} strokeWidth="1" transform={`rotate(${r})`} />
      ))}
      <circle r="2.4" fill={HL} stroke={INK} strokeWidth="1" />
    </g>
  );
}

/** 3단계: 플라스크 안의 아기 생명체 */
function Baby({ species, hue }: { species: Species; hue: string }) {
  if (species === "tree")
    return (
      <>
        <path d="M98 210 Q78 186 86 172 Q102 182 104 204" fill={hue} {...LINE} />
        <path d="M142 210 Q162 186 154 172 Q138 182 136 204" fill={hue} {...LINE} />
        <ellipse cx="120" cy="236" rx="36" ry="32" fill={hue} {...LINE} />
        <Face x={120} y={238} s={1.1} />
      </>
    );
  if (species === "cactus")
    return (
      <>
        <rect x="94" y="198" width="52" height="70" rx="26" fill={hue} {...LINE} />
        <path d="M108 210 v50 M132 210 v50" stroke={INK} strokeWidth="1.2" opacity=".5" />
        <Face x={120} y={232} s={1.05} />
        <Flower x={120} y={198} />
      </>
    );
  if (species === "mushroom")
    return (
      <>
        <rect x="106" y="226" width="28" height="40" rx="10" fill="#FFF7E6" {...LINE} />
        <path d="M84 230 Q84 192 120 190 Q156 192 156 230 Z" fill={hue} {...LINE} />
        <circle cx="104" cy="210" r="5" fill="#fff" stroke={INK} strokeWidth="1.2" />
        <circle cx="134" cy="206" r="4" fill="#fff" stroke={INK} strokeWidth="1.2" />
        <Face x={120} y={246} s={0.85} />
      </>
    );
  return (
    <>
      <path d="M84 266 Q80 214 120 206 Q160 214 156 266 Z" fill={hue} {...LINE} />
      <path d="M120 206 Q118 192 126 186" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <circle cx="127" cy="185" r="5" fill={hue} {...LINE} />
      <Face x={120} y={236} s={1.1} />
    </>
  );
}

/** 4~6단계: 플라스크 밖으로 자란 모습 */
function Grown({ species, hue, stage }: { species: Species; hue: string; stage: number }) {
  const big = stage >= 5;
  const done = stage >= 6;
  if (species === "tree")
    return (
      <>
        <path d="M116 250 Q112 160 118 70 L124 70 Q130 160 126 250 Z" fill="#C9A27E" {...LINE} />
        <g {...LINE} fill={hue}>
          <circle cx={big ? 82 : 90} cy={big ? 74 : 76} r={big ? 28 : 22} />
          <circle cx={big ? 158 : 150} cy={big ? 74 : 76} r={big ? 28 : 22} />
          <circle cx="120" cy={big ? 56 : 62} r={big ? 50 : 40} />
        </g>
        <Face x={120} y={big ? 66 : 70} s={1.25} happy={done} />
        {big && [[86, 54], [152, 50], [100, 26], [146, 86], [78, 90]].map(([x, y], i) => <Flower key={i} x={x!} y={y!} />)}
        {done &&
          [[100, 92], [140, 30], [164, 64], [72, 62]].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="7" fill={HL} stroke={INK} strokeWidth="2" />
              <path d={`M${x} ${y! - 7} q2 -5 6 -5`} stroke={INK} strokeWidth="2" fill="none" />
            </g>
          ))}
      </>
    );
  if (species === "cactus") {
    const top = big ? 40 : 60;
    const armY = big ? 120 : 130;
    return (
      <>
        <rect x="98" y={top} width="44" height={250 - top} rx="22" fill={hue} {...LINE} />
        <path d={`M98 ${armY} H82 Q72 ${armY} 72 ${armY - 12} V${armY - 34} Q72 ${armY - 44} 82 ${armY - 44} Q92 ${armY - 44} 92 ${armY - 34} V${armY - 14} H98`} fill={hue} {...LINE} />
        {big && <path d="M142 100 H156 Q166 100 166 90 V70 Q166 60 156 60 Q146 60 146 70 V88 H142" fill={hue} {...LINE} />}
        <path d={`M110 ${top + 16} V240 M130 ${top + 16} V240`} stroke={INK} strokeWidth="1.2" opacity=".45" />
        <Face x={120} y={top + 44} s={1.2} happy={done} />
        {big && <Flower x={120} y={top} />}
        {big && <Flower x={82} y={armY - 44} c="#fff" />}
        {done && <Star x={176} y={40} r={11} />}
        {done && <Star x={56} y={54} r={7} />}
      </>
    );
  }
  if (species === "mushroom") {
    const w = big ? 68 : 56;
    const capTop = big ? 26 : 38;
    return (
      <>
        <path d="M108 250 Q104 160 110 100 L130 100 Q136 160 132 250 Z" fill="#FFF7E6" {...LINE} />
        <path d={`M${120 - w} 106 Q${120 - w} ${capTop + 2} 120 ${capTop} Q${120 + w} ${capTop + 2} ${120 + w} 106 Z`} fill={hue} {...LINE} />
        {[[92, 70], [150, 64], [120, 50]].map(([x, y], i) => <circle key={i} cx={x} cy={y! + (big ? -6 : 4)} r={big ? 9 : 7} fill="#fff" stroke={INK} strokeWidth="1.4" />)}
        {big && [[70, 92], [170, 90]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="5" fill="#fff" stroke={INK} strokeWidth="1.2" />)}
        <Face x={120} y={132} s={1.1} happy={done} />
        {done && (
          <g>
            <rect x="162" y="114" width="12" height="18" rx="4" fill="#FFF7E6" {...LINE} />
            <path d="M152 118 Q152 98 168 97 Q184 98 184 118 Z" fill={PINK} {...LINE} />
            <rect x="64" y="118" width="10" height="14" rx="4" fill="#FFF7E6" {...LINE} />
            <path d="M56 122 Q56 106 69 105 Q82 106 82 122 Z" fill={HL} {...LINE} />
          </g>
        )}
      </>
    );
  }
  const top = big ? 28 : 44;
  const side = big ? 60 : 70;
  return (
    <>
      <path d={`M102 152 Q${side - 4} 150 ${side} ${top + 58} Q${side + 6} ${top + 2} 120 ${top} Q${240 - side - 6} ${top + 2} ${240 - side} ${top + 58} Q${240 - side + 4} 150 138 152 Z`} fill={hue} {...LINE} />
      <path d={`M120 ${top} Q116 ${top - 16} 126 ${top - 24}`} stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      {big ? <path d={`M126 ${top - 24} Q146 ${top - 34} 152 ${top - 18} Q138 ${top - 10} 126 ${top - 24}`} fill="#7EDDAA" {...LINE} /> : <circle cx="127" cy={top - 24} r="6" fill={hue} {...LINE} />}
      <Face x={120} y={top + 60} s={1.3} happy={done} />
      {done && <path d={`M96 ${top + 6} L102 ${top - 12} L112 ${top} L120 ${top - 16} L128 ${top} L138 ${top - 12} L144 ${top + 6} Z`} fill={HL} {...LINE} />}
      {done && <Star x={190} y={40} r={8} />}
    </>
  );
}

export function LabCreature({ stage, colors, species = "tree", hue = "#7EDDAA", title }: { stage: number; colors: string[]; species?: Species; hue?: string; title?: string }) {
  const level = stage === 0 ? 236 : 226 - Math.min(colors.length, 6) * 9; // 물 높이 (y가 작을수록 높다)
  return (
    <svg viewBox="0 -12 240 312" className="lab-svg" role="img" aria-label={title ?? "계정 생명체"}>
      <defs>
        <clipPath id="lab-bulb">
          <circle cx="120" cy="214" r="74" />
          <rect x="102" y="96" width="36" height="70" />
        </clipPath>
      </defs>
      <ellipse cx="120" cy="292" rx="66" ry="6" fill={INK} opacity=".12" />

      <g clipPath="url(#lab-bulb)">
        <rect x="40" y="90" width="160" height="210" fill="#fff" />
        {/* 넣은 재료가 순서대로 색 띠로 쌓인다 (맨 위가 가장 최근) */}
        {(colors.length ? [...colors].reverse() : ["#E2E8F3"]).map((c, i, arr) => {
          const band = (292 - level) / arr.length;
          return <rect key={i} className="lab-band" x="40" y={level + i * band} width="160" height={band + 1} fill={c} />;
        })}
        <g style={{ transform: `translateY(${level}px)` }}>
          <path d="M30 0 Q60 -8 90 0 T150 0 T210 0 V8 H30 Z" fill={colors.at(-1) ?? "#E2E8F3"} className="lab-wave" />
          <path d="M30 0 Q60 -8 90 0 T150 0 T210 0" fill="none" stroke={INK} strokeWidth="2" className="lab-wave" />
        </g>
        {stage > 0 && (
          <g fill="#fff" stroke={INK} strokeWidth="1.5">
            <circle className="lab-bub b1" cx="92" cy="272" r="4" />
            <circle className="lab-bub b2" cx="140" cy="276" r="3" />
            <circle className="lab-bub b3" cx="116" cy="280" r="5" />
          </g>
        )}
      </g>

      {/* 플라스크 안: 씨앗 · 새싹 · 아기 */}
      {stage === 1 && (
        <g className="lab-creature">
          <ellipse cx="120" cy="246" rx="20" ry="16" fill={hue} {...LINE} />
          <Face x={120} y={248} s={0.8} />
        </g>
      )}
      {stage === 2 && (
        <g className="lab-creature">
          <path d="M120 232 Q118 208 122 190" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M122 196 Q100 176 92 190 Q104 204 122 196" fill="#7EDDAA" {...LINE} />
          <path d="M122 192 Q146 170 154 186 Q140 200 122 192" fill="#7EDDAA" {...LINE} />
          <ellipse cx="120" cy="246" rx="22" ry="17" fill={hue} {...LINE} />
          <Face x={120} y={248} s={0.85} />
        </g>
      )}
      {stage === 3 && (
        <g className="lab-creature">
          <Baby species={species} hue={hue} />
        </g>
      )}

      {/* 플라스크 유리 */}
      <path d="M102 96 V150 A74 74 0 1 0 138 150 V96" fill="none" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <rect x="96" y="86" width="48" height="12" rx="4" fill="#fff" stroke={INK} strokeWidth="3" />

      {/* 병 밖으로 자란 모습 */}
      {stage >= 4 && (
        <g className="lab-creature">
          <Grown species={species} hue={hue} stage={stage} />
        </g>
      )}
    </svg>
  );
}

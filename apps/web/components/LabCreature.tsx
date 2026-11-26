/**
 * 계정 실험실의 플라스크와 그 안에서 자라는 나무 정령 (SVG).
 * stage 0 빈 플라스크 → 1 씨앗 → 2 새싹 → 3 떡잎 정령 → 4 어린 나무 정령 → 5 꽃 핀 나무 → 6 열매 맺은 나무(끓인 뒤)
 * colors: 넣은 물약 색들 (섞인 물 색과 물 높이에 쓴다)
 */

function mix(colors: string[]): string {
  if (!colors.length) return "#cfe6ff";
  const rgb = colors.map((c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16)));
  const avg = [0, 1, 2].map((k) => Math.round(rgb.reduce((s, x) => s + x[k]!, 0) / rgb.length));
  // 파스텔 쪽으로 살짝 밝힌다
  return "#" + avg.map((v) => Math.round(v + (255 - v) * 0.25).toString(16).padStart(2, "0")).join("");
}

function Face({ x, y, s = 1, glow = false }: { x: number; y: number; s?: number; glow?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="-7" cy="0" rx="2.6" ry="3.2" fill="#1C2140" />
      <ellipse cx="7" cy="0" rx="2.6" ry="3.2" fill="#1C2140" />
      <circle cx="-6.2" cy="-1.2" r=".9" fill="#fff" />
      <circle cx="7.8" cy="-1.2" r=".9" fill="#fff" />
      <ellipse cx="-12" cy="5" rx="3.4" ry="2" fill="#ff8db9" opacity=".7" />
      <ellipse cx="12" cy="5" rx="3.4" ry="2" fill="#ff8db9" opacity=".7" />
      <path d={glow ? "M-4 4 Q0 9 4 4" : "M-3 4.5 Q0 7.5 3 4.5"} stroke="#1C2140" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  );
}

const LEAF = "#5fbf7a";
const LEAF_DK = "#3f9a5c";
const BARK = "#8a5a3c";

export function LabCreature({ stage, colors, bubbling = true, title }: { stage: number; colors: string[]; bubbling?: boolean; title?: string }) {
  const liquid = mix(colors);
  const level = stage === 0 ? 236 : 226 - Math.min(colors.length, 6) * 9; // 물 높이 (y가 작을수록 높다)
  return (
    <svg viewBox="0 0 240 300" className="lab-svg" role="img" aria-label={title ?? "계정 정령"}>
      <defs>
        <clipPath id="lab-bulb">
          <circle cx="120" cy="214" r="74" />
          <rect x="102" y="96" width="36" height="70" />
        </clipPath>
        <radialGradient id="lab-glow" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff6b0" stopOpacity=".95" />
          <stop offset="1" stopColor="#fff6b0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="lab-glass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".85" />
          <stop offset=".5" stopColor="#ffffff" stopOpacity=".35" />
          <stop offset="1" stopColor="#ffffff" stopOpacity=".7" />
        </linearGradient>
      </defs>

      {stage >= 6 && <circle cx="120" cy="70" r="80" fill="url(#lab-glow)" className="lab-pulse" />}
      {/* 받침 그림자 */}
      <ellipse cx="120" cy="292" rx="66" ry="6" fill="#1C2140" opacity=".12" />

      {/* 물 */}
      <g clipPath="url(#lab-bulb)">
        <rect x="40" y="90" width="160" height="210" fill="url(#lab-glass)" />
        <g className="lab-liquid" style={{ transform: `translateY(${level}px)` }}>
          <path d="M30 0 Q60 -8 90 0 T150 0 T210 0 V220 H30 Z" fill={liquid} className="lab-wave" />
          <path d="M30 6 Q60 -2 90 6 T150 6 T210 6 V220 H30 Z" fill={liquid} opacity=".6" />
        </g>
        {bubbling && stage > 0 && (
          <g fill="#fff" opacity=".75">
            <circle className="lab-bub b1" cx="92" cy="272" r="4" />
            <circle className="lab-bub b2" cx="140" cy="276" r="3" />
            <circle className="lab-bub b3" cx="116" cy="280" r="5" />
          </g>
        )}
      </g>

      {/* 정령: 플라스크 안(씨앗 · 새싹 · 떡잎) */}
      {stage === 1 && (
        <g className="lab-creature">
          <ellipse cx="120" cy="246" rx="20" ry="16" fill="#b07a4f" />
          <path d="M106 238 Q120 228 134 238" stroke="#8a5a3c" strokeWidth="2" fill="none" />
          <Face x={120} y={248} s={0.8} />
        </g>
      )}
      {stage === 2 && (
        <g className="lab-creature">
          <path d="M120 232 Q118 208 122 190" stroke={LEAF_DK} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M122 196 Q100 176 92 190 Q104 204 122 196" fill={LEAF} />
          <path d="M122 192 Q146 170 154 186 Q140 200 122 192" fill={LEAF} />
          <ellipse cx="120" cy="246" rx="22" ry="17" fill="#b07a4f" />
          <Face x={120} y={248} s={0.85} />
        </g>
      )}
      {stage === 3 && (
        <g className="lab-creature">
          <path d="M98 210 Q78 186 86 172 Q102 182 104 204" fill={LEAF} />
          <path d="M142 210 Q162 186 154 172 Q138 182 136 204" fill={LEAF} />
          <ellipse cx="120" cy="236" rx="36" ry="32" fill="#8fd49c" />
          <ellipse cx="108" cy="222" rx="10" ry="6" fill="#fff" opacity=".45" />
          <Face x={120} y={238} s={1.1} />
          <path d="M120 204 Q118 190 124 182" stroke={LEAF_DK} strokeWidth="3" fill="none" strokeLinecap="round" />
          <ellipse cx="128" cy="182" rx="8" ry="5" fill={LEAF} transform="rotate(-25 128 182)" />
        </g>
      )}

      {/* 플라스크 유리 */}
      <path
        d="M102 96 V150 A74 74 0 1 0 138 150 V96"
        fill="none"
        stroke="#1C2140"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <rect x="96" y="86" width="48" height="12" rx="4" fill="#fff" stroke="#1C2140" strokeWidth="3" />
      <path d="M62 196 Q60 170 78 154" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" opacity=".8" />

      {/* 정령: 병 밖으로 자란 나무 */}
      {stage >= 4 && (
        <g className="lab-creature">
          <path d="M116 250 Q112 160 118 70 L124 70 Q130 160 126 250 Z" fill={BARK} />
          <path d="M120 120 Q100 108 94 92" stroke={BARK} strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M122 104 Q142 96 150 80" stroke={BARK} strokeWidth="5" fill="none" strokeLinecap="round" />
          <g>
            <circle cx="120" cy={stage >= 5 ? 56 : 62} r={stage >= 5 ? 50 : 40} fill={LEAF} />
            <circle cx={stage >= 5 ? 82 : 90} cy={stage >= 5 ? 74 : 76} r={stage >= 5 ? 28 : 22} fill={LEAF} />
            <circle cx={stage >= 5 ? 158 : 150} cy={stage >= 5 ? 74 : 76} r={stage >= 5 ? 28 : 22} fill={LEAF} />
            <circle cx="106" cy={stage >= 5 ? 36 : 46} r="14" fill="#fff" opacity=".28" />
          </g>
          <Face x={120} y={stage >= 5 ? 66 : 70} s={1.25} glow={stage >= 6} />
          {stage >= 5 &&
            [
              [86, 54],
              [152, 50],
              [100, 26],
              [146, 86],
              [78, 90],
            ].map(([x, y], i) => (
              <g key={i} transform={`translate(${x} ${y})`}>
                {[0, 72, 144, 216, 288].map((r) => (
                  <ellipse key={r} cx="0" cy="-4" rx="3" ry="4.5" fill="#ffb3cf" transform={`rotate(${r})`} />
                ))}
                <circle r="2.4" fill="#ffe45c" />
              </g>
            ))}
          {stage >= 6 &&
            [
              [100, 92],
              [140, 30],
              [164, 64],
              [72, 62],
            ].map(([x, y], i) => (
              <g key={i}>
                <circle cx={x} cy={y} r="7" fill="#ffd24a" stroke="#c9952a" strokeWidth="1.5" />
                <path d={`M${x} ${y! - 7} q2 -5 6 -5`} stroke={LEAF_DK} strokeWidth="2" fill="none" />
              </g>
            ))}
          {stage >= 6 &&
            [
              [40, 40],
              [200, 30],
              [210, 120],
              [28, 130],
            ].map(([x, y], i) => (
              <path key={i} className={`lab-spark s${i}`} d={`M${x} ${y! - 8} L${x! + 2} ${y! - 2} L${x! + 8} ${y} L${x! + 2} ${y! + 2} L${x} ${y! + 8} L${x! - 2} ${y! + 2} L${x! - 8} ${y} L${x! - 2} ${y! - 2} Z`} fill="#ffe45c" />
            ))}
        </g>
      )}
    </svg>
  );
}

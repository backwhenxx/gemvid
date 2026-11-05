import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import type {SceneProps} from '../Short';
import {Accented} from '../components/Accented';
import {BODY, C, MONO, SLAM, expoOut} from '../lib/theme';
import {clamp01, easeInOut} from '../lib/util';

// Разрез шахты (SVG): земля, два ствола, штрек, вентилятор, линейка глубины, поток воздуха.
// Один и тот же мир во всех сценах — камера продолжает движение с того же места.
// Мир: 1 м = 1,6 ед.; поверхность y=0, глубина 1000 м = y 1600.
const M = 1.6;
const SHAFT_IN = 250;
const SHAFT_OUT = 830;
const HW = 30; // полуширина ствола
const DH = 84; // высота штрека
const FAN_X = SHAFT_OUT + 95;
const BOTTOM = 1000 * M;
const DEEP_X = 1280;
const DEEP_D = 3900 * M;

type Cam = {cx: number; cy: number; s: number};
const CAMS: Record<string, Cam> = {
  top: {cx: 560, cy: -60, s: 1.45},
  whole: {cx: 545, cy: 870, s: 0.52},
  bottom: {cx: 540, cy: 1520, s: 1.6},
  drift: {cx: 540, cy: 1560, s: 2.6},
  fan: {cx: 900, cy: -110, s: 2.6},
  shaft: {cx: 330, cy: 950, s: 0.8},
  intakeTop: {cx: 250, cy: 60, s: 1.7},
  deep: {cx: 780, cy: 3200, s: 0.165},
  deepBottom: {cx: DEEP_X - 60, cy: DEEP_D - 120, s: 1.3},
};
const cam = (c: string | Cam): Cam => (typeof c === 'string' ? CAMS[c] ?? CAMS.whole : c);
const SCREEN_CY = 840;

// Путь воздуха: сверху в левый ствол → по штреку → вверх по правому → вентилятор → диффузор
const AIR: [number, number][] = [
  [SHAFT_IN, -320],
  [SHAFT_IN, BOTTOM - DH / 2],
  [SHAFT_OUT, BOTTOM - DH / 2],
  [SHAFT_OUT, -45],
  [FAN_X + 70, -50],
  [FAN_X + 150, -200],
  [FAN_X + 190, -360],
];
const segLen = AIR.slice(1).map((p, i) => Math.hypot(p[0] - AIR[i][0], p[1] - AIR[i][1]));
const AIR_LEN = segLen.reduce((a, b) => a + b, 0);
const airAt = (s: number): [number, number, number] => {
  let d = ((s % AIR_LEN) + AIR_LEN) % AIR_LEN;
  for (let i = 0; i < segLen.length; i++) {
    if (d <= segLen[i]) {
      const [x0, y0] = AIR[i];
      const [x1, y1] = AIR[i + 1];
      const k = d / segLen[i];
      return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, Math.atan2(y1 - y0, x1 - x0)];
    }
    d -= segLen[i];
  }
  return [...AIR[AIR.length - 1], 0] as [number, number, number];
};

const mix = (a: string, b: string, k: number) => {
  const pa = a.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * clamp01(k))).join(',')})`;
};

type Label = {text: string; x: number; y: number; at?: number; size?: number; color?: string; mono?: boolean; dx?: number; dy?: number};

export const SectionScene: React.FC<SceneProps> = ({scene, durationInFrames}) => {
  const P = scene.props;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const life = Math.max(1, durationInFrames - 10);
  const p = clamp01(frame / life);

  // Камера
  const [c0, c1] = (P.cam ?? ['whole', 'whole']).map(cam);
  const cp = (P.camEase === 'expo' ? expoOut : easeInOut)(clamp01(frame / (life * (P.camDur ?? 1))));
  const lg = (a: number, b: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * cp);
  const cs = lg(c0.s, c1.s);
  const cx = c0.cx + (c1.cx - c0.cx) * cp;
  const cy = c0.cy + (c1.cy - c0.cy) * cp;
  const sx = (x: number) => (x - cx) * cs + 540;
  const sy = (y: number) => (y - cy) * cs + SCREEN_CY;
  const view = `translate(540 ${SCREEN_CY}) scale(${cs}) translate(${-cx} ${-cy})`;

  // Анимация «как в прошлой сцене» продолжается: время режимов идёт от начала сцены
  const deepP = P.deep ? (P.deepFrom ?? 0) + (1 - (P.deepFrom ?? 0)) * easeInOut(clamp01(frame / (life * 0.6))) : 0;
  const deepD = BOTTOM + (DEEP_D - BOTTOM) * deepP;
  const hot = P.hot ? clamp01((P.hotFrom ?? 0) + frame / (life * 0.5)) : 0;
  const ice = P.ice ? easeInOut(clamp01(frame / (life * 0.55))) : 0;
  const heatAir = !!P.heat;

  const strataW = P.deep || P.hot || P.ice ? 4800 : 1800;
  const groundH = P.deep || P.hot || P.ice ? DEEP_D + 600 : BOTTOM + 900;

  // Частицы воздуха
  const parts: React.ReactNode[] = [];
  if (P.air !== false) {
    const N = 64;
    const speed = P.airSpeed ?? 340;
    for (let i = 0; i < N; i++) {
      const s = (i / N) * AIR_LEN + t * speed;
      const [x, y, a] = airAt(s);
      const sd = ((s % AIR_LEN) + AIR_LEN) % AIR_LEN;
      const inDown = sd < segLen[0];
      const k = heatAir ? (inDown ? clamp01((y + 0) / BOTTOM) : 1) : 0;
      const col = heatAir ? mix('F2EEE6', 'FF3B5C', k) : C.paper;
      const L = 58;
      parts.push(
        <line
          key={i}
          x1={x - Math.cos(a) * L}
          y1={y - Math.sin(a) * L}
          x2={x}
          y2={y}
          stroke={col}
          strokeOpacity={0.95}
          strokeWidth={6}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />,
      );
    }
  }

  // Метан: пузырьки из угольного пласта
  const gas: React.ReactNode[] = [];
  if (P.methane) {
    const dil = P.dilute ? easeInOut(clamp01(frame / (life * 0.7))) : 0;
    for (let i = 0; i < 46; i++) {
      const x0 = SHAFT_IN + 50 + ((i * 97) % (SHAFT_OUT - SHAFT_IN - 100));
      const ph = ((i * 37) % 100) / 100;
      const cyc = (t * 0.6 + ph) % 1;
      const y = BOTTOM + 8 - cyc * DH;
      const drift = P.dilute ? cyc * 60 * (1 + dil * 3) : 0;
      gas.push(<circle key={i} cx={x0 + drift} cy={y} r={3.2 + (i % 3)} fill={C.accent} opacity={(1 - cyc) * 0.9 * (1 - dil * 0.85)} />);
    }
  }

  // Ледяная каша по трубе в глубокую шахту
  const iceBits: React.ReactNode[] = [];
  if (P.ice) {
    const pipeLen = (DEEP_D + 120) * ice;
    for (let i = 0; i < 60; i++) {
      const yy = -120 + (((i / 60) * (DEEP_D + 120) + t * 900) % (DEEP_D + 120));
      if (yy - -120 > pipeLen) continue;
      iceBits.push(<rect key={i} x={DEEP_X - 21} y={yy} width={14} height={14} fill={C.ice} transform={`rotate(45 ${DEEP_X - 14} ${yy + 7})`} />);
    }
  }

  // Воздушная «капля», которая сжимается и греется, опускаясь по стволу
  let parcel: React.ReactNode = null;
  let parcelLabel: Label | null = null;
  if (P.parcel) {
    const pp = easeInOut(clamp01(frame / (life * 0.85)));
    const y = -140 + (BOTTOM * 0.8 + 140) * pp;
    const depthM = Math.max(0, y / M);
    const r = 46 - 14 * pp;
    parcel = <ellipse cx={SHAFT_IN} cy={y} rx={r * 1.08} ry={r * (1 - 0.12 * pp)} fill={mix('F2EEE6', 'FF3B5C', pp)} opacity={0.95} />;
    const temp = Math.round(depthM / 100);
    parcelLabel = {text: `+${temp}°`, x: SHAFT_IN, y, dx: 110, size: 64, color: mix('F2EEE6', 'FF3B5C', pp), mono: false};
  }

  // Подписи (в экранных координатах, привязаны к точкам мира)
  const labels: Label[] = [...(P.labels ?? [])];
  if (P.breath) {
    labels.push({text: 'ВДОХ', x: SHAFT_IN, y: -400, at: 0.05, size: 64});
    labels.push({text: 'ВЫДОХ', x: FAN_X + 190, y: -400, at: 0.35, size: 64, color: C.accent});
  }
  if (P.coal) labels.push({text: 'уголь', x: SHAFT_OUT - 120, y: BOTTOM + 40, at: 0.15, size: 34, mono: true, color: C.dim});
  if (P.deep && !P.hot) labels.push({text: '≈ 4 км', x: DEEP_X, y: deepD, dy: 70, at: 0.55, size: 72, color: C.paper});
  if (P.deep && P.ourLabel !== false) labels.push({text: '1 км', x: SHAFT_IN, y: BOTTOM, dy: 70, at: 0.2, size: 56, color: C.dim});
  if (P.hot && !P.ice) labels.push({text: 'камень +66°', x: DEEP_X, y: DEEP_D, dy: -150, at: 0.3, size: 70, color: C.accent});
  if (P.ice) {
    const tA = Math.round(66 - 36 * easeInOut(clamp01((frame / life - 0.45) / 0.45)));
    labels.push({text: 'ледяная каша', x: DEEP_X - 14, y: DEEP_D - 600, dx: -260, at: 0.1, size: 46, color: C.ice});
    labels.push({text: `воздух +${tA}°`, x: DEEP_X, y: DEEP_D, dy: -150, at: 0.0, size: 70, color: tA <= 31 ? C.paper : C.accent});
  }
  if (parcelLabel) labels.push(parcelLabel);

  // Линейка глубины
  const ticks: {y: number; text: string}[] = [];
  const maxD = P.deep || P.hot || P.ice ? 4000 : 1000;
  const step = maxD > 1000 ? 1000 : 200;
  for (let d = step; d <= maxD; d += step) ticks.push({y: d * M, text: `${d >= 1000 ? d / 1000 + ' км' : d + ' м'}`});
  const rulerX = 90;

  // Предмет «окно» + зачёркивание (хук: «ни одного окна»)
  const noWin = P.noWindow ? expoOut(clamp01((frame - (P.noWindowAt ?? 0.35) * life) / 10)) : 0;
  const strike = P.noWindow ? expoOut(clamp01((frame - (P.noWindowAt ?? 0.35) * life - 12) / 10)) : 0;

  const fanRot = t * 900;
  const slamIn = P.slam ? expoOut(clamp01((frame - (P.slamAt ?? 0) * life) / 12)) : 0;

  return (
    <AbsoluteFill style={{backgroundColor: C.bg}}>
      <svg width={1080} height={1920} style={{position: 'absolute', inset: 0}}>
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={C.bg} />
            <stop offset="1" stopColor="#1C1C26" />
          </linearGradient>
          <linearGradient id="heat" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.25" stopColor={C.accent} stopOpacity={0} />
            <stop offset="1" stopColor={C.accent} stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <g transform={view}>
          <rect x={-strataW} y={-1400} width={strataW * 2.5} height={1400} fill="url(#sky)" />
          <rect x={-strataW} y={0} width={strataW * 2.5} height={groundH} fill="#1A1714" />
          {Array.from({length: Math.ceil(groundH / 260)}, (_, i) => (
            <rect key={i} x={-strataW} y={i * 260 + 60} width={strataW * 2.5} height={120} fill="#1F1B17" />
          ))}
          {hot > 0 ? <rect x={-strataW} y={0} width={strataW * 2.5} height={groundH} fill="url(#heat)" opacity={hot * (1 - 0.6 * ice)} /> : null}
          {/* угольный пласт */}
          <rect x={-strataW} y={BOTTOM - 2} width={strataW * 2.5} height={44} fill="#08080B" />
          <line x1={-strataW} x2={strataW * 1.5} y1={BOTTOM - 2} y2={BOTTOM - 2} stroke={C.line} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          {/* стволы и штрек */}
          <rect x={SHAFT_IN - HW} y={-6} width={HW * 2} height={BOTTOM} fill={C.bg} />
          <rect x={SHAFT_OUT - HW} y={-6} width={HW * 2} height={BOTTOM} fill={C.bg} />
          <rect x={SHAFT_IN - HW} y={BOTTOM - DH} width={SHAFT_OUT - SHAFT_IN + HW * 2} height={DH} fill={C.bg} />
          <path
            d={`M ${SHAFT_IN - HW} 0 L ${SHAFT_IN - HW} ${BOTTOM} L ${SHAFT_OUT + HW} ${BOTTOM} L ${SHAFT_OUT + HW} 0
                M ${SHAFT_IN + HW} 0 L ${SHAFT_IN + HW} ${BOTTOM - DH} L ${SHAFT_OUT - HW} ${BOTTOM - DH} L ${SHAFT_OUT - HW} 0`}
            fill="none"
            stroke={C.paper}
            strokeWidth={3}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {/* глубокая шахта (Mponeng) */}
          {P.deep || P.hot || P.ice ? (
            <>
              <rect x={DEEP_X - HW} y={-6} width={HW * 2} height={deepD} fill={C.bg} />
              <path d={`M ${DEEP_X - HW} 0 L ${DEEP_X - HW} ${deepD} L ${DEEP_X + HW} ${deepD} L ${DEEP_X + HW} 0`} fill="none" stroke={C.paper} strokeWidth={3} vectorEffect="non-scaling-stroke" />
            </>
          ) : null}
          {P.ice ? (
            <line x1={DEEP_X - 14} y1={-120} x2={DEEP_X - 14} y2={-120 + (DEEP_D + 120) * ice} stroke={C.ice} strokeWidth={3} strokeOpacity={0.6} vectorEffect="non-scaling-stroke" />
          ) : null}
          {iceBits}
          {/* поверхность */}
          <line x1={-strataW} x2={strataW * 1.5} y1={0} y2={0} stroke={C.paper} strokeWidth={4} vectorEffect="non-scaling-stroke" />
          {/* копёр над левым стволом */}
          <path d={`M ${SHAFT_IN - 60} 0 L ${SHAFT_IN} -190 L ${SHAFT_IN + 60} 0 M ${SHAFT_IN - 38} -70 L ${SHAFT_IN + 38} -70`} fill="none" stroke={C.paper} strokeWidth={3} vectorEffect="non-scaling-stroke" />
          <circle cx={SHAFT_IN} cy={-190} r={18} fill={C.bg} stroke={C.paper} strokeWidth={3} vectorEffect="non-scaling-stroke" />
          {/* вентиляторная над правым стволом */}
          <path
            d={`M ${SHAFT_OUT - HW} -6 L ${SHAFT_OUT - HW} -90 L ${FAN_X + 60} -90 L ${FAN_X + 60} -6 M ${SHAFT_OUT + HW} -6 L ${SHAFT_OUT + HW} -30 L ${FAN_X + 60} -30
                M ${FAN_X + 60} -90 L ${FAN_X + 120} -190 L ${FAN_X + 160} -380 M ${FAN_X + 60} -30 L ${FAN_X + 130} -80 L ${FAN_X + 230} -360`}
            fill="none"
            stroke={C.paper}
            strokeWidth={3}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <g transform={`translate(${FAN_X} -60)`}>
            <circle r={26} fill={C.bg} stroke={P.fanAccent ? C.accent : C.paper} strokeWidth={3} vectorEffect="non-scaling-stroke" />
            <g transform={`rotate(${fanRot})`}>
              {[0, 90, 180, 270].map((a) => (
                <path key={a} transform={`rotate(${a})`} d="M 0 0 C 6 -6 14 -12 18 -4 C 14 0 6 2 0 0 Z" fill={P.fanAccent ? C.accent : C.paper} />
              ))}
            </g>
          </g>
          {P.twin ? (
            <g transform={`translate(${FAN_X} -60)`}>
              <g transform={`translate(0 -110) scale(${expoOut(clamp01((frame - life * 0.25) / 12))})`}>
                <circle r={22} fill={C.bg} stroke={C.paper} strokeWidth={3} vectorEffect="non-scaling-stroke" />
                <g transform={`rotate(${fanRot * 0.15})`}>
                  {[0, 90, 180, 270].map((a) => (
                    <path key={a} transform={`rotate(${a})`} d="M 0 0 C 6 -6 14 -12 18 -4 C 14 0 6 2 0 0 Z" fill={C.paper} opacity={0.6} />
                  ))}
                </g>
              </g>
            </g>
          ) : null}
          {parts}
          {gas}
          {parcel}
          {/* горняк в штреке */}
          {P.miner ? (
            <g transform={`translate(540 ${BOTTOM}) scale(1.3)`}>
              <circle cx={0} cy={-46} r={8} fill={C.paper} />
              <path d="M -10 -50 Q 0 -62 10 -50 Z" fill={C.accent} />
              <rect x={-2} y={-56} width={4} height={4} fill="#FFE9A8" />
              <path d="M 0 -38 L 0 -14 M 0 -14 L -7 0 M 0 -14 L 7 0 M 0 -32 L -9 -20 M 0 -32 L 9 -22" stroke={C.paper} strokeWidth={4.5} strokeLinecap="round" fill="none" />
            </g>
          ) : null}
        </g>

        {/* линейка глубины — в экранных координатах, чтобы текст был читаемым */}
        {P.ruler !== false ? (
          <g>
            <line x1={sx(rulerX)} x2={sx(rulerX)} y1={Math.max(-10, sy(0))} y2={Math.min(1930, sy(maxD * M))} stroke={C.line} strokeWidth={2} />
            {ticks.map((tk, i) => {
              const y = sy(tk.y);
              if (y < 170 || y > 1250) return null;
              const hl = P.rulerHeat ? clamp01((frame / life) * ticks.length * 1.15 - i) : 0;
              return (
                <g key={i}>
                  <line x1={sx(rulerX) - 10} x2={sx(rulerX) + 10} y1={y} y2={y} stroke={C.paper} strokeOpacity={0.6} strokeWidth={2} />
                  <text x={sx(rulerX) + 18} y={y + 10} fill={C.dim} fontFamily={MONO} fontSize={30}>
                    {tk.text}
                  </text>
                  {P.rulerHeat ? (
                    <text x={sx(rulerX) + 18} y={y + 44} fill={C.accent} fontFamily={MONO} fontWeight={700} fontSize={30} opacity={hl}>
                      +1°
                    </text>
                  ) : null}
                </g>
              );
            })}
          </g>
        ) : null}
      </svg>

      {/* подписи, привязанные к объектам */}
      {labels.map((l, i) => {
        const o = expoOut(clamp01((frame - (l.at ?? 0) * life) / 9));
        if (o <= 0) return null;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: sx(l.x) + (l.dx ?? 0),
              top: sy(l.y) + (l.dy ?? 0),
              transform: `translate(-50%, -50%) translateY(${(1 - o) * 16}px)`,
              opacity: o,
              fontFamily: l.mono ? MONO : SLAM,
              fontWeight: l.mono ? 500 : 900,
              fontSize: l.size ?? 48,
              color: l.color ?? C.paper,
              whiteSpace: 'nowrap',
              textShadow: `0 0 18px ${C.bg}, 0 0 4px ${C.bg}`,
            }}
          >
            {l.text}
          </div>
        );
      })}

      {/* окно, которого нет */}
      {P.noWindow ? (
        <div
          style={{
            position: 'absolute',
            left: 540,
            top: 560,
            transform: `translate(-50%, -50%) scale(${0.6 + 0.4 * noWin})`,
            opacity: noWin,
          }}
        >
          <svg width={260} height={260} viewBox="-130 -130 260 260">
            <rect x={-90} y={-100} width={180} height={200} rx={8} fill={C.bg} stroke={C.paper} strokeWidth={10} />
            <path d="M 0 -100 L 0 100 M -90 -10 L 90 -10" stroke={C.paper} strokeWidth={8} />
            <rect x={-70} y={-82} width={56} height={58} fill="#3a5a8a" opacity={0.5} />
            <line x1={-120} y1={120} x2={-120 + 240 * strike} y2={120 - 240 * strike} stroke={C.accent} strokeWidth={16} strokeLinecap="round" />
          </svg>
        </div>
      ) : null}

      {P.dim ? <AbsoluteFill style={{backgroundColor: C.bg, opacity: P.dim * slamIn}} /> : null}
      {P.slam ? (
        <div
          style={{
            position: 'absolute',
            left: 60,
            right: 60,
            top: P.slamY ?? 520,
            transform: `translateY(-50%) scale(${0.85 + 0.15 * slamIn})`,
            opacity: slamIn,
            textAlign: 'center',
            fontFamily: SLAM,
            fontWeight: 900,
            fontSize: P.slamSize ?? 120,
            lineHeight: 1.02,
            color: C.paper,
            textTransform: 'uppercase',
          }}
        >
          {P.kicker ? (
            <div style={{fontFamily: MONO, fontWeight: 500, fontSize: 34, color: C.dim, letterSpacing: 6, marginBottom: 18}}>{P.kicker}</div>
          ) : null}
          <Accented text={P.slam} accent={C.accent} />
        </div>
      ) : null}
      {P.note ? (
        <div style={{position: 'absolute', left: 0, right: 0, top: 1130, textAlign: 'center', fontFamily: BODY, fontWeight: 600, fontSize: 34, color: C.dim, opacity: slamIn || 1}}>
          {P.note}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

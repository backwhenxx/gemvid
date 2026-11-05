import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import type {SceneProps} from '../Short';
import {Accented} from '../components/Accented';
import {C, MONO, SLAM, expoOut} from '../lib/theme';
import {clamp01, easeInOut} from '../lib/util';

// Прибор: вертикальная шкала с критической зоной и стрелкой. Цифра — не плашка, а показание.
// props: title, kicker?, unit, min, max, decimals?, zones:[{from,to,label}], marks:[{v,label}], keys:[[0..1, value], …]
const TOP = 360;
const BOT = 1150;
const BAR_X = 250;
const BAR_W = 64;

export const GaugeScene: React.FC<SceneProps> = ({scene, durationInFrames}) => {
  const {title = '', kicker = '', unit = '%', min = 0, max = 100, decimals = 0, zones = [], marks = [], keys = [[0, min], [1, max]], valueLabel = ''} =
    scene.props;
  const frame = useCurrentFrame();
  const life = Math.max(1, durationInFrames - 10);
  const p = clamp01(frame / life);

  let v = keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [p0, v0] = keys[i];
    const [p1, v1] = keys[i + 1];
    if (p >= p0 && p <= p1) v = v0 + (v1 - v0) * easeInOut((p - p0) / Math.max(1e-6, p1 - p0));
    else if (p > p1) v = v1;
  }
  const yOf = (x: number) => BOT - ((x - min) / (max - min)) * (BOT - TOP);
  const danger = zones.some((z: any) => v >= z.from && v <= z.to);
  const enter = expoOut(clamp01(frame / 12));
  const shown = v.toLocaleString('ru-RU', {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
  const ny = yOf(v);

  return (
    <AbsoluteFill style={{backgroundColor: C.bg}}>
      <div
        style={{
          position: 'absolute',
          left: 60,
          right: 60,
          top: 210,
          textAlign: 'center',
          fontFamily: SLAM,
          fontWeight: 900,
          fontSize: 70,
          color: C.paper,
          textTransform: 'uppercase',
          opacity: enter,
        }}
      >
        {kicker ? <div style={{fontFamily: MONO, fontWeight: 500, fontSize: 30, color: C.dim, letterSpacing: 6, marginBottom: 10}}>{kicker}</div> : null}
        <Accented text={title} accent={C.accent} />
      </div>

      <svg width={1080} height={1920} style={{position: 'absolute', inset: 0, opacity: enter}}>
        <rect x={BAR_X} y={TOP} width={BAR_W} height={BOT - TOP} rx={BAR_W / 2} fill="#1A1A22" stroke={C.line} strokeWidth={2} />
        {zones.map((z: any, i: number) => {
          const y0 = yOf(Math.min(max, z.to));
          const y1 = yOf(Math.max(min, z.from));
          return (
            <g key={i}>
              <rect x={BAR_X + 6} y={y0} width={BAR_W - 12} height={y1 - y0} rx={6} fill={C.hot} opacity={danger ? 0.95 : 0.4} />
              <text x={BAR_X + BAR_W + 24} y={(y0 + y1) / 2 + 12} fill={C.hot} fontFamily={MONO} fontWeight={700} fontSize={34}>
                {z.label}
              </text>
            </g>
          );
        })}
        {/* заполнение до текущего значения */}
        <rect x={BAR_X + 14} y={ny} width={BAR_W - 28} height={Math.max(0, BOT - 10 - ny)} rx={10} fill={danger ? C.hot : C.paper} opacity={0.9} />
        {marks.map((m: any, i: number) => (
          <g key={i}>
            <line x1={BAR_X - 16} x2={BAR_X + BAR_W + 16} y1={yOf(m.v)} y2={yOf(m.v)} stroke={C.paper} strokeWidth={4} strokeDasharray="10 8" />
            <text x={BAR_X - 26} y={yOf(m.v) + 11} textAnchor="end" fill={C.paper} fontFamily={MONO} fontWeight={700} fontSize={32}>
              {m.label}
            </text>
          </g>
        ))}
        {/* стрелка */}
        <path d={`M ${BAR_X + BAR_W + 8} ${ny} l 30 -20 l 0 40 Z`} fill={danger ? C.hot : C.paper} />
      </svg>

      <div
        style={{
          position: 'absolute',
          left: 430,
          top: Math.min(Math.max(ny, 480), 1040),
          transform: 'translateY(-50%)',
          fontFamily: SLAM,
          fontWeight: 900,
          fontSize: 150,
          color: danger ? C.hot : C.paper,
          fontVariantNumeric: 'tabular-nums',
          opacity: enter,
          whiteSpace: 'nowrap',
        }}
      >
        {shown}
        <span style={{fontSize: 80}}>{unit}</span>
        {valueLabel ? <div style={{fontFamily: MONO, fontWeight: 500, fontSize: 32, color: C.dim, marginTop: 6}}>{valueLabel}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

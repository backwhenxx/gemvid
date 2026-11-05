import React, {useMemo} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Word} from '../types';
import {BODY, C, expoOut} from '../lib/theme';

// Караоке-субтитры: по 1–3 слова, будущие — полупрозрачные, сказанные — белые,
// ключевые слова — акцентом. Центр строки на y≈1330 (ниже перекрывает интерфейс YouTube).
const CAPTION_Y = 1330;
const MAX_WORDS = 3;
const MAX_CHARS = 18;

type Chunk = {words: Word[]; start: number; end: number};

const chunkWords = (words: Word[]): Chunk[] => {
  const out: Chunk[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) out.push({words: cur, start: cur[0].start, end: cur[cur.length - 1].end});
    cur = [];
  };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    const chars = cur.reduce((n, x) => n + x.text.length + 1, 0) + w.text.length;
    if (cur.length && (cur.length >= MAX_WORDS || chars > MAX_CHARS || (prev && w.start - prev.end > 0.35))) flush();
    cur.push(w);
    if (/[.!?…,:;—]$/.test(w.text)) flush();
  });
  flush();
  out.forEach((c, i) => {
    const next = out[i + 1];
    c.end = next ? Math.min(Math.max(c.end, next.start), c.end + 0.6) : c.end + 0.4;
  });
  return out;
};

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '');

export const Captions: React.FC<{words: Word[]; keys?: string[]; hideFrom?: number}> = ({words, keys = [], hideFrom}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const chunks = useMemo(() => chunkWords(words), [words]);
  const keyN = useMemo(() => keys.map(norm), [keys]);
  if (hideFrom !== undefined && t >= hideFrom) return null;
  const chunk = chunks.find((c) => t >= c.start && t < c.end);
  if (!chunk) return null;
  const inP = expoOut(interpolate(frame, [chunk.start * fps, chunk.start * fps + 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}));

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          left: 70,
          right: 70,
          top: CAPTION_Y,
          transform: `translateY(calc(-50% + ${(1 - inP) * 18}px))`,
          opacity: inP,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          fontFamily: BODY,
          fontWeight: 800,
          fontSize: 66,
          lineHeight: 1.12,
          textAlign: 'center',
        }}
      >
        {chunk.words.map((w, i) => {
          const spoken = t >= w.start - 0.03;
          const isKey = keyN.some((k) => k && norm(w.text).startsWith(k));
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                margin: '0 0.18em',
                color: isKey && spoken ? C.accent : C.paper,
                opacity: spoken ? 1 : 0.42,
                WebkitTextStroke: `9px ${C.bg}`,
                paintOrder: 'stroke fill',
              }}
            >
              {w.text.replace(/[,;:]$/, '')}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

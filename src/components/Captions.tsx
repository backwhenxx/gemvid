import React, {useMemo} from 'react';
import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Word} from '../types';
import {FONT} from '../lib/util';

// Субтитры: 1–3 слова, текущее слово подсвечено. Центр блока на y≈1330 —
// ниже их перекрывает интерфейс YouTube.
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
  // Держим фразу на экране до начала следующей (без мигания пустотой на коротких паузах)
  out.forEach((c, i) => {
    const next = out[i + 1];
    c.end = next ? Math.min(Math.max(c.end, next.start), c.end + 0.6) : c.end + 0.4;
  });
  return out;
};

export const Captions: React.FC<{words: Word[]; accent: string}> = ({words, accent}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const chunks = useMemo(() => chunkWords(words), [words]);
  const chunk = chunks.find((c) => t >= c.start && t < c.end);
  if (!chunk) return null;

  const pop = spring({frame: frame - Math.round(chunk.start * fps), fps, config: {damping: 14, stiffness: 220}});

  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      <div
        style={{
          position: 'absolute',
          left: 60,
          right: 60,
          top: CAPTION_Y,
          transform: `translateY(-50%) scale(${0.82 + 0.18 * pop})`,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '0 0',
          fontFamily: FONT,
          fontWeight: 900,
          fontSize: 92,
          lineHeight: 1.08,
          textTransform: 'uppercase',
          textAlign: 'center',
        }}
      >
        {chunk.words.map((w, i) => {
          const active = t >= w.start && t < w.end + 0.05;
          const spoken = t >= w.start;
          return (
            <span
              key={i}
              style={{
                color: active ? '#FFE14D' : spoken ? '#ffffff' : 'rgba(255,255,255,0.85)',
                WebkitTextStroke: '10px #000',
                paintOrder: 'stroke fill',
                textShadow: active ? `0 0 28px ${accent}` : '0 6px 18px rgba(0,0,0,0.6)',
                transform: active ? 'scale(1.05)' : 'none',
                display: 'inline-block',
                margin: '0 0.22em',
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

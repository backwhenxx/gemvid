import {staticFile} from 'remotion';
import {loadFont} from '@remotion/google-fonts/Montserrat';

export const {fontFamily: FONT} = loadFont('normal', {
  weights: ['600', '800', '900'],
  subsets: ['cyrillic', 'latin'],
});

export const W = 1080;
export const H = 1920;

// Детерминированный генератор случайных чисел: один и тот же кадр всегда одинаковый
export const rng = (seed: number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1_000_000) / 1_000_000;
  };
};

// Файл эпизода: сначала ищем в папке эпизода, абсолютные URL отдаём как есть
export const asset = (base: string, file: string) =>
  /^https?:\/\//.test(file) ? file : staticFile(`${base}/${file}`);

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
export const easeInOut = (x: number) => {
  x = clamp01(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

export const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

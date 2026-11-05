import {loadFont as loadUnbounded} from '@remotion/google-fonts/Unbounded';
import {loadFont as loadInter} from '@remotion/google-fonts/Inter';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';

// Фирменный стиль «ШТА?!»: тёмный фон, «бумага», один розовый акцент. Без неона и свечений.
export const C = {
  bg: '#0E0E12',
  bg2: '#16161D',
  paper: '#F2EEE6',
  dim: '#8A8794',
  line: 'rgba(242,238,230,0.18)',
  accent: '#FF3B5C',
  ice: '#9BD8FF',
};

export const {fontFamily: SLAM} = loadUnbounded('normal', {weights: ['700', '900'], subsets: ['cyrillic', 'latin']});
export const {fontFamily: BODY} = loadInter('normal', {weights: ['600', '800'], subsets: ['cyrillic', 'latin']});
export const {fontFamily: MONO} = loadMono('normal', {weights: ['500', '700'], subsets: ['cyrillic', 'latin']});

// expo-out для входов, ease-in для выходов
export const expoOut = (x: number) => (x >= 1 ? 1 : x <= 0 ? 0 : 1 - Math.pow(2, -10 * x));
export const easeIn = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x);

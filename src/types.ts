export type Word = {text: string; start: number; end: number};

export type SceneType =
  | 'hook'
  | 'number'
  | 'model3d'
  | 'physics3d'
  | 'physics2d'
  | 'draw'
  | 'image'
  | 'video'
  | 'outro'
  | 'section'
  | 'gauge'
  | 'fan3d'
  | 'slam'
  | 'dam'
  | 'trench';

export type TimedScene = {
  type: SceneType;
  start: number; // сек
  end: number; // сек
  say: string;
  props: Record<string, any>;
};

export type SfxCue = {file: string; at: number; volume: number};

export type Timeline = {
  fps: number;
  durationInFrames: number;
  base: string; // папка эпизода внутри public/, например "ep/demo"
  voice: string | null;
  words: Word[];
  scenes: TimedScene[];
  sfx: SfxCue[];
  music: {file: string; volume: number} | null;
  accent: string;
  keys?: string[]; // слова, которые в субтитрах подсвечиваются акцентом
  brand?: boolean; // пузырь «ШТА?!» в углу (по умолчанию да)
  palette?: Record<string, string>; // переопределение цветов темы
  captionStyle?: 'karaoke' | 'word'; // word — по одному слову по центру
  ambience?: {file: string; from: number; to: number; volume: number}[]; // фоновые звуки (Openverse)
};

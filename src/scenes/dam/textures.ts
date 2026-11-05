import * as THREE from 'three';
import {rng} from '../../lib/util';

// Процедурные текстуры (рисуются в canvas, детерминированно): гравий, почва, скала, бетон, глина, облака
const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
};

const tex = (c: HTMLCanvasElement, rx = 1, ry = 1) => {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

export const gravelTexture = (rx = 1, ry = 1) => {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#8b7b64';
  g.fillRect(0, 0, 512, 512);
  const r = rng(11);
  const cols = ['#6f6150', '#a39278', '#5e5245', '#b8a88e', '#7d6e5a', '#968670', '#4f463c'];
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    const s = 1 + r() * 3.2;
    g.beginPath();
    g.ellipse(r() * 512, r() * 512, s, s * (0.6 + r() * 0.5), r() * 3, 0, 6.3);
    g.fill();
  }
  return tex(c, rx, ry);
};

export const topsoilTexture = (rx = 1, ry = 1) => {
  const [c, g] = canvas(512, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#b45f22');
  grad.addColorStop(1, '#9a4c1a');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  const r = rng(23);
  for (let i = 0; i < 70; i++) {
    const x = r() * 512;
    g.strokeStyle = `rgba(70,30,8,${0.25 + r() * 0.35})`;
    g.lineWidth = 1 + r() * 2.5;
    g.beginPath();
    g.moveTo(x, r() * 30);
    let y = 0;
    let xx = x;
    while (y < 256) {
      y += 12 + r() * 20;
      xx += (r() - 0.5) * 8;
      g.lineTo(xx, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 2500; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(255,190,120,0.18)' : 'rgba(60,25,5,0.22)';
    g.fillRect(r() * 512, r() * 256, 2, 2);
  }
  return tex(c, rx, ry);
};

export const rockTexture = (rx = 1, ry = 1) => {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#6d6c70';
  g.fillRect(0, 0, 512, 512);
  const r = rng(37);
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.12)';
    const s = 2 + r() * 6;
    g.fillRect(r() * 512, r() * 512, s, s * 0.6);
  }
  // трещины — горизонтальные ломаные и короткие вертикальные
  g.strokeStyle = 'rgba(30,30,34,0.85)';
  for (let k = 0; k < 7; k++) {
    g.lineWidth = 2 + r() * 1.5;
    let y = (k + 0.5) * (512 / 7) + (r() - 0.5) * 20;
    g.beginPath();
    g.moveTo(-10, y);
    for (let x = 0; x <= 520; x += 40 + r() * 50) {
      y += (r() - 0.5) * 24;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) {
    const x = r() * 512;
    const y = r() * 512;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 12, y + 20 + r() * 40);
    g.stroke();
  }
  return tex(c, rx, ry);
};

export const clayTexture = (rx = 1, ry = 1) => {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#7e4433';
  g.fillRect(0, 0, 256, 256);
  const r = rng(51);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(160,90,70,0.35)' : 'rgba(50,20,12,0.3)';
    g.fillRect(r() * 256, r() * 256, 2 + r() * 3, 1 + r() * 2);
  }
  return tex(c, rx, ry);
};

export const concreteTexture = (rx = 1, ry = 1) => {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#8f877c';
  g.fillRect(0, 0, 256, 256);
  const r = rng(63);
  for (let i = 0; i < 3500; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
  }
  return tex(c, rx, ry);
};

export const grassTexture = (rx = 1, ry = 1) => {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#86c45a';
  g.fillRect(0, 0, 256, 256);
  const r = rng(71);
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(160,220,110,0.4)' : 'rgba(60,120,40,0.25)';
    g.fillRect(r() * 256, r() * 256, 2, 2);
  }
  return tex(c, rx, ry);
};

// Небо: голубой градиент к горизонту
export const skyTexture = () => {
  const [c, g] = canvas(16, 512);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#6f98cf');
  grad.addColorStop(0.55, '#a9c6e6');
  grad.addColorStop(1, '#dfe9f2');
  g.fillStyle = grad;
  g.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// Облако: несколько мягких белых кругов с лёгкой серой тенью снизу
export const cloudTexture = (seed: number) => {
  const [c, g] = canvas(512, 256);
  const r = rng(seed);
  const blobs = Array.from({length: 9}, () => ({x: 90 + r() * 330, y: 110 + r() * 60, s: 45 + r() * 55}));
  blobs.forEach((b) => {
    const gr = g.createRadialGradient(b.x, b.y + 12, 0, b.x, b.y + 12, b.s);
    gr.addColorStop(0, 'rgba(170,180,200,0.55)');
    gr.addColorStop(1, 'rgba(170,180,200,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(b.x, b.y + 12, b.s, 0, 6.3);
    g.fill();
  });
  blobs.forEach((b) => {
    const gr = g.createRadialGradient(b.x, b.y - 6, 0, b.x, b.y - 6, b.s);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.95)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(b.x, b.y - 6, b.s, 0, 6.3);
    g.fill();
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// Вода: светлые блики-штрихи для анимации смещением
export const waterTexture = () => {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#7fb7e6';
  g.fillRect(0, 0, 512, 512);
  const r = rng(91);
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.25 + r() * 0.35})`;
    g.lineWidth = 2 + r() * 3;
    const x = r() * 512;
    const y = r() * 512;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 20, y - 6, x + 40 + r() * 40, y);
    g.stroke();
  }
  return tex(c, 3, 3);
};

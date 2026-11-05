import * as THREE from 'three';
import {rng} from '../../lib/util';

// ---------- общие помощники ----------
export const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
};

const cv = (w: number, h: number) => {
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

// Разрез земли: красно-коричневая глина с вертикальными потёками и комками
export const earthCutTexture = () => {
  const [c, g] = cv(512, 512);
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#8e4a25');
  gr.addColorStop(1, '#7a3c1d');
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 512);
  const r = rng(3);
  for (let i = 0; i < 120; i++) {
    g.strokeStyle = `rgba(55,22,8,${0.2 + r() * 0.35})`;
    g.lineWidth = 1 + r() * 3;
    let x = r() * 512;
    let y = r() * 80;
    g.beginPath();
    g.moveTo(x, y);
    while (y < 512) {
      y += 14 + r() * 26;
      x += (r() - 0.5) * 10;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(200,120,70,0.16)' : 'rgba(40,15,5,0.2)';
    g.fillRect(r() * 512, r() * 512, 1 + r() * 3, 1 + r() * 3);
  }
  return tex(c, 1 / 4, 1 / 4);
};

// Грязь сверху (нейтральная мира): серо-коричневая, с лужицами и комками
export const mudTexture = () => {
  const [c, g] = cv(512, 512);
  g.fillStyle = '#6e5b47';
  g.fillRect(0, 0, 512, 512);
  const r = rng(9);
  for (let i = 0; i < 160; i++) {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    const x = r() * 512;
    const y = r() * 512;
    const s = 10 + r() * 40;
    g.save();
    g.translate(x, y);
    g.scale(s, s * (0.5 + r() * 0.5));
    gr.addColorStop(0, r() > 0.5 ? 'rgba(90,72,55,0.55)' : 'rgba(130,108,85,0.4)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, 1, 0, 6.3);
    g.fill();
    g.restore();
  }
  for (let i = 0; i < 5000; i++) {
    g.fillStyle = r() > 0.5 ? 'rgba(150,128,100,0.18)' : 'rgba(40,30,20,0.2)';
    g.fillRect(r() * 512, r() * 512, 2, 2);
  }
  return tex(c, 1 / 6, 1 / 6);
};

// Мешковина
export const burlapTexture = () => {
  const [c, g] = cv(128, 128);
  g.fillStyle = '#d3c6a2';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(120,100,70,0.25)';
  for (let i = 0; i < 128; i += 3) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 128);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(128, i);
    g.stroke();
  }
  return tex(c, 2, 2);
};

// Дерево (доски)
export const woodTexture = () => {
  const [c, g] = cv(256, 64);
  g.fillStyle = '#b89a72';
  g.fillRect(0, 0, 256, 64);
  const r = rng(13);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(90,62,35,${0.15 + r() * 0.25})`;
    g.lineWidth = 1 + r() * 1.5;
    const y = r() * 64;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(80, y + (r() - 0.5) * 8, 170, y + (r() - 0.5) * 8, 256, y);
    g.stroke();
  }
  return tex(c, 1, 1);
};

// Небо: пасмурное, серо-голубое
export const overcastSky = () => {
  const [c, g] = cv(16, 512);
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#8ea4c0');
  gr.addColorStop(0.6, '#b5c2d1');
  gr.addColorStop(1, '#d4d9de');
  g.fillStyle = gr;
  g.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// Клуб дыма
export const smokeTexture = () => {
  const [c, g] = cv(256, 256);
  const r = rng(21);
  for (let i = 0; i < 14; i++) {
    const x = 70 + r() * 116;
    const y = 70 + r() * 116;
    const s = 40 + r() * 50;
    const gr = g.createRadialGradient(x, y, 0, x, y, s);
    gr.addColorStop(0, 'rgba(70,70,74,0.55)');
    gr.addColorStop(1, 'rgba(70,70,74,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, s, 0, 6.3);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

// ---------- солдат (свой, низкополигональный) ----------
export type Soldier = THREE.Group & {userData: {legL: THREE.Object3D; legR: THREE.Object3D; armL: THREE.Object3D; armR: THREE.Object3D; body: THREE.Object3D}};

export const makeSoldier = (mats: {cloth: THREE.Material; skin: THREE.Material; helmet: THREE.Material; boot: THREE.Material}) => {
  const g = new THREE.Group() as Soldier;
  const body = new THREE.Group();
  g.add(body);
  const limb = (len: number, rad: number, mat: THREE.Material) => {
    const piv = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(rad, len, 4, 10), mat);
    m.position.y = -len / 2 - rad * 0.4;
    piv.add(m);
    return piv;
  };
  const legL = limb(0.7, 0.085, mats.cloth);
  const legR = limb(0.7, 0.085, mats.cloth);
  legL.position.set(-0.1, 0.92, 0);
  legR.position.set(0.1, 0.92, 0);
  [legL, legR].forEach((l) => {
    const b = new THREE.Mesh(box(-0.07, 0.07, -0.08, 0.06, -0.06, 0.14), mats.boot);
    b.position.y = -0.84;
    l.add(b);
    body.add(l);
  });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.42, 4, 12), mats.cloth);
  torso.position.y = 1.2;
  torso.scale.set(1, 1, 0.72);
  body.add(torso);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 16), mats.boot);
  belt.position.y = 0.98;
  belt.scale.set(1, 1, 0.75);
  body.add(belt);
  const armL = limb(0.55, 0.065, mats.cloth);
  const armR = limb(0.55, 0.065, mats.cloth);
  armL.position.set(-0.27, 1.43, 0);
  armR.position.set(0.27, 1.43, 0);
  [armL, armR].forEach((a) => {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mats.skin);
    h.position.y = -0.68;
    a.add(h);
    body.add(a);
  });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mats.skin);
  head.position.y = 1.66;
  head.scale.set(0.92, 1.08, 0.95);
  body.add(head);
  // каска-«тарелка»
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.025, 24), mats.helmet);
  brim.position.y = 1.75;
  body.add(brim);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.helmet);
  dome.position.y = 1.755;
  dome.scale.set(1, 0.7, 1);
  body.add(dome);
  g.userData = {legL, legR, armL, armR, body};
  return g;
};

// Поза: walk (шаг), stand, sit, crouch, peek (руки вверх к перископу), carry (ведро)
export const pose = (s: Soldier, kind: string, t: number) => {
  const {legL, legR, armL, armR, body} = s.userData;
  [legL, legR, armL, armR].forEach((o) => o.rotation.set(0, 0, 0));
  body.position.set(0, 0, 0);
  body.rotation.set(0, 0, 0);
  if (kind === 'walk' || kind === 'carry') {
    const a = Math.sin(t * 6.5) * 0.55;
    legL.rotation.x = a;
    legR.rotation.x = -a;
    armL.rotation.x = -a * 0.8;
    armR.rotation.x = kind === 'carry' ? 0.15 : a * 0.8;
    body.position.y = Math.abs(Math.cos(t * 6.5)) * 0.03;
  } else if (kind === 'sit') {
    legL.rotation.x = -1.45;
    legR.rotation.x = -1.45;
    body.position.y = -0.45;
    armL.rotation.x = -1.0;
    armR.rotation.x = -0.9 + Math.sin(t * 2) * 0.15;
  } else if (kind === 'crouch') {
    legL.rotation.x = -0.9;
    legR.rotation.x = 0.4;
    body.position.y = -0.35;
    body.rotation.x = 0.35;
    armL.rotation.x = -0.6;
    armR.rotation.x = -0.6;
  } else if (kind === 'peek') {
    armL.rotation.x = -2.3;
    armR.rotation.x = -2.1;
  } else if (kind === 'aim') {
    armL.rotation.x = -1.45;
    armR.rotation.x = -1.3;
    armL.rotation.z = 0.25;
  } else {
    armL.rotation.z = 0.08;
    armR.rotation.z = -0.08;
    armL.rotation.x = Math.sin(t * 1.3) * 0.04;
  }
};

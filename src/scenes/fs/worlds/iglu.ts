// @ts-nocheck
// Мир «Как устроен иглу» (22.11): тундра в снегу, иглу из снежных блоков, разрезанный пополам плоскостью z=0.
// Внутри: лежанка с мехами, лампа-жирник, тёплый воздух под куполом, вход-тоннель ниже лежанки (траншея),
// холодный воздух стекает в тоннель. Ледяная корка на внутренней стене.
import * as THREE from 'three';
import {makeKit, cutFace, hills, rnd, sm, lerp, hash3, vnoise} from '../kit';

const R = 3.0, WT = 0.45, TX0 = 2.2, TX1 = 7.0, TZ = 0.75, TD = 0.65;
const trench = (x, z) => sm((x - TX0) / 0.3) * sm((TX1 - x) / 0.3) * sm((TZ + z) / 0.2);
export function S(x, z) {
  const near = sm((Math.hypot(x - 1.5, z + 1) - 6) / 4);
  return near * (0.25 * Math.sin(x * 0.3 + z * 0.2) + 0.2 * vnoise(x * 0.2, 1, z * 0.2)) + 1.2 * sm((-z - 16) / 12) - TD * trench(x, z);
}
const B = [(x) => S(x, 0), (x) => Math.min(S(x, 0), -0.9), (x) => Math.min(S(x, 0), -2.2) - 0.1 * Math.sin(x), (x) => -5 + 0.3 * Math.sin(x * 0.4), (x) => -10 + 0.4 * Math.sin(x * 0.3), () => -30];
const LAYERS = ['snow', 'firn', 'frozen', 'gravel', 'rock'];
export const T = {
  out: [-4.5, 3.2, -2], wall: [-R * 0.72, R * 0.62, -0.1], lamp: [1.3, 1.0, -1.0], warm: [0, 2.3, -1.2], bed: [-1.2, 0.85, -1.4],
  door: [4.6, -0.3, -0.35], cold: [3.6, -0.35, -0.3], glaze: [-R * 0.55, R * 0.78, -0.4], vent: [0, R + 0.2, -0.5],
};
export const CAMS = {
  hook: {pos: [8.5, 2.2, 6.0], look: [2.2, 1.5, -1.8], fov: 40},
  hook2: {pos: [6.5, 2.6, 9.5], look: [1.5, 1.5, -1.6], fov: 40},
  wide: {pos: [1.6, 2.8, 13.5], look: [0.8, 1.4, -1.5], fov: 40},
  wall: {pos: [-1.6, 2.6, 8.0], look: [-1.4, 1.6, -1.0], fov: 40},
  lamp: {pos: [1.0, 2.0, 7.0], look: [0.4, 1.4, -1.2], fov: 40},
  tunnel: {pos: [5.0, 1.2, 7.5], look: [3.4, 0.1, -0.6], fov: 40},
  glaze: {pos: [-0.5, 2.6, 8.5], look: [-0.6, 1.7, -1.3], fov: 40},
  night: {pos: [5.5, 3.4, 17], look: [1.4, 1.4, -2], fov: 40},
  cover: {pos: [2.2, 2.2, 10.5], look: [1.0, 1.3, -1.4], fov: 40},
};

export function build(scene, sky) {
  const K = makeKit(scene, {firn: '#dfe6ee', frozen: '#8a7b6e', gravel: '#9a948c', snowB: '#eef3f7', snowShade: '#cfdbe6', fur: '#7a5a3e', fur2: '#a88560', lampStone: '#8c8580', flame: '#ffc04d', sledW: '#9a6a44'});
  const {add, box, cyl, blob, fir, cloud} = K;
  cutFace(K, LAYERS, (k, x) => B[k](x), -30, 30, [], 0, 0.25);
  // земля: мелкая сетка (траншея тоннеля), снег; в траншее чуть темнее
  {
    const xs = [], zs = []; for (let x = -30; x <= 30 + 1e-6; x += 0.25) xs.push(x); for (let z = 0; z >= -30 - 1e-6; z -= z > -4 ? 0.25 : 1.0) zs.push(z);
    const P = [], I = [], C = [], c = new THREE.Color(), c1 = new THREE.Color('#f3f6f9'), c2 = new THREE.Color('#c9d6e3');
    for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) { const x = xs[i], z = zs[j], y = S(x, z); P.push(x, y, z); c.copy(c1).lerp(c2, Math.min(1, Math.max(0, -y / TD)) * 0.9 + (hash3(i, j, 4) - 0.5) * 0.06); C.push(c.r, c.g, c.b); }
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) { const a = j * xs.length + i, b = a + 1, cc = a + xs.length, d = cc + 1; I.push(a, b, cc, b, d, cc); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I);
    const ng = g.toNonIndexed(); ng.computeVertexNormals();
    const m = new THREE.Mesh(ng, new THREE.MeshStandardMaterial({vertexColors: true, flatShading: true, roughness: 1, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.06})); m.receiveShadow = true; scene.add(m);
  }
  hills(K, 'snow', -29.5, -80, (x, z) => S(x, -30) + 6 * sm((-z - 30) / 30) * (0.55 + 0.45 * Math.sin(x * 0.07 + 0.8)) + vnoise(x * 0.12, 0, z * 0.12), 3);
  hills(K, 'hillFar', -76, -170, (x, z) => 3 + 16 * sm((-z - 76) / 60) * (0.55 + 0.45 * Math.sin(x * 0.04 + 2.5)) + 2 * vnoise(x * 0.06, 3, z * 0.06), 6);
  { const r = rnd(3); for (let i = 0; i < 14; i++) { const x = lerp(-28, 28, r()), y = lerp(-8, -2.6, r()), rr = 0.18 + r() * 0.25; add(blob(rr, i, 0.25, 1.3, 1.3, 0.8, 0.5), 'stone', x, y, 0.02, {cast: false, rot: [0, 0, r() * 3]}); } }

  // купол из блоков: кольца, задняя половина (z<0); проём тоннеля справа внизу
  const BH = 0.5, NR = 9;
  for (let k = 0; k < NR; k++) {
    const ph0 = k / NR * (Math.PI / 2) * 0.96, ph1 = (k + 1) / NR * (Math.PI / 2) * 0.96, ph = (ph0 + ph1) / 2;
    const rr = R * Math.cos(ph), y = R * Math.sin(ph), h = R * (ph1 - ph0) * 0.97;
    const n = Math.max(3, Math.round(Math.PI * rr / 0.85)), off = (k % 2) * 0.5;
    for (let i = 0; i < n; i++) {
      const th = (i + 0.5 + off * (i < n - 1 ? 1 : 0)) / n * Math.PI; if (th > Math.PI - 0.04) continue;
      if (y < 1.25 && th < 0.36) continue; // проём входа
      const w = Math.PI * rr / n * 0.95, m = box(w, h, WT, (i + k) % 3 ? 'snowB' : 'snow', Math.cos(th) * rr, y, -Math.sin(th) * rr, {r: 0.05});
      m.rotation.order = 'YXZ'; m.rotation.y = Math.PI / 2 + th; m.rotation.x = -ph;
      // крайние блоки у плоскости разреза — не вылезают вперёд
      if (th < 0.25 || th > Math.PI - 0.25) m.scale.x = 0.55;
    }
  }
  add(new THREE.CylinderGeometry(0.28, 0.4, 0.3, 10, 1, true), 'snowB', 0, R * 0.995, -0.42, {}); // продух наверху
  // тоннель: полуарки из блоков вдоль x, пол — траншея
  for (let x = TX0 + 0.6; x < TX1 - 0.1; x += 0.62) for (let i = 0; i < 4; i++) {
    const th = (i + 0.5) / 4 * Math.PI / 2, r0 = 0.95, m = box(0.58, 0.42, 0.32, (i + Math.round(x * 2)) % 2 ? 'snow' : 'snowB', x, -TD + 0.1 + Math.sin(th) * r0 + 0.25, -Math.cos(th) * r0 * 0.75, {r: 0.04});
    m.rotation.x = th - Math.PI / 2;
  }
  // лежанка из снега + меха, ступень к полу
  box(4.4, 0.7, 2.0, 'snowShade', -0.3, 0.35, -1.65, {r: 0.08});
  box(1.7, 0.1, 1.3, 'fur', -1.2, 0.75, -1.6, {r: 0.05, rot: [0, 0.08, 0]}); box(1.3, 0.1, 1.1, 'fur2', 0.35, 0.76, -1.8, {r: 0.05, rot: [0, -0.12, 0]}); box(0.7, 0.22, 0.45, 'fur2', -1.6, 0.9, -2.0, {r: 0.1});
  // лампа-жирник на подставке + пламя
  const lamp = new THREE.Group(); lamp.position.set(1.35, 0.72, -1.0); scene.add(lamp);
  { const g = new THREE.CylinderGeometry(0.32, 0.22, 0.12, 12, 1, false, 0, Math.PI); add(g, 'lampStone', 0, 0.06, 0, {parent: lamp, rot: [0, Math.PI / 2, 0]}); }
  const flames = []; for (let i = 0; i < 4; i++) { const f = add(new THREE.ConeGeometry(0.05, 0.22, 6), 'flame', -0.12 + i * 0.08, 0.22, 0.05, {parent: lamp, mat: {emissive: 1, ei: 1.8}, cast: false}); flames.push(f); }
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshBasicMaterial({color: '#ffcf7a', transparent: true, opacity: 0, depthWrite: false})); glow.position.set(1.35, 1.0, -1.0); glow.renderOrder = 9; scene.add(glow);
  // тёплый воздух: три вложенные шапки под куполом (задняя половина), холодный — в траншее и у пола
  const warm = [0.62, 0.98, 1.28].map((tl, i) => { const g = new THREE.SphereGeometry(R - WT * 0.5 - 0.32, 20, 10, Math.PI, Math.PI, 0, tl); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color: '#f2a35a', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide})); m.renderOrder = 7; m.position.z = -0.08; scene.add(m); return m; });
  const coldM = new THREE.MeshBasicMaterial({color: '#6aa6e0', transparent: true, opacity: 0, depthWrite: false});
  const coldT = new THREE.Mesh(new THREE.BoxGeometry(TX1 - TX0 - 0.3, 1, TZ - 0.15), coldM); coldT.renderOrder = 7; scene.add(coldT);
  const coldF = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 0.9), coldM); coldF.renderOrder = 7; scene.add(coldF);
  // ледяная корка изнутри
  const glazeM = new THREE.MeshBasicMaterial({color: '#bfe3f5', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide});
  { const m = new THREE.Mesh(new THREE.SphereGeometry(R - WT * 0.5 - 0.24, 24, 12, Math.PI, Math.PI, 0, Math.PI / 2 * 0.93), glazeM); m.position.z = -0.06; m.renderOrder = 6; scene.add(m); }

  // снаружи: второй иглу, штабель блоков, лыжи, нарты, пила в снегу, ветряной снег
  { const x = -9.5, z = -9; add(new THREE.SphereGeometry(1.8, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 'snowB', x, -0.05, z, {}); box(1.0, 0.8, 1.2, 'snowB', x + 1.9, 0.35, z + 0.4, {r: 0.2}); }
  for (let i = 0; i < 6; i++) box(0.75, 0.42, 0.4, 'snowB', -5.4 + (i % 3) * 0.8, 0.22 + Math.floor(i / 3) * 0.44, -2.6, {r: 0.04, rot: [0, 0.1 * (i % 2), 0]});
  for (const dz of [-0.12, 0.12]) { const m = box(0.09, 1.9, 0.03, 'red', -6.6, 0.85, -4.2 + dz, {r: 0.02}); m.rotation.z = dz * 2; }
  { const g = new THREE.Group(); g.position.set(8.2, 0.05, -4.5); g.rotation.y = -0.4; scene.add(g); for (const dz of [-0.4, 0.4]) box(2.4, 0.08, 0.08, 'sledW', 0, 0.06, dz, {parent: g}); for (let i = 0; i < 5; i++) box(0.12, 0.08, 0.95, 'sledW', -1.0 + i * 0.5, 0.25, 0, {parent: g}); box(1.0, 0.45, 0.7, 'fur', 0.3, 0.5, 0, {parent: g, r: 0.1}); }
  { const m = box(0.5, 0.06, 0.02, 'dark', -4.1, 0.55, -1.8, {}); m.rotation.z = 1.2; box(0.08, 0.8, 0.02, 'gravel', -4.0, 0.4, -1.8, {rot: [0, 0, 0.3]}); }
  { const r = rnd(9); for (let i = 0, n = 0; i < 100 && n < 10; i++) { const x = lerp(-28, 28, r()), z = lerp(-28, -14, r()); fir(x, S(x, z) - 0.05, z, 0.7 + r() * 0.4, true); n++; } }
  const flakes = []; for (let i = 0; i < 40; i++) flakes.push(add(new THREE.SphereGeometry(0.035, 6, 4), 'white', 0, 0, 0, {cast: false}));
  const clouds = [cloud(sky, -12, 18, -40, 2.4, 51), cloud(sky, 9, 21, -48, 2.8, 52), cloud(sky, 22, 17, -36, 1.8, 53)];

  // q: lamp 0..1, warm 0..1, cold 0..1, flare 0..1, glaze 0..1
  const animate = (q) => {
    const t = q.t, lp = sm(q.lamp ?? 0), wm = sm(q.warm ?? 0), cd = sm(q.cold ?? 0), fl = sm(q.flare ?? 0), gz = sm(q.glaze ?? 0);
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.25 + 0.06 * i); });
    flames.forEach((f, i) => { const s = lp * (1 + 0.8 * fl) * (0.85 + 0.15 * Math.sin(t * 9 + i * 2.1)); f.visible = lp > 0.02; f.scale.set(1 + fl * 0.4, Math.max(0.01, s), 1 + fl * 0.4); });
    glow.material.opacity = 0.14 * lp * (1 + 0.6 * fl); glow.scale.setScalar(1 + fl * 0.5);
    warm.forEach((m, i) => { m.material.opacity = 0.12 * sm(wm * 3 - i); m.visible = m.material.opacity > 0.003; });
    const hT = 0.05 + 0.6 * cd; coldT.scale.y = hT; coldT.position.set((TX0 + TX1) / 2 + 0.1, -TD + 0.02 + hT / 2, -(TZ - 0.15) / 2 - 0.02);
    const hF = 0.02 + 0.28 * sm(cd * 1.5 - 0.5); coldF.scale.y = hF; coldF.position.set(1.9, 0.02 + hF / 2, -0.5);
    coldM.opacity = 0.35 * cd; coldT.visible = coldF.visible = cd > 0.01;
    glazeM.opacity = 0.45 * gz;
    flakes.forEach((m, i) => { const u = ((t * 0.08 + hash3(i, 1, 1)) % 1 + 1) % 1; m.position.set(lerp(-14, 14, u), 0.3 + 3 * hash3(i, 2, 1) + 0.2 * Math.sin(t + i), -2 - 12 * hash3(i, 3, 1)); });
  };
  animate({t: 0});
  return {animate, T, wins: K.wins, lamps: K.lamps};
}

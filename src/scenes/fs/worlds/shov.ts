// @ts-nocheck
// Мир «Почему мост летом длиннее» (25.11): речная долина, срез спереди (берега, река в разрезе), стальной мост на двух
// опорах. Левый конец закреплён (шарнир), правый — на катках, на въезде — гребёнка деформационного шва.
// heat −1 (зима) … +1 (лето): пролёт удлиняется (в кадре смещение увеличено), зубья сходятся/расходятся, катки крутятся.
import * as THREE from 'three';
import {makeKit, cutFace, hills, rnd, sm, lerp, hash3, vnoise} from '../kit';

const ZB = -3, XL = -14, XR = 14, DY = 3.6, DEX = 0.55; // верх полотна; полуход конца (в кадре, увеличен)
export function S(x, z) {
  const ch = sm((12 - Math.abs(x)) / 3.5);
  return -3.2 * ch + 0.15 * Math.sin(x * 0.3 + z * 0.2) * (1 - ch) + 1.0 * sm((-z - 20) / 12) + 0.12 * vnoise(x * 0.2, 1, z * 0.2) * (1 - ch);
}
const WL = -1.7;
const LV = [null, -0.35, -1.5, -4.5, -9, -30];
const LAYERS = ['soil', 'soil', 'clay', 'sand', 'rock'];
const bound = (k, x) => (k === 0 ? S(x, 0) : Math.min(S(x, 0) - 0.2 * k, LV[k] + 0.1 * Math.sin(x + k)));
export const T = {
  deck: [0, DY + 0.3, ZB + 1.5], fixed: [XL + 0.3, DY - 1.1, ZB + 1.4], roll: [XR - 0.2, DY - 1.25, ZB + 1.4], joint: [XR + 0.1, DY + 0.1, ZB + 1.2],
  therm: [XR + 3.3, DY + 1.9, ZB + 2.2], bend: [0, DY + 2.2, ZB + 1.5], pier: [-5, 0.8, ZB + 1.6], river: [0, WL - 0.6, 0.02],
};
export const CAMS = {
  hook: {pos: [7.5, 5.4, 14], look: [5, 3.3, ZB], fov: 40},
  wide: {pos: [2, 6.0, 25], look: [0.5, 2.8, ZB], fov: 40},
  steel: {pos: [-3, 5.5, 18], look: [-2, 3.4, ZB], fov: 40},
  bend: {pos: [1, 6.0, 26], look: [0, 3.6, ZB], fov: 40},
  roll: {pos: [15.6, 3.2, 4.6], look: [14.0, 2.9, ZB + 0.3], fov: 40},
  joint: {pos: [15.4, 7.6, 2.4], look: [14.3, 3.6, ZB + 0.2], fov: 40},
  end: {pos: [8, 7.5, 34], look: [3, 2.8, ZB], fov: 40},
  cover: {pos: [16.2, 5.0, 5.4], look: [14.2, 3.7, ZB + 0.4], fov: 40},
};

export function build(scene, sky) {
  const K = makeKit(scene, {steel: '#4f6f8f', steelD: '#3d556f', concreteC: '#bdb6aa', comb: '#d8c27a', rollerC: '#9aa0a8', thermG: '#e6e9ee', mercury: '#c43a2e', ice2: '#dfeef7'});
  const {add, box, cyl, blob, tree, fir, cloud} = K;
  cutFace(K, LAYERS, bound, -50, 50, [], 0, 0.5);
  // земля сеткой (цвет травы → снег зимой)
  { const xs = [], zs = []; for (let x = -50; x <= 50 + 1e-6; x += 0.5) xs.push(x); for (let z = 0; z >= -40 - 1e-6; z -= z > -8 ? 0.5 : 1.0) zs.push(z);
    const P = [], I = []; for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) P.push(xs[i], S(xs[i], zs[j]), zs[j]);
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) { const a = j * xs.length + i, b = a + 1, c = a + xs.length, d = c + 1; I.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); const ng = g.toNonIndexed(); ng.computeVertexNormals(); add(ng, 'grass', 0, 0, 0, {cast: false}); }
  const grassM = K.M('grass'), grassC = grassM.color.clone(), snowC = new THREE.Color('#eef2f6');
  hills(K, 'hillMid', -39.5, -90, (x, z) => S(x, -40) + 7 * sm((-z - 40) / 30) * (0.55 + 0.45 * Math.sin(x * 0.07 + 0.8)) + vnoise(x * 0.12, 0, z * 0.12), 3);
  hills(K, 'hillFar', -86, -170, (x, z) => 3 + 16 * sm((-z - 86) / 60) * (0.55 + 0.45 * Math.sin(x * 0.04 + 2.5)) + 2 * vnoise(x * 0.06, 3, z * 0.06), 6);
  // река: гладь + вода на срезе
  const waterM = K.M('water', {water: 1, opacity: 0.9, smooth: true});
  { const top = new THREE.Mesh(new THREE.PlaneGeometry(26, 40), waterM); top.geometry.rotateX(-Math.PI / 2); top.position.set(0, WL, -20.05); top.renderOrder = 5; scene.add(top);
    const P = []; for (let x = -13; x < 13; x += 0.25) { const b1 = Math.min(S(x, 0), WL), b2 = Math.min(S(x + 0.25, 0), WL); if (b1 >= WL && b2 >= WL) continue; P.push(x, b1, 0, x + 0.25, b2, 0, x + 0.25, WL, 0, x, b1, 0, x + 0.25, WL, 0, x, WL, 0); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({color: '#4f8fbf', transparent: true, opacity: 0.85, depthWrite: false})); m.renderOrder = 6; scene.add(m); }
  const iceM = new THREE.MeshStandardMaterial({color: '#e8f2f8', flatShading: true, transparent: true, opacity: 0}); { const ice = new THREE.Mesh(new THREE.BoxGeometry(24, 0.12, 38), iceM); ice.position.set(0, WL + 0.1, -20); ice.renderOrder = 7; scene.add(ice); }

  // береговые устои и опоры
  const abut = (x0, x1, seat, xb0, xb1) => { const cx = (x0 + x1) / 2, yb = S(cx, ZB) - 1.0; box(x1 - x0, seat - yb, 3.6, 'concreteC', cx, (seat + yb) / 2, ZB, {r: 0.05}); box(xb1 - xb0, DY - 0.4 - seat, 3.6, 'concreteC', (xb0 + xb1) / 2, (DY - 0.4 + seat) / 2, ZB, {r: 0.05}); box(xb1 - xb0, 0.4, 3.2, 'asphalt', (xb0 + xb1) / 2, DY - 0.2, ZB, {r: 0.02}); };
  abut(XR - 1.6, XR + 4, DY - 1.52, XR + 0.5, XR + 4); abut(XL - 4, XL + 1.2, DY - 1.67, XL - 4, XL - 0.05);
  for (const x of [-5, 5]) { const yb = S(x, ZB) - 0.5; box(1.2, 2.0 - yb, 2.6, 'concreteC', x, (2.0 + yb) / 2, ZB, {r: 0.06}); box(1.6, 0.25, 3.0, 'concreteC', x, 2.05, ZB, {r: 0.04}); }
  // шарнир слева (закреплён)
  { const sh = new THREE.Shape(); sh.moveTo(-0.45, 0); sh.lineTo(0.45, 0); sh.lineTo(0, 0.55); sh.closePath(); add(new THREE.ExtrudeGeometry(sh, {depth: 2.4, bevelEnabled: false}), 'dark', XL + 0.5, DY - 1.12 - 0.55 + 0.02, ZB - 1.2, {}); cyl(0.14, 0.14, 2.6, 'rollerC', XL + 0.5, DY - 1.12, ZB, {rot: [Math.PI / 2, 0, 0], seg: 10}); }

  // пролёт: группа, растягивается от левого шарнира
  const span = new THREE.Group(); span.position.set(XL + 0.5, 0, ZB); scene.add(span);
  const Lsp = XR - XL - 0.5 - 0.15;
  const deckParts = new THREE.Group(); span.add(deckParts);
  box(Lsp, 0.32, 3.0, 'asphalt', Lsp / 2, DY - 0.16, 0, {parent: deckParts, r: 0.02});
  for (const dz of [-1.0, 1.0]) box(Lsp, 0.75, 0.22, 'steel', Lsp / 2, DY - 0.7, dz, {parent: deckParts, r: 0.02});
  for (let x = 0.8; x < Lsp - 0.4; x += 1.6) box(0.12, 0.6, 2.1, 'steelD', x, DY - 0.68, 0, {parent: deckParts});
  for (let x = 0.5; x < Lsp; x += 2.2) box(1.0, 0.03, 0.12, 'white', x, DY + 0.015, 0, {parent: deckParts, cast: false});
  for (const dz of [-1.45, 1.45]) { box(Lsp, 0.08, 0.06, 'steelD', Lsp / 2, DY + 0.55, dz, {parent: deckParts}); for (let x = 0.2; x < Lsp; x += 1.0) box(0.05, 0.55, 0.05, 'steelD', x, DY + 0.27, dz, {parent: deckParts}); }
  // зубья на конце пролёта (смотрят вправо)
  const deckTeeth = new THREE.Group(); scene.add(deckTeeth);
  for (let i = 0; i < 9; i++) box(0.62, 0.06, 0.13, 'comb', 0.31, DY + 0.03, -1.2 + i * 0.3, {parent: deckTeeth, cast: false});
  // зубья на устое (смотрят влево, между зубьями пролёта)
  for (let i = 0; i < 8; i++) box(0.62, 0.06, 0.13, 'comb', XR + 0.5 - 0.31, DY + 0.03, ZB - 1.05 + i * 0.3, {cast: false});
  // катки под правым концом
  const rollers = []; for (const dz of [-0.9, 0.9]) for (let k = 0; k < 3; k++) { const r = cyl(0.16, 0.16, 0.5, 'rollerC', 0, 0, 0, {rot: [Math.PI / 2, 0, 0], seg: 10}); r.userData = {k, dz}; rollers.push(r); }
  box(1.6, 0.1, 2.8, 'dark', XR - 0.6, DY - 1.47, ZB, {}); const topPlate = box(1.5, 0.08, 2.6, 'dark', 0, 0, 0, {});
  // «если закрепить жёстко» — красная дуга-призрак
  const bendM = new THREE.MeshBasicMaterial({color: '#d0473a', transparent: true, opacity: 0, depthWrite: false});
  { const c = new THREE.QuadraticBezierCurve3(new THREE.Vector3(XL + 0.5, DY, ZB + 1.55), new THREE.Vector3(0, DY + 2.6, ZB + 1.55), new THREE.Vector3(XR - 0.15, DY, ZB + 1.55)); const m = new THREE.Mesh(new THREE.TubeGeometry(c, 40, 0.12, 6, false), bendM); m.renderOrder = 9; scene.add(m); }
  const cracks = []; for (const x of [-5, 5]) for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.02), bendM); m.position.set(x - 0.2 + i * 0.2, 0.6 + i * 0.4, ZB + 1.32); m.rotation.z = (i % 2 ? 0.6 : -0.6); m.renderOrder = 9; scene.add(m); cracks.push(m); }
  // термометр у въезда
  const therm = new THREE.Group(); therm.position.set(XR + 3.3, DY, ZB + 2.0); scene.add(therm);
  box(0.5, 2.4, 0.12, 'thermG', 0, 1.3, 0, {parent: therm, r: 0.08}); add(new THREE.SphereGeometry(0.2, 10, 8), 'mercury', 0, 0.25, 0.08, {parent: therm, cast: false});
  const merc = box(0.1, 1, 0.04, 'mercury', 0, 0.3, 0.09, {parent: therm, cast: false}); cyl(0.04, 0.04, 0.6, 'dark', 0, -0.25, 0, {parent: therm, seg: 5});
  // машины, ели, деревья, фонари
  const cars = []; for (let i = 0; i < 4; i++) { const c = new THREE.Group(); scene.add(c); box(1.0, 0.4, 0.55, ['red', 'white', 'blue', 'yellowCar'][i], 0, 0.3, 0, {parent: c, r: 0.08}); box(0.55, 0.28, 0.5, 'glassDark', -0.05, 0.62, 0, {parent: c, r: 0.06}); cars.push(c); }
  const crowns = [];
  { const r = rnd(9); for (let i = 0, n = 0; i < 300 && n < 30; i++) { const x = lerp(-46, 46, r()), z = lerp(-34, -6, r()); if (Math.abs(x) < 15.5) continue; if (n % 2) fir(x, S(x, z) - 0.05, z, 0.8 + r() * 0.5, false); else { const g = tree(x, S(x, z) - 0.05, z, 0.9 + r() * 0.4, 0.55 + r() * 0.25, n + 300); if (g) crowns.push(g); } n++; } }
  for (const x of [XL - 3, XR + 3]) { cyl(0.06, 0.07, 2.4, 'dark', x, DY + 1.2, ZB - 1.7, {seg: 6}); add(new THREE.SphereGeometry(0.13, 8, 6), 'lamp', x, DY + 2.4, ZB - 1.55, {mat: {emissive: 1, ei: 1.5}, cast: false}); }
  const clouds = [cloud(sky, -20, 20, -50, 3.0, 51), cloud(sky, 12, 23, -60, 3.5, 52), cloud(sky, 30, 18, -46, 2.2, 53)];
  const hotC = new THREE.Color('#c43a2e');

  // q: heat −1..1 (зима..лето), bend 0..1, cars 0/1
  const animate = (q) => {
    const t = q.t, h = q.heat ?? 0, bd = sm(q.bend ?? 0), win = sm(Math.max(0, -h));
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.3 + 0.08 * i); });
    const dx = DEX * h, s = (Lsp + dx) / Lsp; deckParts.scale.x = s; const xe = XL + 0.5 + Lsp + dx;
    deckTeeth.position.set(xe - 0.02, 0, ZB);
    rollers.forEach((r) => { const x = XR - 1.0 + r.userData.k * 0.4 + dx * 0.5; r.position.set(x, DY - 1.26, ZB + r.userData.dz); r.rotation.y = -(dx * 0.5) / 0.16; });
    topPlate.position.set(XR - 0.6 + dx, DY - 1.06, ZB);
    grassM.color.copy(grassC).lerp(snowC, win); iceM.opacity = 0.95 * win;
    merc.scale.y = Math.max(0.05, 1.1 + 0.9 * h); merc.position.y = 0.3 + merc.scale.y / 2;
    bendM.opacity = 0.85 * bd; cracks.forEach((m) => (m.visible = bd > 0.3));
    cars.forEach((c, i) => { const dir = i % 2 ? -1 : 1, u = ((t * 0.045 + i * 0.27) % 1 + 1) % 1; c.position.set(dir * lerp(-30, 30, u), DY + 0.0, ZB + dir * 0.7); c.rotation.y = dir > 0 ? 0 : Math.PI; c.visible = (q.cars ?? 1) > 0.5; });
  };
  animate({t: 0});
  return {animate, T, wins: K.wins, lamps: K.lamps};
}

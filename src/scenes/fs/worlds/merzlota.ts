// @ts-nocheck
// Мир «Сваи-холодильники» (27.11): тундра Аляски, срез спереди (мох, сезонно-талый слой, вечная мерзлота с линзами льда).
// Нефтепровод на опорах вдоль среза: передняя свая каждой опоры стоит прямо на срезе, у главной (x=0) свая и
// термотрубка разрезаны вдоль — внутри аммиак: пар (оранжевые бусины) вверх, капли (синие) вниз.
// q: season −1 (зима) … +1 (лето), flow 0..1 (трубка работает), freeze 0..1 (мёрзлая «луковица» у сваи),
//    thaw 0..1 (опора x=−10 без трубок: талик растёт, свая тонет, труба провисает), truck 0/1.
import * as THREE from 'three';
import {makeKit, cutFace, hills, rnd, sm, lerp, vnoise} from '../kit';

export const NEAR = 1;
const SP = 10, PZ = -1.4, PY = 2.9, PR = 0.6, BEAM = 1.55, XT = -10; // шаг опор, ось трубы, балка, опора «без трубок»
const PONDS = [[-17, -13, 5, 3], [16, -20, 6, 3.2], [-34, -26, 7, 3.5]];
export function S(x, z) {
  let h = 0.12 * Math.sin(x * 0.45 + z * 0.3) * sm((-z - 1) / 3) + 0.1 * vnoise(x * 0.35, 1, z * 0.35) * sm((-z - 1) / 3) + 1.2 * sm((-z - 30) / 25);
  for (const [px, pz, rx, rz] of PONDS) { const d = ((x - px) / rx) ** 2 + ((z - pz) / rz) ** 2; h -= 0.7 * sm((1.3 - d) / 0.6); }
  return h;
}
const WL = -0.3; // уровень озёр (дно ниже на ≥0.3)
const LV = [null, -0.28, -1.5, -6.5, -13, -40];
const LAYERS = ['moss', 'active', 'perma', 'perma2', 'rock'];
const bound = (k, x) => (k === 0 ? S(x, 0) : Math.min(S(x, 0) - 0.12 * k, LV[k] + 0.1 * Math.sin(x * 0.7 + k)));
const PB = -7.2; // низ сваи
export const T = {
  fins: [0, 3.9, 0.1], pipe: [-3, PY + PR, PZ + 0.5], perma: [-1.4, -4.4, 0.02], active: [4.5, -0.9, 0.02], pile: [0, -3.2, 0.1],
  bottom: [0, -6.4, 0.1], ice: [-1.0, -3.6, 0.03], thaw: [XT, -2.4, 0.1], sag: [XT, PY + PR + 0.2, PZ + 0.6], road: [9, 0.4, -12],
};
export const CAMS = {
  hook: {pos: [2.4, 4.3, 4.6], look: [0, 3.3, -0.6], fov: 40},
  line: {pos: [10, 3.2, 8], look: [-6, 2.0, -1.4], fov: 40},
  wide: {pos: [2, 3.6, 21], look: [0, 0.6, -2], fov: 40},
  cut: {pos: [1.0, -1.6, 13], look: [0, -2.0, 0], fov: 40},
  bottom: {pos: [0.9, -4.8, 6.0], look: [0, -4.9, 0], fov: 40},
  top: {pos: [1.1, 2.6, 6.0], look: [0, 2.4, -0.2], fov: 40},
  thaw: {pos: [-8.6, 0.6, 12], look: [-10, 0.2, -0.5], fov: 40},
  end: {pos: [6, 6.5, 26], look: [0, 0.6, -3], fov: 40},
  cover: {pos: [2.6, 3.2, 6.2], look: [0, 2.6, -0.6], fov: 40},
};

export function build(scene, sky) {
  const K = makeKit(scene, {moss: '#7d8a4e', active: '#6b4f3a', perma: '#9fb2c2', perma2: '#8496aa', rock: '#6f7690', tundra: '#a7a064',
    steelP: '#7f8894', alu: '#c9cfd6', pipeC: '#b9bec4', shoe: '#59606c', vapor: '#f2a65a', drop: '#4f8fe8', hillFar: '#c9d6e4', hillMid: '#9ea77a', truckC: '#d8783a'});
  const {add, box, cyl, blob, fir, cloud} = K;
  cutFace(K, LAYERS, bound, -60, 60, [{x0: -0.25, x1: 0.25, y0: PB + 0.02, y1: 9}], 0, 0.25);
  const activeM = K.M('active', {smooth: true}), actSummer = activeM.color.clone(), actWinter = new THREE.Color('#8a8a92');
  // линзы льда в мерзлоте (на срезе, редкие и крупные)
  { const r = rnd(4); for (let i = 0; i < 80; i++) { const x = lerp(-30, 30, r()); if (Math.abs(x) < 0.5 || Math.abs(x - XT) < 1.6) continue; const y = lerp(-1.9, -12, r());
    box(0.5 + r() * 1.0, 0.1 + r() * 0.1, 0.04, 'ice', x, y, 0.03, {cast: false, r: 0.02}); } }
  box(1.3, 0.2, 0.04, 'ice', -1.15, -3.6, 0.03, {cast: false, r: 0.02}); // линза под подписью «лёд»
  // земля сеткой (тундра → снег)
  { const xs = [], zs = []; for (let x = -60; x <= 60 + 1e-6; x += 0.6) xs.push(x); for (let z = 0; z >= -50 - 1e-6; z -= z > -8 ? 0.5 : 1.0) zs.push(z);
    const P = [], I = []; for (let j = 0; j < zs.length; j++) for (let i = 0; i < xs.length; i++) P.push(xs[i], S(xs[i], zs[j]), zs[j]);
    for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) { const a = j * xs.length + i, b = a + 1, c = a + xs.length, d = c + 1; I.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(I); const ng = g.toNonIndexed(); ng.computeVertexNormals(); add(ng, 'tundra', 0, 0, 0, {cast: false}); }
  const tundraM = K.M('tundra'), tundraC = tundraM.color.clone(), snowC = new THREE.Color('#eef2f7');
  hills(K, 'hillMid', -49.5, -100, (x, z) => S(x, -50) + 5 * sm((-z - 50) / 30) * (0.55 + 0.45 * Math.sin(x * 0.07 + 0.8)) + vnoise(x * 0.12, 0, z * 0.12), 3);
  hills(K, 'hillFar', -96, -190, (x, z) => 4 + 30 * sm((-z - 96) / 50) * (0.5 + 0.5 * Math.abs(Math.sin(x * 0.05 + 2.5))) + 3 * vnoise(x * 0.06, 3, z * 0.06), 6);
  // озёра-термокарсты
  const iceTopM = new THREE.MeshStandardMaterial({color: '#7fa9c8', flatShading: true, roughness: 0.4});
  for (const [px, pz, rx, rz] of PONDS) { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20), iceTopM); m.rotation.x = -Math.PI / 2; m.scale.set(rx * 1.05, rz * 1.05, 1); m.position.set(px, WL, pz); m.renderOrder = 2; scene.add(m); }
  const pondSummer = new THREE.Color('#5f93bd'), pondWinter = new THREE.Color('#dfeaf2');

  // опоры: две сваи (передняя — на срезе), балка, башмак; над каждой сваей — термотрубка с рёбрами
  const finSet = (x, z, parent, half = false) => {
    cyl(0.085, 0.085, 3.4, 'alu', x, BEAM + 1.7, z, {seg: 8, parent});
    for (let a = 0; a < 8; a++) { const ang = a * Math.PI / 4 + Math.PI / 8; if (half && Math.sin(ang) > 0.1) continue; box(0.22, 1.7, 0.04, 'alu', x + Math.cos(ang) * 0.2, BEAM + 2.4, z + Math.sin(ang) * 0.2, {parent, rot: [0, -ang, 0], r: 0.012}); }
    cyl(0.12, 0.12, 0.1, 'shoe', x, BEAM + 3.45, z, {seg: 8, parent});
  };
  const support = (x, featured = false) => {
    const g = new THREE.Group(); g.position.set(x, 0, 0); scene.add(g);
    for (const z of [0.05, PZ * 2 - 0.05]) {
      if (featured && z > 0) {
        // разрезанная свая: задняя половина трубы (видно нутро) от низа до балки
        const L = BEAM - PB; add(new THREE.CylinderGeometry(0.26, 0.26, L, 16, 1, true, Math.PI / 2, Math.PI), 'steelP', 0, PB + L / 2, z, {parent: g, mat: {side: 2}});
        add(new THREE.CylinderGeometry(0.1, 0.1, BEAM + 3.4 - (PB + 0.3), 12, 1, true, Math.PI / 2, Math.PI), 'alu', 0, (PB + 0.3 + BEAM + 3.4) / 2, z, {parent: g, mat: {side: 2}});
        finSet(0, z - 0.02, g, true);
      } else {
        const yb = z > 0 ? PB : S(x, z) - 0.6; cyl(0.24, 0.24, BEAM - yb, 'steelP', 0, (BEAM + yb) / 2, z, {parent: g, seg: 12});
        if (z > 0) cyl(0.08, 0.08, 0.2, 'alu', 0, PB - 0.08, z, {parent: g, seg: 8});
        finSet(0, z, g);
      }
    }
    box(0.5, 0.42, -PZ * 2 + 1.0, 'steelP', 0, BEAM + 0.21 + 0.03, PZ, {parent: g, r: 0.03});
    box(0.9, 0.24, 1.0, 'shoe', 0, BEAM + 0.42 + 0.12 + 0.04, PZ, {parent: g, r: 0.03});
    return g;
  };
  const sup = []; for (let i = -6; i <= 6; i++) sup.push(support(i * SP, i === 0));
  const tSup = sup[6 + XT / SP];
  // труба: участки по пролётам; пролёты у опоры «без трубок» прогибаются
  const pipeM = K.M('pipeC'), segs = [];
  for (let i = -6; i < 6; i++) {
    const x0 = i * SP, g = new THREE.CylinderGeometry(PR, PR, SP + 0.02, 18, 24, true); g.rotateZ(Math.PI / 2);
    const m = new THREE.Mesh(g, pipeM); m.position.set(x0 + SP / 2, PY, PZ); m.castShadow = true; m.receiveShadow = true; scene.add(m);
    m.userData.base = Float32Array.from(g.attributes.position.array); m.userData.x0 = x0; segs.push(m);
    for (let k = 1; k < 4; k++) cyl(PR + 0.03, PR + 0.03, 0.12, 'shoe', x0 + k * SP / 4, PY, PZ, {rot: [0, 0, Math.PI / 2], seg: 18});
  }
  // нутро трубки на срезе: пар вверх по оси, капли вниз по стенке
  const bM = (c) => new THREE.MeshBasicMaterial({color: c, transparent: true, opacity: 1, depthWrite: false});
  const vapM = bM('#f2a65a'), dropM = bM('#3f7fe0'), liqM = bM('#3f7fe0');
  const vap = [], drp = []; const Y0 = PB + 0.45, Y1 = BEAM + 3.2;
  for (let i = 0; i < 22; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), vapM); m.renderOrder = 9; scene.add(m); vap.push(m); }
  for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), dropM); m.scale.set(1, 1.5, 1); m.renderOrder = 9; scene.add(m); drp.push(m); }
  { const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.3, 0.02), liqM); m.position.set(0, PB + 0.47, 0.1); m.renderOrder = 9; scene.add(m); }
  // мёрзлая «луковица» вокруг главной сваи и талик у опоры без трубок (на срезе, поверх слоёв)
  // эллипс с вырезом под сваю (gap) — геометрия пересобирается из чисел, детерминированно
  const ell = (rx, ry, gap) => { const P = [], n = 24; for (const sgn of [-1, 1]) for (let i = 0; i < n; i++) { const a0 = -Math.PI / 2 + Math.PI * i / n, a1 = a0 + Math.PI / n;
      const p = (a) => [sgn * Math.max(gap, gap + (rx - gap) * Math.cos(a)), ry * Math.sin(a)]; const A = p(a0), B = p(a1); P.push(sgn * gap, 0, 0, A[0], A[1], 0, B[0], B[1], 0); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); return g; };
  const bulb = (c) => { const m = new THREE.Mesh(ell(1, 1, 0), new THREE.MeshBasicMaterial({color: c, transparent: true, opacity: 0, depthWrite: false, side: 2})); m.renderOrder = 4; scene.add(m); return m; };
  const frz = bulb('#cfeaf8'), tal = bulb('#9a6a45');
  // дорога с грузовиком позади
  { const g = new THREE.PlaneGeometry(120, 3.4, 60, 1); g.rotateX(-Math.PI / 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, S(p.getX(i), -12 + p.getZ(i)) + 0.12); g.computeVertexNormals(); add(g, 'gravel', 0, 0, -12, {cast: false}); }
  const truck = new THREE.Group(); scene.add(truck);
  box(1.4, 1.2, 1.5, 'truckC', 2.1, 0.9, 0, {parent: truck, r: 0.1}); box(0.5, 0.5, 1.3, 'glassDark', 2.55, 1.2, 0, {parent: truck, r: 0.05});
  box(3.6, 1.5, 1.6, 'alu', -0.6, 1.05, 0, {parent: truck, r: 0.12});
  for (const x of [2.2, 0.2, -1.6]) for (const z of [-0.75, 0.75]) cyl(0.32, 0.32, 0.25, 'tyre', x, 0.32, z, {parent: truck, rot: [Math.PI / 2, 0, 0], seg: 10});
  // ели-«пьяный лес» (кривые, редкие), кочки
  { const r = rnd(11); for (let i = 0, n = 0; i < 400 && n < 34; i++) { const x = lerp(-58, 58, r()), z = lerp(-48, -5, r()); if (Math.abs(z + 12) < 2.5 || S(x, z) < -0.1) continue; fir(x, S(x, z) - 0.05, z, 0.45 + r() * 0.45, false); n++; } }
  const tus = []; { const r = rnd(21); for (let i = 0; i < 40; i++) { const x = lerp(-30, 30, r()), z = lerp(-9, -0.8, r()); if (Math.abs(z - PZ) < 2.3 && true) continue; tus.push(add(blob(0.25, i, 0.25, 1.4, 1.2, 0.6, 1.2, 0), 'moss', x, S(x, z) + 0.04, z, {cast: false})); } }
  const clouds = [cloud(sky, -22, 22, -60, 3.0, 61), cloud(sky, 14, 25, -70, 3.6, 62), cloud(sky, 34, 19, -55, 2.4, 63)];

  const animate = (q) => {
    const t = q.t, se = q.season ?? -1, win = sm((-se + 0.2) / 1.0), fl = q.flow ?? 0, fz = sm(q.freeze ?? 0), th = sm(q.thaw ?? 0);
    clouds.forEach((g, i) => { g.userData.x0 ??= g.position.x; g.position.x = g.userData.x0 + t * (0.3 + 0.08 * i); });
    tundraM.color.copy(tundraC).lerp(snowC, win); activeM.color.copy(actSummer).lerp(actWinter, win * 0.6);
    iceTopM.color.copy(pondSummer).lerp(pondWinter, win); tus.forEach((m) => (m.visible = win < 0.5));
    // пар и капли (по кругу), гаснут с flow
    const k = sm(fl); vapM.opacity = k; dropM.opacity = k; liqM.opacity = 0.9;
    vap.forEach((m, i) => { const u = ((t * 0.16 + i / vap.length) % 1 + 1) % 1; m.position.set(0.025 * Math.sin(i * 2.3 + u * 9), lerp(Y0, Y1, u), 0.1); m.visible = k > 0.02; m.scale.setScalar(0.8 + 0.4 * (1 - u)); });
    drp.forEach((m, i) => { const u = ((t * 0.11 + i / drp.length) % 1 + 1) % 1; m.position.set(i % 2 ? 0.075 : -0.075, lerp(Y1 - 0.2, Y0, u), 0.1); m.visible = k > 0.02 && lerp(Y1 - 0.2, Y0, u) < BEAM + 1.2; });
    frz.material.opacity = 0.42 * Math.min(1, fz * 3); frz.geometry.dispose(); frz.geometry = ell(0.35 + 1.5 * fz, 0.5 + 2.9 * fz, 0.27); frz.position.set(0, lerp(-3.3, -4.0, fz), 0.02); frz.visible = fz > 0.01;
    tal.material.opacity = 0.5 * Math.min(1, th * 3); tal.scale.set(0.4 + 2.2 * th, 0.4 + 2.0 * th, 1); tal.position.set(XT, -1.4 - 1.2 * th, 0.02); tal.visible = th > 0.01;
    const dy = -0.75 * th; tSup.position.y = dy; tSup.rotation.z = 0.05 * th;
    for (const m of segs) { const a = m.geometry.attributes.position, b = m.userData.base;
      for (let i = 0; i < a.count; i++) { const xw = m.userData.x0 + SP / 2 + b[i * 3]; const w = Math.max(0, 1 - Math.abs(xw - XT) / SP); a.array[i * 3 + 1] = b[i * 3 + 1] + dy * (w * w * (3 - 2 * w)); }
      a.needsUpdate = true; }
    const u = ((t * 0.035) % 1 + 1) % 1; truck.position.set(lerp(-45, 45, u), S(lerp(-45, 45, u), -12) + 0.12, -12.4); truck.visible = (q.truck ?? 1) > 0.5;
  };
  animate({t: 0});
  return {animate, T, wins: K.wins, lamps: K.lamps};
}

// @ts-nocheck
// Фирменный стиль «Сплав» (выбран Денисом 17.11): грани + мягкий свет + карандаш/акварель без рамки + подписи как в атласе.
// Здесь: палитра, материал, свет по времени суток (плавно меняется между сценами) и цепочка постобработки.
import * as THREE from 'three';
import {P} from './post';

export const PAL = {
  grass: '#93c160', soil: '#7a5a48', clay: '#e29a68', sand: '#f5dda6', aquifer: '#8fcbe0', rock: '#7f86a3', deep: '#666c86',
  water: '#5ab4f0', wall: '#fff4e2', roof: '#d9654a', wood: '#a8774f', woodDark: '#6e4a33', brick: '#c0644a',
  stone: '#c3bdb4', concrete: '#cfcac0', trunk: '#8a644c', leaf: '#62a85c', leaf2: '#9ccc6c', leafDark: '#4a9a78',
  metal: '#98a3ae', glass: '#ffd27a', cloud: '#fdf8f0', pipe: '#5a8ff0', barrel: '#9a6440', jarA: '#e6a03c',
  jarB: '#c8483a', jarC: '#7fa84a', rope: '#d8c49a', hillFar: '#b9c9d8', hillMid: '#93b79a', white: '#fbf6ec',
  shutter: '#3a8f96', door: '#7a4a30', pebble: '#c3ced4', smoke: '#eeeae4', lamp: '#ffd98a', snow: '#f4f6fa', snowShade: '#dfe6f0',
  ice: '#cfe8f5', casing: '#7c8496', asphalt: '#5d6170', gravel: '#9a968e', carBody: '#3f8fc4', glassDark: '#33415a', tyre: '#2e3038', birch: '#ece8e0', concreteCut: '#9c968c', bucket: '#7a8ea0', hose: '#3f9a5a', cold: '#4f8fe8', hot: '#f07a3c', warm: '#f2a65a', red: '#d84a3a', dark: '#3a3f4c',
};

// Время суток: солнце, небо, туман, лампы. Все значения плавно смешиваются.
export const TOD = {
  morning: {sun: '#ffcf9a', sunI: 2.6, sunPos: [-16, 8, 12], sky: '#a7b6e0', gnd: '#c4a68e', hemiI: 1.25, top: '#6f9fd6', mid: '#f3d9bd', low: '#ffe6c4', fog: '#ecdccb', lamp: 0.6, win: 1.2},
  day: {sun: '#fff0dc', sunI: 2.6, sunPos: [-11, 17, 13], sky: '#dfe9ff', gnd: '#e2c4ac', hemiI: 1.3, top: '#5ea6e6', mid: '#f3e4cf', low: '#f6ead8', fog: '#e9eef2', lamp: 0.4, win: 0.9},
  golden: {sun: '#ffc58a', sunI: 2.7, sunPos: [-15, 9, 12], sky: '#9aa8d6', gnd: '#b89a80', hemiI: 1.3, top: '#4f86c6', mid: '#f0d3ad', low: '#ffe2b8', fog: '#e9d6be', lamp: 0.8, win: 1.4},
  dusk: {sun: '#ffa774', sunI: 1.5, sunPos: [-18, 4, 10], sky: '#7686bd', gnd: '#6e5f6a', hemiI: 1.05, top: '#34558f', mid: '#c4a990', low: '#f0bd8e', fog: '#a9a3ad', lamp: 1.3, win: 2.2},
  night: {sun: '#a8bcff', sunI: 0.95, sunPos: [10, 16, 9], sky: '#5a6c9e', gnd: '#3a3644', hemiI: 0.95, top: '#101b38', mid: '#2e4064', low: '#45577a', fog: '#2d3954', lamp: 1.9, win: 3.0},
};

export const mat = (role, hex, o = {}) => {
  const m = new THREE.MeshStandardMaterial({color: hex, flatShading: !o.smooth, roughness: o.rough ?? 1, metalness: o.metal ?? 0});
  if (o.side) m.side = o.side;
  if (o.water) { m.transparent = true; m.opacity = o.opacity ?? 0.85; m.depthWrite = false; }
  if (role === 'cloud' || role === 'snow') { m.emissive = new THREE.Color(hex); m.emissiveIntensity = role === 'cloud' ? 0.35 : 0.12; }
  if (o.emissive) { m.emissive = new THREE.Color(hex); m.emissiveIntensity = o.ei ?? 1; m.userData.win = !!o.win; }
  return m;
};

const C = (h) => new THREE.Color(h);
export function makeRig(scene, sky) {
  const sun = new THREE.DirectionalLight('#fff', 2.6); sun.target.position.set(0, -2, -2); scene.add(sun, sun.target); sun.castShadow = true;
  const c = sun.shadow.camera; c.left = -26; c.right = 26; c.top = 26; c.bottom = -26; c.near = 1; c.far = 110;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05; sun.shadow.radius = 3;
  const hemi = new THREE.HemisphereLight('#fff', '#888', 1.3); scene.add(hemi);
  const rim = new THREE.DirectionalLight('#bcd4ff', 0.45); rim.position.set(12, 8, -12); scene.add(rim);
  const u = {top: {value: C('#5ea6e6')}, mid: {value: C('#f3e4cf')}, low: {value: C('#f6ead8')}};
  const dm = new THREE.ShaderMaterial({side: THREE.BackSide, depthWrite: false, fog: false, uniforms: u,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top, mid, low; void main(){ float h = normalize(vP).y; vec3 c = mix(low, mid, smoothstep(0.0, 0.11, h)); gl_FragColor = vec4(mix(c, top, smoothstep(0.06, 0.42, h)), 1.); }'});
  sky.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 20), dm));
  scene.fog = new THREE.Fog('#e9eef2', 36, 170);
  const tmp = new THREE.Color(), tmp2 = new THREE.Color();
  const mixC = (a, b, k) => tmp.set(a).lerp(tmp2.set(b), k);
  // a, b — имена из TOD, k — 0..1
  return (a, b, k, lamps, wins) => {
    const A = TOD[a] ?? TOD.day, B = TOD[b] ?? A, L = (x, y) => x + (y - x) * k;
    sun.color.copy(mixC(A.sun, B.sun, k)); sun.intensity = L(A.sunI, B.sunI);
    sun.position.set(L(A.sunPos[0], B.sunPos[0]), L(A.sunPos[1], B.sunPos[1]), L(A.sunPos[2], B.sunPos[2]));
    hemi.color.copy(mixC(A.sky, B.sky, k)); hemi.groundColor.copy(mixC(A.gnd, B.gnd, k)); hemi.intensity = L(A.hemiI, B.hemiI);
    u.top.value.copy(mixC(A.top, B.top, k)); u.mid.value.copy(mixC(A.mid, B.mid, k)); u.low.value.copy(mixC(A.low, B.low, k));
    scene.fog.color.copy(mixC(A.fog, B.fog, k));
    for (const l of lamps) l.intensity = (l.userData.base ?? 10) * L(A.lamp, B.lamp);
    for (const m of wins) m.emissiveIntensity = (m.userData.base ?? 1) * L(A.win, B.win);
  };
}

// Цепочка: тон → лёгкая «живописная» обобщённость → карандаш и бумага (без рамки) → цвет, виньетка
export const passes = () => [
  P.tonemap({aces: 0.35, exp: 1.0}),
  P.kuwahara({radius: 4, q: 8, half: true}),
  P.watercolor({border: 0, paper: '#fbf5ea', wash: 0.03, bloomy: 0.05}),
  P.finish({sat: 1.06, con: 1.06, sh: [0.0, 0.004, 0.03], hi: [0.03, 0.012, -0.015], canvas: 0, vig: 0.18, grain: 0.008}),
];

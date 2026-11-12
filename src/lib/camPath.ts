import * as THREE from 'three';

// Плавный перелёт камеры между двумя планами (урок «Маяка», 12.11).
// Было: позиция и точка взгляда двигались по прямой. Когда точка взгляда идёт из дали (корабль в 300 м)
// к предмету в 2 м, почти весь поворот камеры приходится на последние кадры — «рывок» в конце.
// Так же наезд в метрах: последние 5 м до предмета в 2 м — это удвоение размера за пару кадров.
// Стало: ориентация — сферическая интерполяция (ровная угловая скорость), расстояние до предмета —
// в логарифме (каждый кадр предмет растёт на одинаковую долю), направление — по дуге вокруг предмета.
export type Pose = {pos: number[]; look: number[]; fov?: number};
const V = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
const tmpM = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);
const quatLook = (p: THREE.Vector3, l: THREE.Vector3) => new THREE.Quaternion().setFromRotationMatrix(tmpM.lookAt(p, l, UP));
const slerpV = (a: THREE.Vector3, b: THREE.Vector3, k: number) => {
  const ua = a.clone().normalize();
  const ub = b.clone().normalize();
  const th = Math.acos(Math.min(1, Math.max(-1, ua.dot(ub))));
  if (th < 1e-5) return ua;
  return ua.multiplyScalar(Math.sin((1 - k) * th) / Math.sin(th)).add(ub.multiplyScalar(Math.sin(k * th) / Math.sin(th)));
};
// k — уже сглаженный параметр 0..1. Возвращает позицию, ориентацию, fov и расстояние до главного предмета.
export const camBetween = (a: Pose, b: Pose, k: number) => {
  const pa = V(a.pos);
  const pb = V(b.pos);
  const la = V(a.look);
  const lb = V(b.look);
  // опора — предмет более близкого плана: вокруг него камера и «наезжает»
  const anchor = pa.distanceTo(la) < pb.distanceTo(lb) ? la : lb;
  const va = pa.clone().sub(anchor);
  const vb = pb.clone().sub(anchor);
  const ra = Math.max(0.05, va.length());
  const rb = Math.max(0.05, vb.length());
  const r = Math.pow(ra, 1 - k) * Math.pow(rb, k);
  const pos = anchor.clone().add(slerpV(va, vb, k).multiplyScalar(r));
  const q = quatLook(pa, la).slerp(quatLook(pb, lb), k);
  const fov = (a.fov ?? 45) + ((b.fov ?? 45) - (a.fov ?? 45)) * k;
  return {pos, q, fov, dist: r};
};

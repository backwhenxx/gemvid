// Перенос мокап-анимации Rocketbox (скелет Bip01) на любого человека со своим скелетом
// (Sketchfab, Mixamo и т.п.). Конечности — по направлениям костей (не зависит от A/T-позы),
// таз и голова — по повороту относительно позы привязки.
import * as THREE from 'three';

export type Part =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'shoulderL' | 'armL' | 'foreL' | 'handL' | 'shoulderR' | 'armR' | 'foreR' | 'handR'
  | 'thighL' | 'legL' | 'footL' | 'toeL' | 'thighR' | 'legR' | 'footR' | 'toeR';

const RB: Record<Part, string> = {
  hips: 'Bip01 Pelvis', spine: 'Bip01 Spine', chest: 'Bip01 Spine2', neck: 'Bip01 Neck', head: 'Bip01 Head',
  shoulderL: 'Bip01 L Clavicle', armL: 'Bip01 L UpperArm', foreL: 'Bip01 L Forearm', handL: 'Bip01 L Hand',
  shoulderR: 'Bip01 R Clavicle', armR: 'Bip01 R UpperArm', foreR: 'Bip01 R Forearm', handR: 'Bip01 R Hand',
  thighL: 'Bip01 L Thigh', legL: 'Bip01 L Calf', footL: 'Bip01 L Foot', toeL: 'Bip01 L Toe0',
  thighR: 'Bip01 R Thigh', legR: 'Bip01 R Calf', footR: 'Bip01 R Foot', toeR: 'Bip01 R Toe0',
};
const norm = (n: string) => n.replace(/_\d+$/, '').replace(/^.*[:|]/, '').replace(/^mixamorig_?/i, '').replace(/[_\s.-]+/g, ' ').trim().toLowerCase();

export const rbBones = (root: THREE.Object3D) => {
  const m = {} as Record<Part, THREE.Bone>;
  const by = new Map<string, THREE.Bone>();
  root.traverse((o: any) => o.isBone && by.set(norm(o.name), o));
  for (const [p, n] of Object.entries(RB)) { const b = by.get(norm(n)); if (b) m[p as Part] = b; }
  return m;
};

/** Угадать части тела по именам костей чужого скелета. */
export const guessBones = (root: THREE.Object3D) => {
  const m = {} as Partial<Record<Part, THREE.Bone>>;
  const all: THREE.Bone[] = [];
  root.traverse((o: any) => o.isBone && all.push(o));
  const side = (n: string): 'L' | 'R' | null =>
    /\bleft\b|(^| )l( |$)/.test(n) ? 'L' : /\bright\b|(^| )r( |$)/.test(n) ? 'R' : null;
  const finger = /thumb|index|middle|ring|pinky|little|finger|digit|nub|end$|twist|roll|helper|ik/;
  const put = (p: Part, b: THREE.Bone) => { if (!m[p]) m[p] = b; };
  for (const b of all) {
    const n = norm(b.name).replace(/left|right/g, (x) => ' ' + x + ' ').replace(/\s+/g, ' ').trim();
    if (finger.test(n)) continue;
    const s = side(n);
    const w = n.replace(/\b(left|right|l|r)\b/g, '').trim();
    if (!s) {
      if (/^(hips|pelvis|hip)$/.test(w)) put('hips', b);
      else if (/^(spine|spine ?0?1?|abdomen)$/.test(w)) put('spine', b);
      else if (/chest|spine ?0?2|spine ?0?3|upper ?chest/.test(w)) m.chest = b; // берём самый верхний
      else if (/^neck/.test(w)) put('neck', b);
      else if (/^head$/.test(w)) put('head', b);
      continue;
    }
    const P = (x: string) => (x + s) as Part;
    if (/shoulder|clavicle|collar/.test(w)) put(P('shoulder'), b);
    else if (/fore ?arm|lower ?arm|elbow/.test(w)) put(P('fore'), b);
    else if (/up ?leg|thigh|upper ?leg/.test(w)) put(P('thigh'), b);
    else if (/toe|ball/.test(w)) put(P('toe'), b);
    else if (/foot|ankle/.test(w)) put(P('foot'), b);
    else if (/leg|calf|shin|knee|lower ?leg/.test(w)) put(P('leg'), b);
    else if (/hand|wrist/.test(w)) put(P('hand'), b);
    else if (/arm/.test(w)) put(P('arm'), b);
  }
  return m;
};

const CHAINS: [Part, Part][] = [
  ['spine', 'chest'], ['chest', 'neck'], ['neck', 'head'],
  ['shoulderL', 'armL'], ['armL', 'foreL'], ['foreL', 'handL'],
  ['shoulderR', 'armR'], ['armR', 'foreR'], ['foreR', 'handR'],
  ['thighL', 'legL'], ['legL', 'footL'], ['footL', 'toeL'],
  ['thighR', 'legR'], ['legR', 'footR'], ['footR', 'toeR'],
];
const ORDER: Part[] = ['hips', 'spine', 'chest', 'neck', 'head', 'shoulderL', 'armL', 'foreL', 'handL', 'shoulderR', 'armR', 'foreR', 'handR',
  'thighL', 'legL', 'footL', 'toeL', 'thighR', 'legR', 'footR', 'toeR'];

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion();

export class Retarget {
  private srcBind = new Map<Part, THREE.Quaternion>();
  private tgtBind = new Map<Part, THREE.Quaternion>();
  private tgtLocal = new Map<Part, THREE.Quaternion>();
  private hipsY0s = 0;
  private hipsY0t = 0;
  private hipsP0t = new THREE.Vector3();
  constructor(private src: Record<Part, THREE.Bone>, private srcRoot: THREE.Object3D, public tgt: Partial<Record<Part, THREE.Bone>>, private tgtRoot: THREE.Object3D) {
    srcRoot.updateMatrixWorld(true);
    tgtRoot.updateMatrixWorld(true);
    for (const p of ORDER) {
      if (src[p]) this.srcBind.set(p, src[p].getWorldQuaternion(new THREE.Quaternion()));
      const b = tgt[p];
      if (b) { this.tgtBind.set(p, b.getWorldQuaternion(new THREE.Quaternion())); this.tgtLocal.set(p, b.quaternion.clone()); }
    }
    this.hipsY0s = src.hips.getWorldPosition(v1).y - srcRoot.getWorldPosition(v2).y;
    if (tgt.hips) { this.hipsY0t = tgt.hips.getWorldPosition(v1).y - tgtRoot.getWorldPosition(v2).y; this.hipsP0t.copy(tgt.hips.position); }
  }
  private setWorldQ(b: THREE.Object3D, wq: THREE.Quaternion) {
    b.parent!.getWorldQuaternion(q3);
    b.quaternion.copy(q3.invert().multiply(wq));
    b.updateMatrixWorld(true);
  }
  /** Скопировать текущую позу источника (после mixer.update) на цель. */
  apply() {
    const {src, tgt} = this;
    this.srcRoot.updateMatrixWorld(true);
    // сброс цели в позу привязки
    for (const [p, q] of this.tgtLocal) tgt[p]!.quaternion.copy(q);
    if (tgt.hips) tgt.hips.position.copy(this.hipsP0t);
    this.tgtRoot.updateMatrixWorld(true);
    // таз: поворот относительно привязки + подъём/опускание в масштабе цели
    if (tgt.hips) {
      const d = src.hips.getWorldQuaternion(q1).multiply(q2.copy(this.srcBind.get('hips')!).invert());
      this.setWorldQ(tgt.hips, d.multiply(q2.copy(this.tgtBind.get('hips')!)));
      const dy = src.hips.getWorldPosition(v1).y - this.srcRoot.getWorldPosition(v2).y - this.hipsY0s;
      const k = this.hipsY0t / (this.hipsY0s || 1);
      tgt.hips.getWorldPosition(v3).y += dy * k;
      tgt.hips.parent!.worldToLocal(v3);
      tgt.hips.position.copy(v3);
      tgt.hips.updateMatrixWorld(true);
    }
    // цепочки: направить кость цели так же, как кость источника
    for (const [a, b] of CHAINS) {
      const ta = tgt[a], tb = tgt[b], sa = src[a], sb = src[b];
      if (!ta || !tb || !sa || !sb) continue;
      sb.getWorldPosition(v1).sub(sa.getWorldPosition(v2)).normalize();
      tb.getWorldPosition(v3).sub(ta.getWorldPosition(v4)).normalize();
      q1.setFromUnitVectors(v3, v1);
      ta.getWorldQuaternion(q2);
      this.setWorldQ(ta, q1.multiply(q2));
    }
    // голова и кисти — поворот относительно привязки
    for (const p of ['head', 'handL', 'handR'] as Part[]) {
      const t = tgt[p], s = src[p];
      if (!t || !s) continue;
      const d = s.getWorldQuaternion(q1).multiply(q2.copy(this.srcBind.get(p)!).invert());
      const want = d.multiply(q2.copy(this.tgtBind.get(p)!));
      if (p !== 'head') {
        // кисть: только частично, чтобы разница A/T-поз не выворачивала запястье
        t.getWorldQuaternion(q3);
        want.copy(q3.slerp(want, 0.5));
      }
      this.setWorldQ(t, want);
    }
  }
}

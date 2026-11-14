// Постобработка 3D-кадра (идея из cinecode; сами проходы — штатные из three/examples, без новых пакетов).
// Включать в сцене: <Post opt={P.post} /> внутри <ThreeCanvas>. Камера сама сообщает дистанцию фокуса:
// camera.userData.focus = расстояние до предмета (в метрах).
// С умом: рендер у нас на процессоре. bloom дешёвый (порог высокий — светятся только солнце и блики),
// dof (глубина резкости) рисует сцену второй раз — включать на крупных планах, где фон надо смягчить.
import React, {useMemo} from 'react';
import * as THREE from 'three';
import {useFrame, useThree} from '@react-three/fiber';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {BokehPass} from 'three/examples/jsm/postprocessing/BokehPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';

export type PostOpt = {
  bloom?: number; // сила свечения бликов, 0 — выкл (обычно 0.2–0.4)
  bloomThreshold?: number; // яркость, с которой начинается свечение (0.85–0.95)
  dof?: number; // сила размытия вне фокуса, 0 — выкл (обычно 1–3)
};

export const Post: React.FC<{opt?: PostOpt | false}> = ({opt}) => {
  const {gl, scene, camera, size} = useThree();
  const o = opt || {};
  const bloom = o.bloom ?? 0;
  const dof = o.dof ?? 0;
  const on = !!opt && (bloom > 0 || dof > 0);
  const c = useMemo(() => {
    if (!on) return null;
    const w = Math.round(size.width * gl.getPixelRatio());
    const h = Math.round(size.height * gl.getPixelRatio());
    const rt = new THREE.WebGLRenderTarget(w, h, {type: THREE.HalfFloatType});
    const composer = new EffectComposer(gl, rt);
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
    composer.addPass(new RenderPass(scene, camera));
    let bok: BokehPass | null = null;
    if (dof > 0) {
      bok = new BokehPass(scene, camera, {focus: 50, aperture: 0.0001 * dof, maxblur: 0.004 * Math.min(2, dof)});
      composer.addPass(bok);
    }
    if (bloom > 0) composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.width / 2, size.height / 2), bloom, 0.5, o.bloomThreshold ?? 0.9));
    composer.addPass(new OutputPass());
    return {composer, bok};
  }, [on]);
  useFrame(() => {
    if (!c) {
      gl.render(scene, camera);
      return;
    }
    if (c.bok) {
      const f = (camera.userData.focus as number) || 50;
      const u = (c.bok as any).uniforms;
      u.focus.value = f;
      // апертура масштабируется от дистанции: на крупном плане и на общем — похожая мягкость фона
      u.aperture.value = (0.0001 * dof * 30) / Math.max(3, f);
    }
    c.composer.render();
  }, 1);
  return null;
};

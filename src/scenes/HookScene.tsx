import React, {useLayoutEffect, useRef} from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {animate, stagger} from 'animejs';
import type {SceneProps} from '../Short';
import {PixiParticles} from '../components/PixiParticles';
import {GLBackground} from '../components/GLBackground';
import {Accented} from '../components/Accented';
import {FONT} from '../lib/util';

// Хук: крупная фраза влетает по буквам (Anime.js), под ней подпись, фон — шейдер + частицы.
// props: text ("слова *акцент*"), sub?
// Размер шрифта: самое длинное слово должно влезть в строку 940px
const hookFont = (text: string) => {
  const longest = Math.max(...text.replace(/\*/g, '').split(/\s+/).map((w) => w.length), 1);
  return Math.max(64, Math.min(128, Math.floor(940 / (longest * 0.86)), text.length > 34 ? 104 : 128));
};

export const HookScene: React.FC<SceneProps> = ({scene, accent, durationInFrames}) => {
  const {text = '', sub = ''} = scene.props;
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const ref = useRef<HTMLDivElement>(null);
  const anim = useRef<any>(null);
  const subAnim = useRef<any>(null);

  useLayoutEffect(() => {
    const chars = ref.current!.querySelectorAll('.hk');
    anim.current = animate(chars, {
      opacity: [0, 1],
      translateY: [140, 0],
      rotate: [-14, 0],
      scale: [1.7, 1],
      duration: 650,
      delay: stagger(26),
      ease: 'outExpo',
      autoplay: false,
    });
    const subEl = ref.current!.querySelector('.hk-sub');
    if (subEl) {
      subAnim.current = animate(subEl, {
        opacity: [0, 1],
        translateY: [40, 0],
        duration: 500,
        delay: 350 + chars.length * 26,
        ease: 'outCubic',
        autoplay: false,
      });
    }
  }, [text, sub]);

  useLayoutEffect(() => {
    const ms = (frame / fps) * 1000;
    anim.current?.seek(ms);
    subAnim.current?.seek(ms);
  }, [frame, fps]);

  const zoom = interpolate(frame, [0, durationInFrames], [1, 1.07]);

  return (
    <AbsoluteFill>
      <GLBackground accent={accent} seed={2} />
      <PixiParticles color={accent} count={110} seed={11} />
      <AbsoluteFill style={{transform: `scale(${zoom})`}}>
        <div
          ref={ref}
          style={{
            position: 'absolute',
            left: 70,
            right: 70,
            top: 520,
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: hookFont(text),
            lineHeight: 1.04,
            color: '#fff',
            textAlign: 'center',
            textTransform: 'uppercase',
            textShadow: '0 10px 40px rgba(0,0,0,0.7)',
          }}
        >
          <Accented text={text} accent={accent} charClass="hk" />
          {sub ? (
            <div
              className="hk-sub"
              style={{marginTop: 36, fontSize: 56, fontWeight: 800, color: 'rgba(255,255,255,0.85)', textTransform: 'none'}}
            >
              <Accented text={sub} accent={accent} />
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

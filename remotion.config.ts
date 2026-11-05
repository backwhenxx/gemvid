import {Config} from '@remotion/cli/config';

// Настройки для `npm run studio` (сборка видео идёт через scripts/build.mjs)
Config.setVideoImageFormat('jpeg');
Config.setChromiumOpenGlRenderer('swangle');
Config.setEntryPoint('src/index.ts');

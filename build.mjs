// Copies the browser libraries into public/vendor (they are committed, so a deploy needs no build step).
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('public/vendor', { recursive: true });
copyFileSync('node_modules/three/build/three.module.min.js', 'public/vendor/three.module.min.js');
copyFileSync('node_modules/qrcode-generator/qrcode.js', 'public/vendor/qrcode.js');
copyFileSync('node_modules/three/examples/jsm/utils/BufferGeometryUtils.js', 'public/vendor/BufferGeometryUtils.js');

// post-processing for the TV (bloom on the bright bits), kept in the same folder layout three.js uses so the
// modules' own relative imports still resolve
const jsm = 'node_modules/three/examples/jsm';
mkdirSync('public/vendor/jsm/postprocessing', { recursive: true });
mkdirSync('public/vendor/jsm/shaders', { recursive: true });
for (const f of ['EffectComposer', 'RenderPass', 'ShaderPass', 'MaskPass', 'Pass', 'UnrealBloomPass'])
  copyFileSync(`${jsm}/postprocessing/${f}.js`, `public/vendor/jsm/postprocessing/${f}.js`);
for (const f of ['CopyShader', 'LuminosityHighPassShader'])
  copyFileSync(`${jsm}/shaders/${f}.js`, `public/vendor/jsm/shaders/${f}.js`);
console.log('vendor files copied');

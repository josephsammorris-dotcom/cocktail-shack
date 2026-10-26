// Copies the browser libraries into public/vendor (they are committed, so a deploy needs no build step).
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('public/vendor', { recursive: true });
copyFileSync('node_modules/three/build/three.module.min.js', 'public/vendor/three.module.min.js');
copyFileSync('node_modules/qrcode-generator/qrcode.js', 'public/vendor/qrcode.js');
console.log('vendor files copied');

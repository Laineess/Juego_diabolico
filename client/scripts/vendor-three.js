// Copia three.js desde node_modules a client/public/lib para servirlo
// localmente (sin CDN, listo para EC2).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = path.join(root, 'public', 'lib');

const files = [
  ['node_modules/three/build/three.module.js', 'three.module.js'],
  ['node_modules/three/examples/jsm/environments/RoomEnvironment.js', 'RoomEnvironment.js'],
];

fs.mkdirSync(lib, { recursive: true });
for (const [src, dest] of files) {
  const from = path.join(root, src);
  if (!fs.existsSync(from)) {
    console.error(`no existe ${src} (ejecuta: npm install)`);
    process.exit(1);
  }
  fs.copyFileSync(from, path.join(lib, dest));
  console.log(`OK lib/${dest}`);
}

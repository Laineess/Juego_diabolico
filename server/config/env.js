// Carga .env desde la raíz del proyecto (independientemente del cwd).
// Debe importarse ANTES que cualquier módulo que lea process.env.

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });

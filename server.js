// VOTAR-521 — entrada para Vercel (preset Express; NestJS corre sobre Express).
// El builder de Vercel no resuelve los alias "@/" de TypeScript, así que se
// carga el build de `npm run build` (nest build + tsc-alias), que ya tiene las
// rutas relativas. En local se sigue usando src/main.ts (`npm run dev`).
require('express');
require('./dist/src/main.js');

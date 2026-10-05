/**
 * Nombre de archivo seguro para detectar extensión y para persistir/auditar
 * (VOTAR-490). Corta en NUL (un `\0` haría que `a.xlsx\0.csv` parezca CSV),
 * descarta saltos de línea y se queda con el basename.
 */
function sinControles(value: string): string {
  let limpio = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code >= 32 && code !== 127) {
      limpio += char;
    }
  }
  return limpio;
}

export function sanitizarNombreArchivo(
  originalname: string | null | undefined,
): string {
  const sinNulo = String(originalname ?? '').split('\0')[0] ?? '';
  const basename = sinControles(sinNulo)
    .replace(/.*[/\\]/, '')
    .trim();
  return basename.length > 0 ? basename : 'desconocido';
}

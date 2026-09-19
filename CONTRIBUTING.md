# Cómo contribuir

Gracias por auditar o mejorar **VOTAR — Backend**. Este repositorio es software
electoral open source (MIT). Las contribuciones se publican bajo la misma
licencia: al enviar un pull request aceptás esos términos.

## Qué se espera de una colaboración

- Discutí cambios grandes en un issue antes de abrir un PR amplio.
- No abras un issue público para vulnerabilidades. Usá [SECURITY.md](./SECURITY.md).
- No incluyas secretos, `.env`, tokens, claves privadas ni datos reales de padrón.
- Mantené el alcance chico y alineado a una historia (convención `VOTAR-NNN`).

## Ramas

| Rama     | Rol                                                           |
| -------- | ------------------------------------------------------------- |
| `master` | Versión estable publicada. Es la rama por defecto de GitHub. |
| `dev`    | Integración. Los pull requests se abren contra `dev`.        |

Nombres de rama:

- `feature/votar-NNN-descripcion-breve`
- `fix/votar-NNN-descripcion-breve`

## Entorno

Requisitos y variables: [README.md](./README.md). Para compilar sin PostgreSQL
ni credenciales institucionales:

```bash
git clone https://github.com/PFISI-Votar/back.git
cd back
git checkout dev
npm ci
npm run build
```

El desarrollo integrado (`npm run dev`) sí requiere PostgreSQL 16 y un `.env`
local que no se commitea. Copiá `.env.example` y completá solo valores locales.

## Antes de abrir el pull request

```bash
npm run lint:ci
npm test
npm run licenses:check
npm run build
```

## Revisión

El equipo Five Stack (UTN FRVM) revisa los pull requests. No hagas merge de tu
propia rama. Si el cambio toca autenticación, padrón, anonimato del sufragio o
secretos, mencionalo en la descripción.

# Versionado y ramas

VOTAR usa [versionado semántico](https://semver.org/lang/es/): `vMAJOR.MINOR.PATCH`.

| Etiqueta | Fecha      | Hito                                                                              |
| -------- | ---------- | --------------------------------------------------------------------------------- |
| `v1.0.0` | 2026-07-28 | MVP: elección funcional extremo a extremo (Sprint 0 — Versión 1)                  |
| `v2.0.0` | 2026-08-11 | APIs públicas de dashboard, re-voto, trazabilidad y política electoral (Sprint 4) |

`package.json` declara `2.1.0`: es la línea de integración posterior a `v2.0.0`.
No es un release hasta que exista el tag. No se reescriben etiquetas ya
publicadas.

## Ramas

| Rama     | Rol                                                                 |
| -------- | ------------------------------------------------------------------- |
| `master` | Producción / estable. Contiene `v2.0.0` y es la rama por defecto.   |
| `dev`    | Integración. Recibe los pull requests. Aún no es un release.        |

La rama estable no se adelanta con todo `dev`: eso publicaría trabajo sin
etiquetar como si fuera la versión estable. El próximo release se corta
mergeando `dev` en `master` y creando `v2.1.0` (o el número que corresponda).

Un auditor que clona la rama por defecto (`master`) obtiene la última estable.
`main` no se usa en este repositorio: el nombre de producción acordado es
`master`.

## Contratos en Sepolia

El vínculo entre el tag `v2.0.0` y las direcciones desplegadas está en el
repositorio de contratos:
[docs/VERSIONADO.md](https://github.com/PFISI-Votar/blockchain/blob/dev/docs/VERSIONADO.md).

## Crear la próxima etiqueta

Desde `master`, después del merge del release:

```bash
git tag -a v2.1.0 -m "Release v2.1.0 — <hito>"
git push origin v2.1.0
```

El mensaje debe nombrar el hito. Si el release cambia la ABI consumida, el tag
de `blockchain` y el de este repositorio se publican juntos.

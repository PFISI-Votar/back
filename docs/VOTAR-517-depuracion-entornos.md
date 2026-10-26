# VOTAR-517 — Depuración de entornos temporales y contenedores Docker

> **Repositorio:** `PFISI-Votar/back`  
> **Script:** `scripts/cleanup-dev-env.sh` (`npm run env:cleanup`)

Elimina lo que se acumula en la máquina de desarrollo sprint tras sprint: contenedores huérfanos, imágenes obsoletas, volúmenes en desuso, caché de build y ramas locales de prueba inactivas.

## Uso

```bash
npm run env:cleanup                          # dry-run: solo lista lo que se borraría
npm run env:cleanup -- --apply               # ejecuta la purga
npm run env:cleanup -- --apply --age-hours 24
npm run env:cleanup -- --project otro-proyecto --skip-git
```

| Opción             | Efecto                                                                                |
| ------------------ | ------------------------------------------------------------------------------------- |
| `--apply`          | Borra. Sin esta opción el script **solo informa**.                                    |
| `--age-hours N`    | Antigüedad mínima de imágenes, caché de build y último commit de ramas (default 168). |
| `--project NOMBRE` | Proyecto de docker compose a depurar (default `codigo`).                              |
| `--skip-docker`    | No toca Docker.                                                                       |
| `--skip-git`       | No toca ramas.                                                                        |

## Qué depura

| Recurso        | Criterio                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Contenedores   | Detenidos (`exited`, `created`, `dead`) con la etiqueta `com.docker.compose.project=<proyecto>`.                                           |
| Imágenes       | Colgantes (`<none>`) con más de `--age-hours`.                                                                                             |
| Volúmenes      | Sin contenedor asociado, del proyecto indicado. **Nunca** los `votar-*`.                                                                   |
| Caché de build | Con más de `--age-hours`.                                                                                                                  |
| Ramas locales  | Mergeadas en `origin/dev`, `origin/master` u `origin/main`, o con el remoto eliminado, y con el último commit más viejo que `--age-hours`. |

## Qué no toca

- Contenedores y volúmenes de **otros proyectos** de la máquina (se filtra por proyecto compose).
- El volumen `votar-pg-data-dev` (BD local), aunque el stack esté apagado.
- Las ramas `dev`, `master`, `main`, `release/*`, la rama actual ni las que estén checkout en algún worktree.
- Ramas remotas: solo se hace `git fetch --prune`.

Las ramas con remoto eliminado se borran con `git branch -D`, porque los merges por squash no se detectan como mergeados.

#!/bin/bash

# Script para depurar entornos temporales: contenedores huérfanos, imágenes
# Docker obsoletas, volúmenes en desuso y ramas locales de prueba inactivas.
# Por defecto solo LISTA lo que borraría (dry-run); para borrar de verdad
# pasar --apply.
#
# Uso: ./scripts/cleanup-dev-env.sh [--apply] [--age-hours N] [--project NOMBRE] [--skip-docker] [--skip-git]
#   --apply          ejecuta la purga (sin esta opción solo informa)
#   --age-hours N    antigüedad mínima de imágenes, caché de build y último commit de
#                    las ramas a borrar (default 168 = 7 días)
#   --project NOMBRE proyecto de docker compose a depurar (default codigo, la
#                    carpeta del docker-compose.yml de desarrollo)
#   --skip-docker    no toca Docker
#   --skip-git       no toca ramas
#
# Alcance: los contenedores y volúmenes se filtran por la etiqueta
# com.docker.compose.project, así que no toca los de otros proyectos de la
# máquina. Las imágenes son solo las colgantes (<none>) y la caché de build
# sin uso, ambas regenerables.
#
# Nunca se borran: los volúmenes votar-* (p. ej. votar-pg-data-dev con la BD
# local), las ramas dev, master, main, release/*, la rama actual ni las que
# estén checkout en algún worktree.

set -euo pipefail

APPLY=false
AGE_HOURS=168
SKIP_DOCKER=false
SKIP_GIT=false
PROJECT=codigo

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=true ;;
    --age-hours)
      AGE_HOURS="${2:-}"
      shift
      ;;
    --project)
      PROJECT="${2:-}"
      shift
      ;;
    --skip-docker) SKIP_DOCKER=true ;;
    --skip-git) SKIP_GIT=true ;;
    -h | --help)
      sed -n '3,23p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "❌ Opción desconocida: $1" >&2
      exit 1
      ;;
  esac
  shift
done

if ! [[ "$AGE_HOURS" =~ ^[0-9]+$ ]]; then
  echo "❌ --age-hours requiere un número entero" >&2
  exit 1
fi

if [ -z "$PROJECT" ]; then
  echo "❌ --project requiere un nombre" >&2
  exit 1
fi

if [ "$APPLY" = true ]; then
  echo "🧹 Depurando entorno (modo APPLY)"
else
  echo "🔍 Dry-run: solo se lista lo que se borraría (usar --apply para ejecutar)"
fi
echo ""

if [ "$SKIP_DOCKER" = false ]; then
  if ! command -v docker > /dev/null 2>&1 || ! docker info > /dev/null 2>&1; then
    echo "⚠️  Docker no está disponible; se omite la depuración de Docker"
    echo ""
  else
    echo "📦 Contenedores detenidos del proyecto '${PROJECT}' (huérfanos)"
    CONTAINERS=$(docker ps -a --filter "label=com.docker.compose.project=${PROJECT}" \
      --filter status=exited --filter status=created --filter status=dead \
      --format '{{.ID}} {{.Names}}')
    if [ -z "$CONTAINERS" ]; then
      echo "   (ninguno)"
    else
      echo "$CONTAINERS" | sed 's/^/   /'
      if [ "$APPLY" = true ]; then
        echo "$CONTAINERS" | awk '{print $1}' | xargs docker rm > /dev/null
      fi
    fi
    echo ""

    echo "🖼️  Imágenes colgantes (<none>) con más de ${AGE_HOURS}h"
    if [ "$APPLY" = true ]; then
      docker image prune -f --filter "until=${AGE_HOURS}h"
    else
      docker images --filter dangling=true --filter "until=${AGE_HOURS}h" --format '   {{.ID}} ({{.Size}}, {{.CreatedSince}})'
    fi
    echo ""

    echo "💾 Volúmenes en desuso del proyecto '${PROJECT}' (se conservan los votar-*)"
    VOLUMES=$(docker volume ls -q --filter dangling=true \
      --filter "label=com.docker.compose.project=${PROJECT}" | grep -v -E '^votar-' || true)
    if [ -z "$VOLUMES" ]; then
      echo "   (ninguno)"
    else
      echo "$VOLUMES" | sed 's/^/   /'
      if [ "$APPLY" = true ]; then
        echo "$VOLUMES" | xargs docker volume rm > /dev/null
      fi
    fi
    echo ""

    echo "🗂️  Caché de build con más de ${AGE_HOURS}h"
    if [ "$APPLY" = true ]; then
      docker builder prune -f --filter "until=${AGE_HOURS}h"
    else
      docker system df --format '   {{.Type}}: {{.Size}} (reclamable {{.Reclaimable}})' || true
    fi
    echo ""
  fi
fi

if [ "$SKIP_GIT" = false ]; then
  if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo "⚠️  No es un repositorio git; se omite la depuración de ramas"
  else
    echo "🌿 Ramas locales inactivas (mergeadas en dev/master o con remoto eliminado, último commit con más de ${AGE_HOURS}h)"
    git fetch --prune --quiet origin || echo "⚠️  No se pudo actualizar origin; se usa el estado local"

    CURRENT=$(git branch --show-current)
    WORKTREE_BRANCHES=$(git worktree list --porcelain | sed -n 's#^branch refs/heads/##p')
    BASES=""
    for base in origin/dev origin/master origin/main; do
      if git rev-parse --verify --quiet "$base" > /dev/null; then
        BASES="$BASES $base"
      fi
    done

    STALE=""
    NOW=$(date +%s)
    while IFS='|' read -r branch track last_commit; do
      [ -z "$branch" ] && continue
      case "$branch" in dev | master | main | release/*) continue ;; esac
      [ "$branch" = "$CURRENT" ] && continue
      if echo "$WORKTREE_BRANCHES" | grep -qx "$branch"; then continue; fi
      # Una rama recién creada desde dev también figura como "mergeada".
      if [ $((NOW - last_commit)) -lt $((AGE_HOURS * 3600)) ]; then continue; fi

      inactive=false
      if [ "$track" = "[gone]" ]; then
        inactive=true
      else
        for base in $BASES; do
          if git merge-base --is-ancestor "$branch" "$base" 2> /dev/null; then
            inactive=true
            break
          fi
        done
      fi
      if [ "$inactive" = true ]; then
        STALE="$STALE $branch"
        echo "   $branch"
      fi
    done < <(git for-each-ref --format='%(refname:short)|%(upstream:track)|%(committerdate:unix)' refs/heads)

    if [ -z "$STALE" ]; then
      echo "   (ninguna)"
    elif [ "$APPLY" = true ]; then
      # -D: las ramas con remoto [gone] suelen haberse mergeado por squash.
      for branch in $STALE; do
        git branch -D "$branch" > /dev/null
      done
    fi
    echo ""
  fi
fi

if [ "$APPLY" = true ]; then
  echo "✅ Depuración completada"
else
  echo "ℹ️  Dry-run finalizado. Ejecutar con --apply para borrar."
fi

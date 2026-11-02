# Política de seguridad

VOTAR es software electoral. Un defecto puede afectar la integridad del
escrutinio, el secreto del voto o la disponibilidad de un comicio. Pedimos
reporte responsable: no publiques el detalle hasta coordinar la corrección.

## Qué reportar

- Fallas de autenticación, autorización, cookies, 2FA o sesión.
- Exposición de PII, padrones, backups o claves de firma.
- Defectos que permitan alterar resultados, saltarse el padrón o vincular
  identidad con el contenido del sufragio.
- Secretos commiteados (`.env`, `JWT`, claves de relayer o de base de datos).

No uses este canal para bugs sin impacto de seguridad. Abrí un issue normal.

## Cómo reportar

1. No abras un issue público ni un pull request con un exploit.
2. Usá el reporte privado de GitHub:
   <https://github.com/PFISI-Votar/back/security/advisories/new>
3. Incluí componente, commit o tag, impacto, pasos de reproducción y si el
   problema ya es explotable en un entorno publicado.

Si ese canal no está habilitado, contactá a los maintainers de la organización
`PFISI-Votar` por un medio privado. No envíes pruebas de concepto a listas
públicas.

## Qué no hacer

- No uses el hallazgo contra un comicio real ni un padrón real.
- No extraigas datos personales ni volcados de base de datos.
- No publiques un advisory por tu cuenta antes de coordinarlo.

## Plazos de respuesta

| Hito                          | Plazo           |
| ----------------------------- | --------------- |
| Acuse de recibo               | 3 días hábiles  |
| Evaluación inicial de impacto | 10 días hábiles |
| Corrección o mitigación       | Según severidad |

## Alcance

En alcance: esta API, sus migraciones y su integración con los contratos
públicos de VOTAR.

Fuera de alcance: Autogestión UTN, proveedores de RPC y PostgreSQL como
producto de terceros. Si el problema está en un tercero, reportalo también a
ese proveedor.

## Versiones

Se mantienen la etiqueta estable más reciente (`v2.0.0` al publicar esta
política) y la rama `dev`. El modelo de tags está en
[docs/VERSIONADO.md](./docs/VERSIONADO.md).

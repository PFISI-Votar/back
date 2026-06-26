# US-312 — Login del Votante vía SSO (guía UAT)

## Implementación

| Aspecto | Detalle |
|---|---|
| IdP (MVP) | BFF **Autogestión UTN** (`AUTOGESTION_BASE_URL`) |
| Token | JWT con `role: "voter"` |
| Cookie | `votar_voter_access_token` (HttpOnly, separada del admin) |
| TTL | `JWT_VOTER_ACCESS_EXPIRES_IN` (default **30m**) |
| Refresh | **No existe** `/auth/votante/refresh` |
| Endpoints | `POST /auth/votante/login`, `GET /auth/votante/me`, `POST /auth/votante/logout` |
| Padrón | Hash `Keccak-256(dni:email)` en `PADRON_VOTANTE` |

## UAT-01 — Login exitoso

1. Abrir `/comicios/{idEleccion}/votar` en el frontend.
2. Ingresar legajo y clave Autogestión válidos.
3. Verificar acceso a la BUD.
4. En Network → `POST /auth/votante/login` → `Set-Cookie` con JWT; payload decodificado debe tener `role: "voter"`.

## UAT-02 — Credenciales inválidas

1. Contraseña incorrecta → mensaje genérico en UI.
2. Respuesta `401` sin email, DNI ni detalles de cuenta.

## UAT-03 — Expiración

1. Configurar `JWT_VOTER_ACCESS_EXPIRES_IN=1m` y reiniciar backend.
2. Tras >1 min sin actividad, operaciones protegidas devuelven `401` y la BUD vuelve al login.

## UAT-04 — Sin refresh automático

1. En Network, filtrar `refresh` durante el flujo BUD.
2. No debe aparecer `POST /auth/votante/refresh` ni refresh admin disparado por la BUD.

## Tests automatizados

```bash
npm test -- --testPathPatterns="votante-auth|voter-jwt|resolve-dni"
npm run test:e2e -- --testPathPatterns=votante-auth
```

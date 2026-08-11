# US-335 — Sepolia UAT: publicación Merkle vía backend

> **Historia:** VOTAR-335 — Publicación del sello de integridad del padrón en la blockchain  
> **Red:** Ethereum Sepolia (`chainId` `11155111`)  
> **Repositorio:** `PFISI-Votar/back`

---

## 1. Contrato y roles (Sepolia)

| Campo                             | Valor                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Contrato**                      | [`MerkleRootStore`](https://sepolia.etherscan.io/address/0xbDe27804308ADd8e51CF7b1033088D2C9dB0999f) `0xbDe27804308ADd8e51CF7b1033088D2C9dB0999f` |
| **DEFAULT_ADMIN_ROLE**            | `0x4852CB3d2acA0fDD4677a3e6dD1C2f3AcEFD6928`                                                                                                      |
| **MERKLE_UPDATER_ROLE** (backend) | `0xeB8FD44Ee4b8A2da04DDbE440e32258535781BF2`                                                                                                      |

Evidencia on-chain del contrato y UAT directo: ver `blockchain/docs/US-335-sepolia-uat.md`.

---

## 2. Variables de entorno (no commitear)

Copiar desde `back/.env.example`:

| Variable                     | Descripción                                  |
| ---------------------------- | -------------------------------------------- |
| `SEPOLIA_RPC_URL`            | RPC Sepolia (Infura, Alchemy, etc.)          |
| `MERKLE_ROOT_STORE_ADDRESS`  | Dirección desplegada del contrato            |
| `MERKLE_UPDATER_PRIVATE_KEY` | Clave de la cuenta con `MERKLE_UPDATER_ROLE` |
| `CHAIN_ID`                   | `11155111`                                   |
| `ETHERSCAN_BASE_URL`         | `https://sepolia.etherscan.io`               |

---

## 3. Endpoint

```http
POST /elecciones/:idEleccion/padron/merkle/publicar
Authorization: Bearer <JWT election_admin>
```

**Precondiciones:** Merkle en estado `GENERADO`; comicio no en `ABIERTA` / `CERRADA` / `ESCRUTADA`.

---

## 4. Resultado E2E — 2026-07-01

| Paso                                                   | Resultado                                       |
| ------------------------------------------------------ | ----------------------------------------------- |
| Crear comicio + importar padrón (3 votantes)           | OK — Merkle `GENERADO`                          |
| `POST .../merkle/publicar`                             | OK — tx en Sepolia                              |
| `GET .../merkle`                                       | `PUBLICADO_ON_CHAIN` + `txHash` + `explorerUrl` |
| Verificación on-chain (`isPublished`, `getMerkleRoot`) | OK — root coincide                              |
| Re-intento de publicación                              | HTTP `409` con DTO existente                    |
| Panel admin (`front`)                                  | OK — sello on-chain visible con link Etherscan  |

| Campo           | Valor                                                                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Comicio**     | `id_eleccion=3`                                                                                                                                                            |
| **Raíz Merkle** | `0x7f6529cef5733fdd43f39cba31ad045ba66dae37266ffb9683b0793e25f1105f`                                                                                                       |
| **Tx**          | [`0x201a8e81e858f368259d1fac0ca309a1a70e722031c355f55860af059a04d012`](https://sepolia.etherscan.io/tx/0x201a8e81e858f368259d1fac0ca309a1a70e722031c355f55860af059a04d012) |
| **Bloque**      | `11181957`                                                                                                                                                                 |

---

## 5. Tests automatizados

```bash
npm test                    # unitarios (BlockchainService, PadronService)
npm run build && npm run lint
```

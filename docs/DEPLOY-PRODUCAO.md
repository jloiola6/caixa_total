# Deploy e atualização em produção — Caixa Total

Este documento descreve **como o ambiente de produção foi pensado**, quais **variáveis** existem, **como a API e o front se comunicam**, e **como publicar atualizações** (principalmente via **CI/CD com tags** no GitHub Actions).

Para um resumo rápido, veja também o [README](../README.md).

---

## 1. Visão geral da arquitetura em produção

| Componente | Tecnologia | Função |
|------------|------------|--------|
| API | Google Cloud Run (container Node.js) | Autenticação, admin, sync, relatórios |
| Front web | Google Cloud Run (nginx servindo `out/` do Next.js) | Interface estática exportada |
| Banco | PostgreSQL gerenciado (ex.: Neon) | Dados persistidos |
| Fotos de produto | Google Cloud Storage (bucket dedicado) | URLs públicas em `imageUrl`; Docker continua no Artifact Registry |
| CI/CD | GitHub Actions | Build ao **push de tags** + deploy após **aprovação manual** |

Fluxo de dados no navegador:

1. **Login** ou **reabertura do app com token** dispara `pullFromServer()` (`front/lib/sync-pull.ts`).
2. O front chama `GET /sync` com autenticação e aplica a resposta no `IndexedDB` via `applyServerState()` (`front/lib/sync-conflict.ts`).
3. **Relatórios** tentam primeiro as rotas `GET /report/*`; se a rede falhar, usam dados locais (`IndexedDB`).

Assim, **a fonte da verdade em produção é o servidor**; o `IndexedDB` é cache e fallback offline.

---

## 2. Convenção de tags Git (gatilho do pipeline)

Os workflows em `.github/workflows/` disparam **somente** em **push de tag** para o remoto (`origin`):

| Prefixo da tag | Workflow | Efeito |
|----------------|----------|--------|
| `back-v*` | `deploy-back.yml` | Build da imagem `back`, push no Artifact Registry, deploy no serviço Cloud Run do backend |
| `front-v*` | `deploy-front.yml` | Build Next.js com `NEXT_PUBLIC_API_URL`, imagem `front`, deploy no serviço Cloud Run do frontend |

Após o build/push da imagem, o job de deploy fica em `Waiting` até aprovação manual do environment `production`.

Exemplos válidos:

- `back-v1.0.0`, `back-v1.0.1`, `back-v2.3.4`
- `front-v1.0.0`, `front-v1.1.0`

**Importante:** a tag precisa ser enviada ao GitHub:

```bash
git checkout main
git pull origin main
git tag back-v1.0.1
git push origin back-v1.0.1
```

O mesmo para o front com `front-v1.0.1`.

---

## 3. GitHub Actions — o que cada workflow faz

### 3.1 Backend (`deploy-back.yml`)

1. Checkout do repositório na revisão apontada pela tag.
2. Autenticação no GCP com `GCP_SA_KEY` (JSON da service account).
3. `gcloud auth configure-docker` para `us-central1-docker.pkg.dev`.
4. Extrai o sufixo da tag: `back-v1.0.1` → versão da imagem `1.0.1`.
5. `docker build` em `back/` e tag dupla:
   - `.../back:1.0.1`
   - `.../back:latest`
6. `docker push` das duas tags.
7. Job `deploy` aguarda aprovação manual no environment `production`.
8. Após aprovação: autentica no GCP e executa `gcloud run deploy caixa-total-back` com a imagem versionada, região `us-central1`, porta **4000**.

**Observação:** o deploy **não redefine** `DATABASE_URL`, `JWT_SECRET`, `FRONT_URL` etc. no Cloud Run. Essas variáveis devem estar já configuradas no serviço (console ou `gcloud run services update`). O pipeline só troca a **imagem**.

### 3.2 Frontend (`deploy-front.yml`)

1. Checkout.
2. Node 22 + pnpm; `pnpm install` em `front/`.
3. `pnpm build` com env `NEXT_PUBLIC_API_URL=${{ secrets.BACKEND_URL }}` (URL pública da API, **sem barra no final** recomendado).
4. Autenticação GCP + configure-docker (igual ao back).
5. Versão da tag: `front-v1.0.2` → imagem `1.0.2`.
6. `docker build` em `front/` (Dockerfile copia `out/` e nginx).
7. Push das imagens.
8. Job `deploy` aguarda aprovação manual no environment `production`.
9. Após aprovação: `gcloud run deploy caixa-total-front`, porta **8080**.

### 3.3 Aprovação manual restrita (somente owner)

Para garantir que outros devs possam disparar o pipeline, mas **não aprovar deploy**:

1. Vá em **GitHub → Settings → Environments → New environment**.
2. Crie (ou edite) o environment chamado `production`.
3. Em **Required reviewers**, adicione **somente o seu usuário GitHub** (por exemplo, `joao-teixeira`).
4. Não adicione mais ninguém nessa lista.
5. Se você quer aprovar também os deploys iniciados por você, deixe **Prevent self-review** desativado.

Com isso, qualquer dev com permissão para criar tag ainda consegue iniciar o workflow, mas apenas você consegue liberar a fase final de deploy.

---

## 4. Secrets do GitHub (Actions)

Configurar em: **Repositório → Settings → Secrets and variables → Actions**.

| Secret | Obrigatório | Descrição | Exemplo (não copie como valor real) |
|--------|:-------------:|-----------|-------------------------------------|
| `GCP_PROJECT_ID` | Sim | ID do projeto GCP | `caixa-total` |
| `GCP_SA_KEY` | Sim | JSON inteiro da service account com permissões de deploy | `{ "type": "service_account", ... }` |
| `BACKEND_URL` | Sim (front) | URL base da API usada no **build** do Next | `https://caixa-total-back-xxxxx.us-central1.run.app` |

**Formato de `BACKEND_URL`:** use a URL **HTTPS** do Cloud Run do backend, **sem** path e **sem** `/` final (o código do front concatena paths como `/sync`).

Variáveis **fixas nos workflows** (ajuste só se mudar infra):

- `REGION`: `us-central1`
- `REGISTRY`: `us-central1-docker.pkg.dev`
- `REPOSITORY`: `caixa-total`
- Serviços: `caixa-total-back`, `caixa-total-front`
- Imagens: `back`, `front`

---

## 5. Service account no GCP (resumo)

Conta típica: `github-deploy@SEU_PROJECT_ID.iam.gserviceaccount.com`.

Roles usuais no **projeto**:

- `roles/run.admin` — deploy e atualização de serviços Cloud Run
- `roles/artifactregistry.writer` — push de imagens
- `roles/iam.serviceAccountUser` — permitir que o deploy use a identidade de runtime do Cloud Run quando necessário

Se a organização bloquear **criação de chaves JSON** (`constraints/iam.disableServiceAccountKeyCreation`), é preciso relaxar a política no projeto/organização ou migrar para **Workload Identity Federation** (sem chave; mudaria o workflow).

**Segurança:** não commite o JSON da chave; rotacione chaves se vazarem; remova chaves antigas no IAM após criar uma nova.

---

## 6. Variáveis de ambiente — backend (runtime)

Definidas no **Cloud Run** do serviço da API (não no GitHub, exceto se você estender o workflow com `--set-env-vars`).

| Variável | Obrigatória | Descrição | Exemplo |
|----------|:-------------:|-----------|---------|
| `DATABASE_URL` | Sim | Connection string PostgreSQL (SSL em provedores como Neon) | `postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require` |
| `JWT_SECRET` | Sim | Segredo para assinar JWT | string longa aleatória (ex.: 32+ bytes em base64) |
| `FRONT_URL` | Recomendada | CORS: origens permitidas, **vírgula** para várias; `*` libera qualquer origem | `https://caixa-total-front-xxxxx.us-central1.run.app` ou `https://app.exemplo.com,http://localhost:3000` |
| `NODE_ENV` | Automática | Em container de produção costuma ser `production` | `production` |
| `PORT` | Cloud Run | Injetada pelo Cloud Run; **não** fixar manualmente em `gcloud run deploy` com `--set-env-vars` para `PORT` | — |
| `RESEND_API_KEY` | Não | E-mail (recuperação de senha) | vazio ou chave Resend |
| `RESEND_FROM` | Não | Remetente | `Caixa Total <no-reply@seudominio.com>` |
| `SEED_*` | Só seed local | Normalmente **não** usadas em runtime prod | — |
| `GCS_BUCKET_NAME` | Para upload de fotos | Nome do bucket (ex.: `caixa-total-produtos`) | ver secção abaixo |
| `GCS_PUBLIC_BASE_URL` | Para upload de fotos | URL base pública sem barra final | `https://storage.googleapis.com/caixa-total-produtos` |

Referência de código: `back/src/config.ts` (carrega `dotenv` em dev; em Cloud Run as vars vêm do painel).

### 6.1 Imagens de produto (Google Cloud Storage)

As fotos deixam de ir em base64 para o Postgres: o front pede `POST /uploads/product-image/sign`, envia o ficheiro com **PUT** para a URL assinada e guarda só a **URL HTTPS** em `Product.imageUrl`.

**Infra (GCP) — automático no teu PC (recomendado):**

Com `gcloud` autenticado e projeto definido:

```bash
cd back
chmod +x scripts/setup-gcs-product-bucket.sh
./scripts/setup-gcs-product-bucket.sh
```

O script [`back/scripts/setup-gcs-product-bucket.sh`](../back/scripts/setup-gcs-product-bucket.sh) faz: criar o bucket (nome por defeito `${PROJECT_ID}-caixa-product-images`), *uniform bucket-level access*, IAM `allUsers` → **Object Viewer**, SA do runtime (por defeito `PROJECT_NUMBER-compute@developer.gserviceaccount.com`) → **Object Admin**, e CORS com `PUT` (origem `*` por defeito — restrinja no consola GCS em produção).

Variáveis opcionais: `GCP_PROJECT_ID`, `GCS_BUCKET_NAME`, `GCS_REGION`, `CLOUD_RUN_SA_EMAIL`. Migração na mesma corrida: `RUN_MIGRATE=1` com `DATABASE_URL` definido ou em `back/.env`.

**Infra (GCP) — manual (alternativa):**

1. Criar um bucket **só para media pública**, com *uniform bucket-level access*.
2. SA do **Cloud Run** com **Storage Object Admin** no bucket.
3. **`allUsers`** → **Storage Object Viewer** no bucket (só este bucket).
4. `GCS_BUCKET_NAME` e `GCS_PUBLIC_BASE_URL` no Cloud Run e em `.env` local.
5. **CORS** no bucket para `PUT` a partir da origem do front.

**Migração de dados antigos** (Neon com `data:image...` em `imageUrl`):

```bash
cd back
export DATABASE_URL="postgresql://..."
export GCS_BUCKET_NAME="seu-bucket"
export GCS_PUBLIC_BASE_URL="https://storage.googleapis.com/seu-bucket"
# Credenciais: GOOGLE_APPLICATION_CREDENTIALS=/caminho/sa.json ou:
# gcloud auth application-default login
pnpm migrate:images-gcs
```

Ordem recomendada: configurar GCS + envs → deploy do backend → correr o script de migração → deploy do front. Clientes offline com base64 no dispositivo: após atualizar o app, ao sincronizar o servidor **rejeita** `data:` no `POST /sync`; é preciso voltar a anexar a foto ou limpar a imagem antes de sincronizar se ainda aparecer erro.

---

## 7. Variáveis de ambiente — frontend (build time)

Next.js **export estático** (`output: "export"` em `front/next.config.mjs`): tudo que for `NEXT_PUBLIC_*` é **gravado no bundle** no momento do `pnpm build`.

| Variável | Obrigatória no CI | Descrição | Exemplo |
|----------|:-----------------:|-----------|---------|
| `NEXT_PUBLIC_API_URL` | Sim | URL da API | mesmo valor que `BACKEND_URL` no secret |
| `NEXT_PUBLIC_READ_ONLY` | Não | Força modo somente leitura em algumas telas | `true` / omitir |

Após mudar a URL da API, é necessário **novo build** do front (nova tag `front-v*`).

---

## 8. Imagens Docker e nomes completos

Padrão de imagem:

```text
us-central1-docker.pkg.dev/<GCP_PROJECT_ID>/caixa-total/back:<versão>
us-central1-docker.pkg.dev/<GCP_PROJECT_ID>/caixa-total/front:<versão>
```

Exemplo com projeto `caixa-total` e tag `back-v1.0.1`:

```text
us-central1-docker.pkg.dev/caixa-total/caixa-total/back:1.0.1
```

---

## 9. API — contratos úteis para sync e relatórios

Todas as rotas abaixo (exceto saúde) exigem header:

```http
Authorization: Bearer <JWT>
```

### 9.1 `GET /sync`

**Query params:**

| Param | Descrição |
|-------|-----------|
| `since` | ISO datetime; o front usa `1970-01-01T00:00:00.000Z` para trazer estado amplo |
| `storeId` | Opcional; escopo da loja (usuário de loja) |

**Resposta (JSON)** — formato esperado pelo front (`ServerSyncState` em `front/lib/api.ts`):

```json
{
  "products": [
    {
      "id": "uuid",
      "storeId": "uuid",
      "name": "Produto",
      "sku": null,
      "barcode": null,
      "stock": 10,
      "priceCents": 1999,
      "costCents": null,
      "category": "diversos",
      "imageUrl": null,
      "brand": null,
      "model": null,
      "size": null,
      "color": null,
      "description": null,
      "controlNumber": null,
      "createdAt": "2025-01-01T12:00:00.000Z",
      "updatedAt": "2025-01-01T12:00:00.000Z"
    }
  ],
  "sales": [
    {
      "id": "uuid",
      "storeId": "uuid",
      "createdAt": "2025-01-01T12:00:00.000Z",
      "totalCents": 1999,
      "itemsCount": 1,
      "customerName": null,
      "customerPhone": null
    }
  ],
  "sale_items": [
    {
      "id": "uuid",
      "saleId": "uuid",
      "productId": "uuid",
      "productName": "Produto",
      "sku": null,
      "qty": 1,
      "unitPriceCents": 1999,
      "lineTotalCents": 1999
    }
  ],
  "sale_payments": [
    {
      "id": "uuid",
      "saleId": "uuid",
      "method": "dinheiro",
      "amountCents": 1999
    }
  ],
  "stock_logs": [
    {
      "id": "uuid",
      "storeId": "uuid",
      "productId": "uuid",
      "productName": "Produto",
      "delta": -1,
      "reason": null,
      "createdAt": "2025-01-01T12:00:00.000Z"
    }
  ]
}
```

O front persiste isso em coleções no `IndexedDB` por loja (ver `applyServerState` em `front/lib/sync-conflict.ts`).

### 9.2 `POST /uploads/product-image/sign`

**Body JSON:** `storeId` (obrigatório para super admin), `contentType` (`image/jpeg` \| `png` \| `webp` \| `gif`), `fileSize` (bytes, máx. 2MB).

**Resposta:** `{ uploadUrl, publicUrl, objectName }` — o cliente faz `PUT` em `uploadUrl` com o binário e `Content-Type` igual ao pedido; grava `publicUrl` no campo `imageUrl` do produto.

### 9.3 `POST /sync`

Corpo JSON (resumo): `products`, `sales`, `sale_items`, `stock_logs` (e opcionalmente `storeId`). Tipagem detalhada no backend: `back/src/routes/sync.ts` (`SyncBody` e payloads). Produtos com `imageUrl` começando por `data:` são rejeitados (400).

### 9.4 Relatórios

Todas usam `start` e `end` em **ISO 8601** e opcional `storeId`.

| Rota | Resposta (resumo) |
|------|-------------------|
| `GET /report/summary` | Array de `{ date, totalCents, salesCount, itemsCount }` |
| `GET /report/sales` | Vendas com `items` e `payments` |
| `GET /report/top-products` | `{ productId, productName, totalQty, totalCents }[]` |

---

## 10. Banco de dados em produção (migrations)

O container do backend **não** roda migrations automaticamente no startup (comportamento padrão do projeto).

Após alterações no `schema.prisma`:

1. Gere/aplique migrations localmente ou em CI separado.
2. Contra o banco Neon (ou outro), com `DATABASE_URL` de produção:

```bash
cd back
DATABASE_URL="postgresql://..." pnpm db:migrate
```

Ou use o fluxo que a equipe adotar (Neon branching, job manual, etc.).

---

## 11. CORS e URL do front

Se o front for acessado por uma URL nova (domínio customizado ou novo serviço Cloud Run), atualize `FRONT_URL` no backend:

```bash
gcloud run services update caixa-total-back \
  --region us-central1 \
  --update-env-vars "FRONT_URL=https://NOVA-URL-DO-FRONT"
```

Múltiplas origens:

```bash
FRONT_URL=https://app1.com,https://app2.com,http://localhost:3000
```

---

## 12. Deploy manual (sem GitHub Actions)

Útil quando o CI está indisponível ou para debug.

### Backend

```bash
cd back
docker build --platform linux/amd64 \
  -t us-central1-docker.pkg.dev/SEU_PROJECT_ID/caixa-total/back:manual-$(date +%Y%m%d) .
docker push us-central1-docker.pkg.dev/SEU_PROJECT_ID/caixa-total/back:manual-YYYYMMDD
gcloud run deploy caixa-total-back \
  --image us-central1-docker.pkg.dev/SEU_PROJECT_ID/caixa-total/back:manual-YYYYMMDD \
  --region us-central1 \
  --port 4000 \
  --allow-unauthenticated
```

### Frontend

```bash
cd front
NEXT_PUBLIC_API_URL=https://SUA-API pnpm build
docker build --platform linux/amd64 \
  -t us-central1-docker.pkg.dev/SEU_PROJECT_ID/caixa-total/front:manual-$(date +%Y%m%d) .
docker push ...
gcloud run deploy caixa-total-front \
  --image ... \
  --region us-central1 \
  --port 8080 \
  --allow-unauthenticated
```

---

## 13. Checklist antes de uma release

- [ ] `main` está atualizada e testada localmente.
- [ ] Migrations aplicadas no banco de produção (se houver mudança de schema).
- [ ] `FRONT_URL` no backend cobre a URL pública do front.
- [ ] Secret `BACKEND_URL` no GitHub aponta para a API correta (para build do front).
- [ ] Tag nova incrementada (`back-v...` / `front-v...`).
- [ ] Após deploy do front, testar login, lista de produtos (veio do servidor) e relatórios.

---

## 14. Problemas comuns

| Sintoma | Causa provável |
|---------|-----------------|
| Pipeline falha em “Authenticate to GCP” | `GCP_SA_KEY` inválido ou expirado; JSON mal colado no secret |
| Push da imagem negado | SA sem `artifactregistry.writer` ou registry/repo incorreto |
| Deploy Cloud Run falha | Nome do serviço/região diferente do workflow; imagem não existe |
| Front chama `localhost:4000` em prod | Build sem `NEXT_PUBLIC_API_URL` / secret `BACKEND_URL` errado |
| Login ok mas produtos vazios em outro PC | Antes: só localStorage; agora: verificar se `GET /sync` retorna 200 e CORS |
| CORS bloqueado | `FRONT_URL` no backend não inclui a origem exata do navegador |
| Não consigo criar chave JSON da SA | Policy `iam.disableServiceAccountKeyCreation` na org/projeto |

---

## 15. Modelo de dados (referência rápida)

Fonte: `back/prisma/schema.prisma`.

Entidades principais: `Store`, `User`, `Product`, `Sale`, `SaleItem`, `SalePayment`, `StockLog`, `PasswordResetToken`.

Enums: `ProductCategory`, `PaymentMethod`, `UserRole`.

---

Documento mantido junto ao repositório; ajuste exemplos de URL e `PROJECT_ID` para o seu ambiente real.

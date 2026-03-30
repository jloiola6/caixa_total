# Caixa Total

Sistema de frente de caixa com gestão de produtos, estoque, vendas, relatórios e administração de múltiplas lojas.

O projeto é dividido em dois módulos principais:

- **`front/`**: aplicação em **Next.js** com interface de caixa, cadastro de produtos, relatórios, login e área administrativa.
- **`back/`**: API em **Express + Prisma + PostgreSQL** responsável por autenticação, administração, sincronização e relatórios centralizados.

## Visão geral do projeto

O Caixa Total foi estruturado para atender um fluxo de operação simples de loja, com suporte a uso local no navegador e sincronização com o backend.

### Principais funcionalidades

- Login com usuário **super admin** e **usuário de loja**.
- Cadastro e manutenção de **lojas** e **usuários por loja**.
- Cadastro de **produtos** com preço, estoque, SKU, código de barras, categoria e atributos adicionais.
- Operação de **caixa** com busca, leitura de código de barras, carrinho e fechamento de venda.
- Registro de **formas de pagamento** e dados opcionais do cliente.
- **Sincronização** dos dados locais do front com o backend.
- **Relatórios** de vendas, resumo diário e produtos mais vendidos.
- Recuperação de senha com link enviado por e-mail via **Resend** quando configurado.
- Estrutura preparada para uso em **web**, **desktop com Electron** e **Android com Capacitor**.

## Arquitetura resumida

### Front-end (`front/`)

A interface usa **Next.js** e mantém parte do fluxo operacional em `localStorage`, principalmente para produtos, vendas, itens de venda e logs de estoque por loja. Depois, esses dados podem ser sincronizados com o backend. Isso permite um uso mais flexível para operação de caixa e consulta local. O front também consome a API para autenticação, administração, sincronização e relatórios em modo somente leitura.

### Back-end (`back/`)

A API usa **Express** com **Prisma** sobre **PostgreSQL**. O backend inclui:

- **helmet** para headers de segurança HTTP;
- **CORS restrito** configurável via `FRONT_URL` (aceita múltiplas origens separadas por vírgula);
- **validação de env vars obrigatórias** no boot (`DATABASE_URL` e `JWT_SECRET` são exigidas);
- rotas de saúde, autenticação, administração, sincronização e relatórios.

### Dados no navegador (sync server-first)

O front combina **API** e **`localStorage`**:

- Após **login** ou ao **abrir o app já autenticado**, é executado `pullFromServer()` (`front/lib/sync-pull.ts`), que chama `GET /sync` e grava produtos, vendas, itens, pagamentos e logs de estoque no `localStorage`.
- Se a rede falhar, mantém-se o que já existir localmente (modo offline).
- A página de **relatórios** tenta **sempre** as rotas `GET /report/*` primeiro; em falha de rede, usa os dados locais.

Assim, o mesmo usuário vê dados consistentes entre dispositivos quando há conexão com a API.

## Stack utilizada

### Front

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Electron
- Capacitor

### Back

- Node.js 22
- Express
- TypeScript
- Prisma
- PostgreSQL
- JWT
- Helmet
- Resend

## Estrutura do repositório

```text
.
├── front/                # Aplicação Next.js / Electron / Capacitor
│   ├── Dockerfile        # Container nginx para deploy em produção
│   ├── nginx.conf        # Configuração do nginx para servir arquivos estáticos
│   └── ...
├── back/                 # API Express + Prisma
│   ├── Dockerfile        # Container Node.js multi-stage (pnpm)
│   └── ...
├── .github/workflows/    # CI/CD: deploy no Cloud Run ao push de tags
├── docs/
│   └── DEPLOY-PRODUCAO.md  # Guia detalhado: prod, variáveis, API, pipelines
├── docker-compose.yml    # PostgreSQL + backend em containers (uso local)
├── .env.example          # Exemplo consolidado de variáveis
└── README.md
```

---

## Desenvolvimento local

### Requisitos

- **Node.js 22** ou compatível.
- **pnpm** para gerenciar dependências.
- **Docker + Docker Compose** para o PostgreSQL (ou PostgreSQL 16+ local).

### 1. Instalar dependências

```bash
cd front && pnpm install
cd ../back && pnpm install
```

### 2. Configurar o banco de dados

**Opção A — Docker (recomendado):**

```bash
docker compose up -d postgres
```

**Opção B — PostgreSQL local:**

Crie um banco chamado `caixatotal` e ajuste a `DATABASE_URL` em `back/.env`.

### 3. Configurar variáveis de ambiente

```bash
cp back/.env.example back/.env
```

Ajuste os valores em `back/.env`:

```env
DATABASE_URL=postgresql://caixa:caixa@localhost:5433/caixatotal
JWT_SECRET=qualquer-chave-para-dev
FRONT_URL=http://localhost:3000
RESEND_API_KEY=
RESEND_FROM=onboarding@resend.dev
SEED_SUPER_ADMIN_EMAIL=admin@example.com
SEED_SUPER_ADMIN_PASSWORD=altere-me
```

> `DATABASE_URL` e `JWT_SECRET` são **obrigatórias**. O backend falha ao iniciar se não estiverem definidas.

### 4. Preparar o schema e seed

```bash
cd back
pnpm db:generate
pnpm db:push
pnpm db:seed
```

### 5. Subir o projeto

**Terminal 1 — backend:**

```bash
cd back
pnpm dev
```

**Terminal 2 — frontend:**

```bash
cd front
NEXT_PUBLIC_API_URL=http://localhost:4000 pnpm dev
```

### 6. Primeiro acesso

- **URL**: `http://localhost:3000/login`
- **E-mail**: `admin@example.com`
- **Senha**: `altere-me`

> Troque essas credenciais ao usar em ambiente real.

### Execução com Docker Compose (banco + backend)

```bash
docker compose up --build
```

Sobe o PostgreSQL e o backend em containers. O frontend continua sendo executado localmente apontando para `http://localhost:4000`.

---

## Deploy em produção (Google Cloud)

O projeto está configurado para deploy na nuvem usando **Cloud Run** (backend e frontend) e **Neon** (PostgreSQL serverless). Tudo dentro do free tier.

**Documentação completa (tags, secrets, schemas de API, checklist, troubleshooting):** [docs/DEPLOY-PRODUCAO.md](docs/DEPLOY-PRODUCAO.md).

### Atualização contínua (recomendado) — GitHub Actions

Com os secrets configurados no GitHub (`GCP_PROJECT_ID`, `GCP_SA_KEY`, `BACKEND_URL`), o deploy em produção é disparado por **push de tag**:

| Tag | O que publica |
|-----|----------------|
| `back-v1.0.1` | Backend → imagem `back:1.0.1` + deploy `caixa-total-back` |
| `front-v1.0.1` | Frontend → build com `NEXT_PUBLIC_API_URL` + imagem `front:1.0.1` + deploy `caixa-total-front` |

```bash
git tag back-v1.0.2
git push origin back-v1.0.2
```

Após o build/push da imagem, o job de deploy fica aguardando **aprovação manual** no environment `production`.

Para restringir aprovação a uma única pessoa: em **Settings → Environments → production → Required reviewers**, adicione apenas o usuário aprovador.

O workflow **não altera** variáveis sensíveis do Cloud Run (`DATABASE_URL`, `JWT_SECRET`, etc.); apenas atualiza a **imagem**. Ajuste essas variáveis no console do GCP ou com `gcloud run services update` quando necessário.

### Infraestrutura

| Serviço | Plataforma | Custo |
|---------|-----------|-------|
| Backend (API) | Google Cloud Run | $0 (free tier) |
| Frontend (estático) | Google Cloud Run + nginx | $0 (free tier) |
| Banco de dados | Neon PostgreSQL | $0 (free tier) |
| Imagens Docker | Artifact Registry | $0 (500MB grátis) |

### Pré-requisitos

- Conta no [Google Cloud](https://console.cloud.google.com) com billing ativo.
- Conta no [Neon](https://neon.tech) (free tier).
- **gcloud CLI** e **Docker** instalados localmente.

### 1. Configurar o banco no Neon

1. Crie um projeto no Neon (região próxima ao Cloud Run, ex: `us-east-1`).
2. Crie um database (ex: `caixa-total`).
3. Copie a connection string.
4. Rode as migrations e seed apontando para o Neon:

```bash
cd back
DATABASE_URL="postgresql://..." pnpm db:migrate
DATABASE_URL="postgresql://..." pnpm db:seed
```

### 2. Configurar o projeto GCP

```bash
gcloud auth login
gcloud projects create SEU_PROJECT_ID --name="Caixa Total"
gcloud config set project SEU_PROJECT_ID

gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com

gcloud artifacts repositories create caixa-total \
  --repository-format=docker \
  --location=us-central1

gcloud auth configure-docker us-central1-docker.pkg.dev
```

### 3. Deploy do backend

```bash
cd back

docker build --platform linux/amd64 \
  -t us-central1-docker.pkg.dev/SEU_PROJECT_ID/caixa-total/back:v1 .

docker push us-central1-docker.pkg.dev/SEU_PROJECT_ID/caixa-total/back:v1

gcloud run deploy caixa-total-back \
  --image us-central1-docker.pkg.dev/SEU_PROJECT_ID/caixa-total/back:v1 \
  --port 4000 \
  --allow-unauthenticated \
  --region us-central1 \
  --memory 256Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 2 \
  --set-env-vars "\
DATABASE_URL=SUA_CONNECTION_STRING_NEON,\
JWT_SECRET=$(openssl rand -base64 32),\
FRONT_URL=*"
```

> Anote a URL retornada (ex: `https://caixa-total-back-xxx.us-central1.run.app`). Guarde o `JWT_SECRET` gerado.

Teste:

```bash
curl https://URL_DO_BACKEND/health
# {"status":"ok","db":"connected"}
```

### 4. Deploy do frontend

```bash
cd front

NEXT_PUBLIC_API_URL=https://URL_DO_BACKEND pnpm build

docker build --platform linux/amd64 \
  -t us-central1-docker.pkg.dev/SEU_PROJECT_ID/caixa-total/front:v1 .

docker push us-central1-docker.pkg.dev/SEU_PROJECT_ID/caixa-total/front:v1

gcloud run deploy caixa-total-front \
  --image us-central1-docker.pkg.dev/SEU_PROJECT_ID/caixa-total/front:v1 \
  --port 8080 \
  --allow-unauthenticated \
  --region us-central1 \
  --memory 128Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 2
```

### 5. Restringir CORS do backend

Após obter a URL final do front, atualize o CORS:

```bash
gcloud run services update caixa-total-back \
  --region us-central1 \
  --update-env-vars "FRONT_URL=https://URL_DO_FRONTEND"
```

### Variáveis de ambiente em produção

| Variável | Onde | Obrigatória | Descrição |
|----------|------|:-----------:|-----------|
| `DATABASE_URL` | Backend | Sim | Connection string do PostgreSQL (Neon) |
| `JWT_SECRET` | Backend | Sim | Chave secreta para assinar tokens JWT |
| `FRONT_URL` | Backend | Nao | Origens permitidas no CORS (separar por `,`). `*` libera tudo |
| `RESEND_API_KEY` | Backend | Nao | Chave da API Resend para envio de e-mails |
| `RESEND_FROM` | Backend | Nao | Remetente dos e-mails (padrão: `onboarding@resend.dev`) |
| `NEXT_PUBLIC_API_URL` | Frontend | Sim (build time) | URL do backend, embutida no build estático |

### Re-deploy (atualizações)

**Preferência:** use as tags `back-v*` e `front-v*` e o pipeline do GitHub Actions (ver tabela acima e [docs/DEPLOY-PRODUCAO.md](docs/DEPLOY-PRODUCAO.md)).

**Manual (fallback):** build local da imagem, push para o Artifact Registry e `gcloud run deploy` com a nova tag de imagem — mesmo fluxo das seções 3 e 4 deste README, incrementando a versão (`v2`, `v3`, …).

### Atualização em produção (passo a passo detalhado)

Esta seção descreve o fluxo recomendado para atualizar o sistema em produção com segurança, incluindo mudanças de banco (migrations) e publicação das novas imagens.

#### 1. Preparar release e validar localmente

```bash
# Na raiz do projeto
pnpm -C back db:generate
pnpm -C back build
pnpm -C front build
```

Se o backend tiver mudança de schema Prisma (como a tabela de notificações), confirme que existe uma pasta nova em `back/prisma/migrations/`.

#### 2. Aplicar migrations no banco de produção

Use a `DATABASE_URL` de produção (Neon/GCP/etc). O script do projeto para produção é:

```bash
DATABASE_URL="postgresql://USUARIO:SENHA@HOST:PORTA/DB" pnpm -C back db:migrate
```

Esse comando executa `prisma migrate deploy`, que aplica somente migrations pendentes.

#### 2.1. Caso especial: banco antigo sem histórico Prisma (`P3005`)

Se o banco já existia antes do versionamento por migration, o `deploy` pode retornar:

```text
Error: P3005 The database schema is not empty.
```

Nesse caso, faça o baseline uma única vez (marcar migrations antigas como já aplicadas) e depois rode o deploy:

```bash
DATABASE_URL="postgresql://USUARIO:SENHA@HOST:PORTA/DB" \
pnpm -C back exec prisma migrate resolve --applied 20250302000000_init

DATABASE_URL="postgresql://USUARIO:SENHA@HOST:PORTA/DB" \
pnpm -C back exec prisma migrate resolve --applied 20250302100000_add_multi_tenant

DATABASE_URL="postgresql://USUARIO:SENHA@HOST:PORTA/DB" \
pnpm -C back exec prisma migrate deploy
```

Depois do baseline, as próximas atualizações voltam ao fluxo normal (`db:migrate`).

#### 3. Publicar backend em produção

Fluxo recomendado (CI/CD com aprovação manual):

```bash
git tag back-vX.Y.Z
git push origin back-vX.Y.Z
```

No GitHub Actions, aprove o job no environment `production` (configurado com reviewer obrigatório).

#### 4. Publicar frontend em produção

Após backend atualizado e saudável:

```bash
git tag front-vX.Y.Z
git push origin front-vX.Y.Z
```

Também exige aprovação manual no environment `production`.

#### 5. Verificação pós-deploy (smoke test)

```bash
curl https://URL_DO_BACKEND/health
```

Esperado:

```json
{"status":"ok","db":"connected"}
```

Além disso, valide no sistema:

1. Login com usuário de loja.
2. Registro de uma nova venda.
3. Abertura da tela `/notificacoes` para confirmar criação da notificação no banco.
4. Marcar notificação como lida e confirmar atualização do contador.

---

## Desktop com Electron

O front possui um entrypoint em `front/electron/main.js`.

No modo desktop, a aplicação usa os arquivos estáticos de `out/` e um proxy local:

- Front chama a API em `/api/*`.
- Electron faz proxy de `/api/*` para o backend real (`DESKTOP_API_URL`).
- Isso evita bloqueio de CORS no login e nas demais rotas.

### Desenvolvimento

Com o Next em execução em `http://localhost:3000`:

```bash
cd front
pnpm electron
```

### Build para distribuição

```bash
cd front
pnpm build:desktop
```

Para gerar o executável Linux (`.AppImage`):

```bash
cd front
pnpm dist:linux
```

Para gerar o executável/instalador Windows (`.exe`):

```bash
cd front
pnpm dist:win
```

Saída padrão: `front/dist-desktop/`.

Para trocar o backend do desktop sem alterar código:

```bash
cd front
DESKTOP_API_URL=https://SEU_BACKEND pnpm build:desktop
DESKTOP_API_URL=https://SEU_BACKEND pnpm dist:linux
DESKTOP_API_URL=https://SEU_BACKEND pnpm dist:win
```

> Use `DESKTOP_API_URL` sem o sufixo `/api`. Exemplo correto: `https://seu-backend.run.app`.
>
> Em Linux, gerar `.exe` pode exigir dependências como `wine`. Se faltar no ambiente local, rode o `dist:win` em uma máquina Windows (ou CI Windows).

Fallback via Docker (Linux sem `wine` instalado):

```bash
cd front
docker run --rm \
  -u $(id -u):$(id -g) \
  -e CI=true \
  -e HOME=/project/.home \
  -e XDG_CACHE_HOME=/project/.cache \
  -e WINEPREFIX=/project/.wine \
  -v "$PWD":/project \
  -w /project \
  electronuserland/builder:wine \
  bash -lc "mkdir -p /project/.home /project/.cache /project/.wine && npx -y pnpm@10.32.1 dist:win"
```

### Modo debug do desktop (login/API)

Use este fluxo para diagnosticar falhas de login no executável:

```bash
cd front
DESKTOP_API_URL=https://SEU_BACKEND pnpm desktop:debug
```

No modo debug, o Electron:

- abre DevTools automaticamente;
- loga cada proxy de `/api/*` no terminal;
- exibe o backend final resolvido (`Desktop API URL`);
- expõe um endpoint local de diagnóstico em `http://127.0.0.1:<porta>/__desktop_debug`.

Se quiser rodar debug sem rebuild:

```bash
cd front
DESKTOP_API_URL=https://SEU_BACKEND pnpm desktop:debug:run
```

## Android com Capacitor

Fluxo básico:

```bash
cd front
NEXT_PUBLIC_API_URL=https://URL_DO_BACKEND pnpm build
pnpm cap:sync
pnpm android:emulator
```

> Requer Android Studio e SDK configurados na máquina.

---

## Fluxo recomendado de uso

### 1. Entrar no sistema

- Acesse `/login`.
- **SUPER_ADMIN** é direcionado para `/admin`.
- **STORE_USER** é direcionado para `/caixa`.

### 2. Configurar lojas e usuários

Com um **SUPER_ADMIN**: crie lojas, selecione uma loja e cadastre os usuários.

### 3. Cadastrar produtos

Na tela `/produtos`: nome, categoria, preço, estoque, SKU, código de barras, marca/modelo/tamanho/cor, imagem e descrição.

### 4. Operar o caixa

Na tela `/caixa`: buscar produtos, adicionar ao carrinho, leitura de código de barras, finalizar venda e registrar pagamentos.

Atalhos: `F2` (busca), `Enter` (adicionar), `F9` (finalizar), `Esc` (limpar).

### 5. Sincronizar dados

Após operações de venda ou ajuste de produto, o front sincroniza os dados locais com a API.

### 6. Acompanhar relatórios

Na tela `/relatorios`: receita total, quantidade de vendas, ticket médio, gráfico por período, ranking de produtos e detalhamento.

Os dados vêm **da API quando há conexão**; sem rede, a tela usa o que estiver no `localStorage`. O modo somente leitura (`NEXT_PUBLIC_READ_ONLY=true` ou `?view=report`) continua disponível para cenários específicos de visualização.

---

## Scripts úteis

### Back (`back/package.json`)

| Script | Descrição |
|--------|-----------|
| `pnpm dev` | Inicia o backend em modo desenvolvimento (hot reload) |
| `pnpm build` | Compila TypeScript para `dist/` |
| `pnpm start` | Inicia o backend compilado |
| `pnpm db:generate` | Gera o Prisma Client |
| `pnpm db:migrate` | Aplica migrations pendentes |
| `pnpm db:push` | Sincroniza o schema com o banco (sem migration) |
| `pnpm db:seed` | Cria o SUPER_ADMIN inicial |

### Front (`front/package.json`)

| Script | Descrição |
|--------|-----------|
| `pnpm dev` | Inicia o Next.js em desenvolvimento |
| `pnpm build` | Gera o export estático em `out/` |
| `pnpm lint` | Roda o ESLint |
| `pnpm electron` | Abre o Electron apontando para dev ou build |
| `pnpm build:static:desktop` | Gera build estático desktop com API em `/api` |
| `pnpm build:desktop` | Build + Electron |
| `pnpm desktop:debug` | Build + Electron em modo debug (logs de proxy/API) |
| `pnpm desktop:debug:run` | Abre desktop em debug sem rebuild |
| `pnpm dist:linux` | Gera executável Linux (`.AppImage`) |
| `pnpm dist:win` | Gera executável/instalador Windows (`.exe`) |
| `pnpm cap:sync` | Sincroniza com o Capacitor |
| `pnpm android:emulator` | Roda no emulador Android |

---

## Endpoints principais da API

### Saúde

- `GET /health`

### Autenticação

- `POST /auth/login`
- `POST /auth/forgot-password`
- `POST /auth/reset-password`
- `GET /auth/me`

### Administração

- `GET /admin/stores`
- `POST /admin/stores`
- `PATCH /admin/stores/:id`
- `DELETE /admin/stores/:id`
- `GET /admin/stores/:storeId/users`
- `POST /admin/stores/:storeId/users`
- `PATCH /admin/users/:id`
- `DELETE /admin/users/:id`

### Sincronização

- `GET /sync`
- `POST /sync`

### Relatórios

- `GET /report/summary`
- `GET /report/sales`
- `GET /report/top-products`

### Notificações

- `GET /notifications`
- `GET /notifications/unread-count`
- `PATCH /notifications/:id/read`
- `POST /notifications/read-all`

---

## Modelo de dados resumido

Entidades: `Store`, `User`, `PasswordResetToken`, `Product`, `Sale`, `SaleItem`, `SalePayment`, `StockLog`, `Notification`.

Enums:

- Categorias: `roupas`, `tenis`, `controles`, `eletronicos`, `diversos`
- Pagamentos: `dinheiro`, `credito`, `debito`, `fiado`
- Perfis: `SUPER_ADMIN`, `STORE_USER`
- Notificações: `sale_created`

---

## Solução de problemas

### O front não consegue acessar a API

- Backend em execução?
- `NEXT_PUBLIC_API_URL` correto?
- Porta `4000` liberada?
- Em produção: `FRONT_URL` no backend inclui a URL do front?
- No desktop: confirme se o Electron subiu com proxy `/api` e, se necessário, defina `DESKTOP_API_URL=https://URL_DO_BACKEND`.

### Erro no login

- Seed foi executado?
- `JWT_SECRET` definido?
- Backend usando o `.env` correto?
- No desktop: se abrir mas não logar, gere novamente com `pnpm build:desktop` (ou `pnpm dist:linux`) e backend correto em `DESKTOP_API_URL`.
- Para diagnóstico rápido no desktop: rode `pnpm desktop:debug` e consulte `__desktop_debug`.

### E-mail de recuperação não funciona

Sem `RESEND_API_KEY`, o backend registra o link de redefinição apenas no log do servidor.

### Problemas com banco de dados

```bash
curl http://localhost:4000/health
# ou em produção:
curl https://URL_DO_BACKEND/health
```

Resposta esperada: `{"status":"ok","db":"connected"}`.

### Produtos ou relatórios diferentes entre computadores

Confirme CORS (`FRONT_URL` no backend), `NEXT_PUBLIC_API_URL` / secret `BACKEND_URL` no build do front, e se `GET /sync` e `GET /report/*` retornam 200 com o token do usuário. Ver [docs/DEPLOY-PRODUCAO.md](docs/DEPLOY-PRODUCAO.md) (sync e contratos da API).

### Backend não inicia

Verifique se `DATABASE_URL` e `JWT_SECRET` estão definidas. O backend exige essas variáveis e falha imediatamente se estiverem ausentes.

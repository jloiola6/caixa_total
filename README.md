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

A API usa **Express** com **Prisma** sobre **PostgreSQL**. O banco centraliza:

- lojas;
- usuários;
- tokens de redefinição de senha;
- produtos;
- vendas;
- itens de venda;
- pagamentos;
- movimentações de estoque.

Além disso, o backend expõe rotas de saúde, autenticação, administração, sincronização e relatórios.

## Stack utilizada

### Front

- Next.js
- React
- TypeScript
- Tailwind CSS
- Electron
- Capacitor

### Back

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- JWT
- Resend

## Requisitos

Antes de começar, tenha instalado:

- **Node.js 22** ou compatível com o projeto.
- **pnpm** para instalar e executar os apps Node.
- **Docker + Docker Compose** se quiser subir o PostgreSQL e o backend por container.
- **PostgreSQL 16+** se quiser rodar o banco localmente sem Docker.

> Observação: como o repositório possui apps separados em `front/` e `back/`, o fluxo mais seguro é instalar as dependências em cada pasta individualmente.

## Estrutura do repositório

```text
.
├── front/                # Aplicação Next.js / Electron / Capacitor
├── back/                 # API Express + Prisma
├── docker-compose.yml    # PostgreSQL + backend em containers
├── .env.example          # Exemplo consolidado de variáveis
└── README.md
```

## Variáveis de ambiente

### 1) Arquivo raiz opcional

Existe um `.env.example` na raiz com uma visão consolidada das variáveis do projeto. Você pode usá-lo como referência geral.

### 2) Backend

Copie o arquivo de exemplo do backend:

```bash
cp back/.env.example back/.env
```

Depois ajuste os valores conforme o seu ambiente:

```env
DATABASE_URL=postgresql://caixa:caixa@localhost:5432/caixatotal
PORT=4000
JWT_SECRET=altere-em-producao-use-uma-chave-longa-e-segura
FRONT_URL=http://localhost:3000
RESEND_API_KEY=
RESEND_FROM=onboarding@resend.dev
SEED_SUPER_ADMIN_EMAIL=admin@example.com
SEED_SUPER_ADMIN_PASSWORD=altere-me
```

### 3) Frontend

O front usa principalmente esta variável:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Você pode exportá-la no shell antes de subir o front ou criar um arquivo `.env.local` dentro de `front/` com esse valor.

### 4) Modo somente leitura para relatórios

A tela de relatórios também pode operar em modo somente leitura via API quando `NEXT_PUBLIC_READ_ONLY=true` ou quando a rota recebe `?view=report`.

## Fluxo de instalação local

### 1. Instalar dependências

Instale as dependências do front:

```bash
cd front
pnpm install
```

Instale as dependências do back:

```bash
cd ../back
pnpm install
```

## Configuração do banco de dados

Você pode escolher entre **Docker** ou **PostgreSQL local**.

### Opção A — Banco com Docker

Na raiz do projeto:

```bash
docker compose up -d postgres
```

Isso sobe um PostgreSQL 16 com os padrões definidos no `docker-compose.yml`.

### Opção B — Banco local sem Docker

Crie um banco chamado `caixatotal` e ajuste a `DATABASE_URL` do arquivo `back/.env` apontando para a sua instância local.

## Preparar o schema e seed

Com o banco disponível e o `back/.env` configurado:

```bash
cd back
pnpm db:generate
pnpm db:push
pnpm db:seed
```

### O que cada comando faz

- `pnpm db:generate`: gera o client do Prisma.
- `pnpm db:push`: cria/atualiza as tabelas conforme o schema atual.
- `pnpm db:seed`: cria o primeiro usuário **SUPER_ADMIN**, caso ainda não exista.

## Como rodar o projeto em desenvolvimento

Você vai subir o backend e o frontend em terminais separados.

### Terminal 1 — backend

```bash
cd back
pnpm dev
```

API padrão: `http://localhost:4000`

### Terminal 2 — frontend

```bash
cd front
NEXT_PUBLIC_API_URL=http://localhost:4000 pnpm dev
```

Front padrão: `http://localhost:3000`

## Primeiro acesso

Depois de executar a seed, faça login com o super admin configurado em `back/.env`.

Exemplo padrão:

- **E-mail**: `admin@example.com`
- **Senha**: `altere-me`

> Troque essas credenciais assim que iniciar o projeto em um ambiente real.

## Fluxo recomendado de uso

### 1. Entrar no sistema

- Acesse `/login`.
- Faça login como **SUPER_ADMIN** ou **STORE_USER**.
- O super admin é direcionado para `/admin`.
- O usuário de loja é direcionado para `/caixa`.

### 2. Configurar lojas e usuários

Com um usuário **SUPER_ADMIN**:

- crie uma ou mais lojas;
- selecione uma loja;
- cadastre os usuários dessa loja.

### 3. Cadastrar produtos

Na tela `/produtos`, cadastre os itens do estoque com:

- nome;
- categoria;
- preço;
- estoque;
- SKU;
- código de barras;
- marca/modelo/tamanho/cor;
- imagem e descrição, quando necessário.

### 4. Operar o caixa

Na tela `/caixa`, o operador pode:

- buscar produtos por nome, SKU, marca, modelo, código de barras ou número de controle;
- adicionar itens ao carrinho;
- usar leitura de código de barras;
- alterar quantidade;
- finalizar a venda;
- registrar pagamentos em dinheiro, crédito, débito ou fiado.

Atalhos disponíveis no caixa:

- `F2`: focar a busca;
- `Enter`: adicionar item quando aplicável;
- `F9`: finalizar venda;
- `Esc`: limpar carrinho.

### 5. Sincronizar dados

Após operações como venda ou ajuste/cadastro de produto, o front pode sincronizar os dados locais com a API. Esse fluxo envia produtos, vendas, itens e logs de estoque para a loja associada ao usuário.

### 6. Acompanhar relatórios

Na tela `/relatorios`, você consegue visualizar:

- receita total;
- quantidade de vendas;
- ticket médio;
- total de itens vendidos;
- gráfico por período;
- ranking de produtos;
- detalhamento das vendas.

## Execução com Docker

Se você quiser subir banco e backend via containers:

```bash
docker compose up --build
```

Esse fluxo:

- sobe o PostgreSQL;
- builda o backend em `back/Dockerfile`;
- executa `prisma migrate deploy` antes de iniciar a API.

> Nesse cenário, o frontend continua sendo executado localmente fora do Docker, apontando para `http://localhost:4000`.

## Scripts úteis

### Back (`back/package.json`)

```bash
pnpm dev
pnpm build
pnpm start
pnpm db:generate
pnpm db:migrate
pnpm db:push
pnpm db:seed
```

### Front (`front/package.json`)

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
pnpm electron
pnpm build:desktop
pnpm android:emulator
pnpm android:device
pnpm cap:sync
```

## Build para produção

### Backend

```bash
cd back
pnpm build
pnpm start
```

### Front web

```bash
cd front
NEXT_PUBLIC_API_URL=http://localhost:4000 pnpm build
```

Esse build gera a saída estática em `front/out`. Como o projeto está com `output: "export"`, o deploy web ideal é servir esse diretório com um servidor estático ou uma hospedagem compatível com sites estáticos.

> O script `pnpm start` existe no projeto, mas com `output: "export"` a estratégia principal de publicação tende a ser servir os arquivos exportados em `front/out`.

## Desktop com Electron

O front possui um entrypoint em `front/electron/main.js`.

### Desenvolvimento

Com o Next em execução em `http://localhost:3000`:

```bash
cd front
pnpm electron
```

### Execução após build web

```bash
cd front
pnpm build:desktop
```

Quando existe `front/out/index.html`, o Electron passa a carregar os arquivos estáticos gerados pelo build.

## Android com Capacitor

O projeto já possui configuração inicial de Capacitor.

Fluxo básico:

```bash
cd front
pnpm build
pnpm cap:sync
pnpm android:emulator
```

> Para rodar no Android, você também precisa do Android Studio e do SDK devidamente configurados na máquina.

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

## Modelo de dados resumido

As entidades principais do banco são:

- `Store`
- `User`
- `PasswordResetToken`
- `Product`
- `Sale`
- `SaleItem`
- `SalePayment`
- `StockLog`

Também existem enums para:

- categorias de produto: `roupas`, `tenis`, `controles`, `eletronicos`, `diversos`;
- métodos de pagamento: `dinheiro`, `credito`, `debito`, `fiado`;
- perfis de usuário: `SUPER_ADMIN`, `STORE_USER`.

## Solução de problemas

### O front não consegue acessar a API

Verifique:

- se o backend está em execução;
- se `NEXT_PUBLIC_API_URL` aponta para `http://localhost:4000` ou para a URL correta;
- se a porta `4000` está liberada.

### Erro no login

Verifique:

- se o seed foi executado;
- se o usuário existe no banco;
- se `JWT_SECRET` está definido;
- se o backend está usando o `.env` correto.

### E-mail de recuperação não funciona

Sem `RESEND_API_KEY`, o backend não envia o e-mail de fato e apenas registra o link de redefinição no log do servidor.

### Problemas com banco de dados

Teste o endpoint de saúde:

```bash
curl http://localhost:4000/health
```

Se tudo estiver correto, a resposta deve indicar `status: ok` e `db: connected`.

## Resumo rápido do fluxo de subida

```bash
# 1) Banco
cd /workspace/caixa_total
docker compose up -d postgres

# 2) Backend
cp back/.env.example back/.env
cd back
pnpm install
pnpm db:generate
pnpm db:push
pnpm db:seed
pnpm dev

# 3) Frontend
cd ../front
pnpm install
NEXT_PUBLIC_API_URL=http://localhost:4000 pnpm dev
```

Depois disso:

- front em `http://localhost:3000`
- back em `http://localhost:4000`
- login com o super admin definido no seed

---

Se quiser, no próximo passo eu também posso transformar este README em uma versão mais curta e comercial, ou em uma versão mais técnica para deploy em produção.

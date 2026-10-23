# Gestão 3D

ERP simples para uma oficina de impressão 3D: clientes, pedidos, etapas de
produção, valores e documentos anexados.

## Stack

- pnpm workspaces + Node.js 24 + TypeScript
- Frontend: React 19 + Vite + Tailwind
- API: Express 5 (função serverless na Vercel)
- Banco: PostgreSQL + Drizzle ORM
- Arquivos: Vercel Blob (store privado)
- Autenticação: e-mail/senha com sessões em Postgres

## Estrutura

- `artifacts/gestao-impressao-3d` — frontend Vite/React
- `artifacts/api-server` — API Express
- `api/index.ts` — entrypoint da função serverless da Vercel
- `lib/db` — schema Drizzle e migrations
- `lib/api-client-react` / `lib/api-zod` — client e schemas gerados
- `lib/auth-web` — hook de autenticação do frontend

## Desenvolvimento local

```bash
pnpm install
cp .env.example .env.local
# preencha DATABASE_URL, credenciais do admin e BLOB_READ_WRITE_TOKEN

pnpm db:migrate        # cria as tabelas
pnpm dev:api           # API em http://localhost:5000
pnpm dev:web           # frontend em http://localhost:3000
```

O frontend chama `/api/...`; em produção ambos ficam no mesmo domínio da Vercel.
Para testar uploads localmente, rode `vercel env pull` para baixar as variáveis
do Blob store (o token de desenvolvimento precisa estar habilitado no store).

### Primeiro acesso

1. Defina `AUTH_ADMIN_EMAIL` e `AUTH_ADMIN_PASSWORD`.
2. Faça login com esses dados. A conta é criada automaticamente na primeira
   tentativa bem-sucedida.
3. Depois do primeiro acesso, troque a senha direto no banco ou remova as
   variáveis `AUTH_ADMIN_*` e mantenha o usuário criado.

## Banco de dados

```bash
pnpm db:generate   # gera uma nova migration a partir do schema
pnpm db:migrate    # aplica as migrations pendentes
pnpm db:push       # aplica o schema direto (apenas desenvolvimento)
```

As migrations ficam em `lib/db/drizzle`. Rode `pnpm db:migrate` contra o banco de
produção antes do primeiro deploy funcional.

## Deploy na Vercel

### 1. Banco

Crie um PostgreSQL (Neon, Supabase ou Vercel Postgres) e copie a connection
string com pooler. Para serverless, use a URL com pooler (`-pooler` no caso da
Neon, porta `6543` no Supabase, etc.).

### 2. Blob

No projeto da Vercel, abra **Storage > Create Database > Blob**, escolha acesso
**Private** e conecte o store ao projeto. A Vercel cria
`BLOB_READ_WRITE_TOKEN` automaticamente.

### 3. Variáveis de ambiente

Configure em **Project > Settings > Environment Variables**:

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | sim | Connection string do Postgres |
| `AUTH_ADMIN_EMAIL` | sim | E-mail do admin inicial |
| `AUTH_ADMIN_PASSWORD` | sim | Senha do admin inicial |
| `AUTH_ADMIN_NAME` | não | Nome exibido do admin |
| `BLOB_READ_WRITE_TOKEN` | para uploads | Token do Vercel Blob privado |
| `CORS_ORIGIN` | não | Origens permitidas, separadas por vírgula |
| `LOG_LEVEL` | não | Nível de log da API |

### 4. Migrations em produção

Com a `DATABASE_URL` de produção no ambiente local:

```bash
DATABASE_URL="postgresql://..." pnpm db:migrate
```

### 5. Import do projeto

1. Suba o repositório para o GitHub e importe na Vercel.
2. Root Directory: raiz do repositório.
3. Framework Preset: **Other** (o `vercel.json` já configura tudo).
4. Build Command: `pnpm run build:vercel` (já definido).
5. Output Directory: `artifacts/gestao-impressao-3d/dist/public` (já definido).
6. Deploy.

O `vercel.json` mantém:

- `/api/*` → função Express em `api/index.ts`
- todo o restante → SPA React (`index.html`)

### Verificação

- `GET /api/healthz` deve responder `{"status":"ok"}`.
- O login deve criar a sessão e liberar o painel.
- Anexos devem subir direto para o Blob privado e abrir via
  `/api/storage/objects/...`.

## Typecheck e build

```bash
pnpm typecheck
pnpm build          # inclui todos os workspaces
pnpm build:vercel   # usado pela Vercel
```

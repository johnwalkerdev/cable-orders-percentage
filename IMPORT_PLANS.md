# Importação de Plans

Este sistema permite importar plans de outras fontes (banco de dados, API ou arquivo JSON) para criar logins automaticamente.

## Formas de Importação

### 1. Via API (POST /api/import/plans)

```bash
curl -X POST http://localhost:3000/api/import/plans \
  -H "Content-Type: application/json" \
  -d '{
    "plans": [
      {"login": "usuario1", "onTurf": 0, "offTurf": 0},
      {"login": "usuario2", "onTurf": 10, "offTurf": 5}
    ]
  }'
```

Ou buscar de uma API externa:

```bash
curl -X POST http://localhost:3000/api/import/plans \
  -H "Content-Type: application/json" \
  -d '{
    "source": "api",
    "apiUrl": "https://api.example.com/plans"
  }'
```

Ou buscar de outro banco PostgreSQL:

```bash
curl -X POST http://localhost:3000/api/import/plans \
  -H "Content-Type: application/json" \
  -d '{
    "source": "db",
    "connectionString": "postgresql://user:pass@host/db",
    "companyFilter": "B2S ENTERPRISES LLC"
  }'
```

### 2. Via Script CLI

#### Importar de outro banco PostgreSQL:

```bash
npm run import-plans -- --from-db "postgresql://user:pass@host/db" --company "B2S ENTERPRISES LLC"
```

#### Importar de uma API:

```bash
npm run import-plans -- --from-api "https://api.example.com/plans"
```

#### Importar de arquivo JSON:

```bash
npm run import-plans -- --from-file "./plans.json"
```

#### Importar diretamente (JSON string):

```bash
npm run import-plans -- --plans '[{"login":"user1","onTurf":0,"offTurf":0}]'
```

## Estrutura Esperada dos Plans

Os plans devem ter pelo menos um campo que identifique o login:

```json
{
  "login": "nome_do_usuario",
  "onTurf": 0,
  "offTurf": 0
}
```

Ou alternativamente:

```json
{
  "username": "nome_do_usuario",
  "name": "Nome do Usuário",
  "on_turf": 0,
  "off_turf": 0,
  "company": "B2S ENTERPRISES LLC"
}
```

## Estrutura da Tabela Plans (Banco Externo)

Se estiver importando de outro banco PostgreSQL, a tabela `plans` deve ter colunas como:

- `login` ou `username` ou `name` (identificador do usuário)
- `on_turf` (opcional, padrão: 0)
- `off_turf` (opcional, padrão: 0)
- `company` (opcional, para filtrar)

## Exemplo: Importar Plans de B2S ENTERPRISES LLC

Se você tem acesso ao banco onde estão os plans:

```bash
npm run import-plans -- --from-db "postgresql://user:pass@host/dbname" --company "B2S ENTERPRISES LLC"
```

Ou se você tem uma API que retorna os plans:

```bash
curl -X POST https://seu-dominio.vercel.app/api/import/plans \
  -H "Content-Type: application/json" \
  -d '{
    "source": "db",
    "connectionString": "postgresql://user:pass@host/dbname",
    "companyFilter": "B2S ENTERPRISES LLC"
  }'
```

## Notas

- Logins duplicados serão ignorados (não serão criados novamente)
- Cada login receberá um slug único automaticamente
- O cache é limpo automaticamente após a importação
- A importação é transacional (rollback em caso de erro)


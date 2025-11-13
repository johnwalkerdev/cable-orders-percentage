# Sistema de Permissões e Organizações

## Visão Geral

O sistema implementa controle de acesso baseado em organizações e roles, permitindo que usuários tenham diferentes permissões em diferentes organizações.

## Estrutura

### Tabelas

1. **organizations**: Armazena as organizações
   - `id` (UUID): Identificador único
   - `name`: Nome da organização
   - `company_name`: Nome da empresa
   - `created_at`, `updated_at`: Timestamps

2. **user_organizations**: Relaciona usuários com organizações e seus roles
   - `id` (UUID): Identificador único
   - `user_email`: Email do usuário
   - `organization_id`: ID da organização
   - `role`: Role do usuário ('admin', 'vendor', 'viewer')
   - `created_at`, `updated_at`: Timestamps
   - UNIQUE(user_email, organization_id): Um usuário só pode ter um role por organização

3. **logins**: Agora possui `organization_id` para associar logins a organizações

### Roles e Hierarquia

- **admin** (nível 3): Acesso total, pode ver e editar tudo na organização, pode ver outras organizações
- **vendor** (nível 2): Pode visualizar e editar dados da organização
- **viewer** (nível 1): Apenas visualização

## Cenário de Exemplo: Andressa

### Configuração
- **Email**: andressaferrarig@gmail.com
- **B2S ENTERPRISES LLC**: Role = `admin`
- **Organization 2 de teste**: Role = `vendor`

### Permissões

#### 1. Visualização de Vendas

**Pergunta**: Ela visualiza as vendas nas duas organizações?

**Resposta**: ✅ **SIM**

- Como **admin** em B2S ENTERPRISES LLC, ela pode ver todos os logins/vendas dessa organização
- Como **vendor** em Organization 2 de teste, ela pode ver todos os logins/vendas dessa organização
- Ela vê dados de **ambas as organizações** quando faz requisições à API

#### 2. Visualização de Commissions

**Pergunta**: Em B2S ENTERPRISES LLC ela visualiza as commissions de "Organization 2 de teste"?

**Resposta**: ✅ **SIM** (com ressalvas)

- Como **admin** em B2S ENTERPRISES LLC, ela tem acesso amplo
- A função `canViewOrganization()` permite que admins vejam outras organizações
- **Porém**, a implementação atual permite que admins vejam todas as organizações onde têm acesso
- Se você quiser restringir para que admin só veja a própria organização, ajuste a função `canViewOrganization()`

#### 3. Criação de Commissions

**Pergunta**: Ela pode criar commissions para outros vendors?

**Resposta**: ✅ **SIM** (como admin)

- Como **admin** em B2S ENTERPRISES LLC, ela pode:
  - Editar qualquer login/venda dessa organização
  - Criar novos logins
  - Gerenciar permissões de outros usuários (se implementado)
- Como **vendor** em Organization 2 de teste, ela pode:
  - Editar logins/vendas dessa organização
  - Mas **não** pode gerenciar permissões de outros usuários

## Como Usar

### 1. Configurar Permissões

Execute o script de setup:

```bash
npm run setup-permissions
```

Isso criará:
- Organizações: "B2S ENTERPRISES LLC" e "Organization 2 de teste"
- Permissões para andressaferrarig@gmail.com

### 2. Fazer Requisições com Autenticação

#### Buscar logins de um usuário específico:

```bash
curl "http://localhost:3000/api/logins?userEmail=andressaferrarig@gmail.com"
```

Ou via header:

```bash
curl -H "X-User-Email: andressaferrarig@gmail.com" \
  "http://localhost:3000/api/logins"
```

#### Filtrar por organização:

```bash
curl "http://localhost:3000/api/logins?userEmail=andressaferrarig@gmail.com&organizationId=<org-id>"
```

#### Buscar organizações do usuário:

```bash
curl "http://localhost:3000/api/user/organizations?userEmail=andressaferrarig@gmail.com"
```

### 3. Editar Dados

Ao editar um login, o sistema verifica automaticamente:
- Se o usuário tem acesso à organização do login
- Se o usuário tem role suficiente (vendor ou admin) para editar

```bash
curl -X PATCH "http://localhost:3000/api/logins/<slug>" \
  -H "X-User-Email: andressaferrarig@gmail.com" \
  -H "Content-Type: application/json" \
  -d '{"onTurf": 100, "offTurf": 50}'
```

## Regras de Negócio

### Visualização

1. **Usuário sem autenticação**: Vê todos os logins (comportamento antigo para compatibilidade)
2. **Usuário autenticado**: Vê apenas logins das organizações onde tem acesso
3. **Admin**: Pode ver todas as organizações onde tem acesso (pode ser ajustado)

### Edição

1. **Vendor/Admin**: Pode editar logins das organizações onde tem acesso
2. **Viewer**: Não pode editar (apenas visualizar)
3. Sistema verifica permissões antes de permitir edição

### Criação de Commissions

- **Admin**: Pode criar/editar commissions para qualquer vendor na organização
- **Vendor**: Pode editar apenas suas próprias commissions (se implementado)
- **Viewer**: Não pode criar/editar

## Personalização

### Restringir Visualização de Admins

Se você quiser que admins vejam apenas a própria organização, modifique `src/permissions.js`:

```javascript
async function canViewOrganization(userEmail, targetOrganizationId) {
  // Apenas acesso direto
  const directAccess = await getUserOrganizationAccess(userEmail, targetOrganizationId);
  return !!directAccess;
}
```

### Adicionar Mais Roles

1. Adicione o role na constraint CHECK da tabela `user_organizations`
2. Atualize `roleHierarchy` em `src/permissions.js`
3. Ajuste as funções de verificação conforme necessário

## Exemplos de Uso

### Frontend

```javascript
// Buscar logins do usuário atual
const userEmail = 'andressaferrarig@gmail.com';
const response = await fetch(`/api/logins?userEmail=${userEmail}`);
const logins = await response.json();

// Filtrar por organização
const orgId = 'b2s-org-id';
const orgLogins = await fetch(`/api/logins?userEmail=${userEmail}&organizationId=${orgId}`);

// Buscar organizações do usuário
const orgs = await fetch(`/api/user/organizations?userEmail=${userEmail}`);
```

### Verificar Permissões

```javascript
const { isAdmin, hasRole } = require('./src/permissions');

// Verificar se é admin
const isUserAdmin = await isAdmin('andressaferrarig@gmail.com', 'b2s-org-id');

// Verificar role específica
const canEdit = await hasRole('andressaferrarig@gmail.com', 'b2s-org-id', 'vendor');
```


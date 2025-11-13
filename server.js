const path = require('path');
const express = require('express');
const cors = require('cors');
const compression = require('compression');
require('dotenv').config();

const pool = require('./src/db');

const app = express();
const PORT = process.env.PORT || 3000;
const MAIN_DASHBOARD_SLUG = '90kKDLKJAlkafslhadsf';

const cache = {
  allLogins: null,
  loginsBySlug: new Map(),
  cacheTime: 0,
  TTL: 5000,
};

app.use(compression());
app.use(cors());
app.use(express.json());
app.use(
  express.static(path.join(__dirname, 'public'), {
    index: false,
    maxAge: '1d',
    etag: true,
    lastModified: true,
  })
);

app.get('/api/logins', async (req, res) => {
  const userEmail = req.headers['x-user-email'] || req.query.userEmail;
  const organizationId = req.query.organizationId;
  
  try {
    let rows;
    
    // Se tiver userEmail, filtra por permissões
    if (userEmail) {
      const { getAccessibleLogins } = require('./src/permissions');
      rows = await getAccessibleLogins(userEmail, organizationId);
    } else {
      // Sem autenticação, retorna todos (comportamento antigo para compatibilidade)
      const now = Date.now();
      if (cache.allLogins && now - cache.cacheTime < cache.TTL) {
        res.set('X-Cache', 'HIT');
        return res.json(cache.allLogins);
      }
      
      const { rows: allRows } = await pool.query(
        'SELECT id, login, slug, on_turf AS "onTurf", off_turf AS "offTurf", updated_at AS "updatedAt", organization_id AS "organizationId" FROM logins ORDER BY login'
      );
      rows = allRows;
      cache.allLogins = rows;
      cache.cacheTime = now;
      res.set('X-Cache', 'MISS');
    }
    
    res.json(rows);
  } catch (error) {
    console.error('Error fetching logins', error);
    res.status(500).json({ message: 'Erro ao buscar dados.' });
  }
});

app.get('/api/logins/:slug', async (req, res) => {
  const { slug } = req.params;
  const now = Date.now();
  const cached = cache.loginsBySlug.get(slug);
  
  if (cached && now - cached.time < cache.TTL) {
    res.set('X-Cache', 'HIT');
    return res.json(cached.data);
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, login, slug, on_turf AS "onTurf", off_turf AS "offTurf", updated_at AS "updatedAt" FROM logins WHERE slug = $1',
      [slug]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Login não encontrado.' });
    }

    cache.loginsBySlug.set(slug, { data: rows[0], time: now });
    res.set('X-Cache', 'MISS');
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching login', error);
    res.status(500).json({ message: 'Erro ao buscar dados.' });
  }
});

app.patch('/api/logins/:slug', async (req, res) => {
  const { slug } = req.params;
  const { onTurf, offTurf } = req.body;
  const userEmail = req.headers['x-user-email'] || req.body.userEmail;

  if (
    typeof onTurf !== 'number' ||
    typeof offTurf !== 'number' ||
    Number.isNaN(onTurf) ||
    Number.isNaN(offTurf)
  ) {
    return res.status(400).json({ message: 'Valores inválidos.' });
  }

  try {
    // Busca o login primeiro para verificar permissões
    const { rows: loginRows } = await pool.query(
      'SELECT id, login, organization_id FROM logins WHERE slug = $1',
      [slug]
    );

    if (loginRows.length === 0) {
      return res.status(404).json({ message: 'Login não encontrado.' });
    }

    const login = loginRows[0];

    // Se tiver userEmail, verifica permissões
    if (userEmail && login.organization_id) {
      const { canViewOrganization, hasRole } = require('./src/permissions');
      const canView = await canViewOrganization(userEmail, login.organization_id);
      const canEdit = await hasRole(userEmail, login.organization_id, 'vendor');
      
      if (!canView || !canEdit) {
        return res.status(403).json({ message: 'Sem permissão para editar este login.' });
      }
    }

    const { rowCount, rows } = await pool.query(
      `UPDATE logins 
       SET on_turf = $1, off_turf = $2, updated_at = NOW() 
       WHERE slug = $3 
       RETURNING id, login, slug, on_turf AS "onTurf", off_turf AS "offTurf", updated_at AS "updatedAt", organization_id AS "organizationId"`,
      [onTurf, offTurf, slug]
    );

    if (rowCount === 0) {
      return res.status(404).json({ message: 'Login não encontrado.' });
    }

    cache.allLogins = null;
    cache.loginsBySlug.delete(slug);
    cache.cacheTime = 0;

    res.json(rows[0]);
  } catch (error) {
    console.error('Error updating login', error);
    res.status(500).json({ message: 'Erro ao atualizar dados.' });
  }
});

app.get('/', (req, res) => {
  res.redirect(`/${MAIN_DASHBOARD_SLUG}`);
});

app.get(`/${MAIN_DASHBOARD_SLUG}`, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', (req, res) => {
  res.redirect(`/${MAIN_DASHBOARD_SLUG}`);
});

app.get('/login/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Endpoints de permissões e organizações
app.get('/api/user/organizations', async (req, res) => {
  const userEmail = req.headers['x-user-email'] || req.query.userEmail;
  
  if (!userEmail) {
    return res.status(400).json({ message: 'userEmail é obrigatório.' });
  }
  
  try {
    const { getUserOrganizations } = require('./src/permissions');
    const orgs = await getUserOrganizations(userEmail);
    res.json(orgs);
  } catch (error) {
    console.error('Error fetching user organizations', error);
    res.status(500).json({ message: 'Erro ao buscar organizações.' });
  }
});

app.get('/api/organizations', async (req, res) => {
  const userEmail = req.headers['x-user-email'] || req.query.userEmail;
  
  try {
    let query = 'SELECT id, name, company_name, created_at, updated_at FROM organizations ORDER BY name';
    let params = [];
    
    // Se tiver userEmail, filtra apenas organizações que o usuário tem acesso
    if (userEmail) {
      const { getUserOrganizationIds } = require('./src/permissions');
      const orgIds = await getUserOrganizationIds(userEmail);
      
      if (orgIds.length === 0) {
        return res.json([]);
      }
      
      query = `
        SELECT id, name, company_name, created_at, updated_at 
        FROM organizations 
        WHERE id = ANY($1)
        ORDER BY name
      `;
      params = [orgIds];
    }
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching organizations', error);
    res.status(500).json({ message: 'Erro ao buscar organizações.' });
  }
});

app.get('/api/plans/analyze', async (req, res) => {
  try {
    // Analisa plans do banco atual
    const { rows: plansInDB } = await pool.query(`
      SELECT 
        id,
        COALESCE(login, username, name) as login,
        company,
        COALESCE(on_turf, 0) as on_turf,
        COALESCE(off_turf, 0) as off_turf,
        created_at,
        updated_at
      FROM plans
      WHERE company ILIKE '%B2S%ENTERPRISES%' 
         OR company ILIKE '%B2S ENTERPRISES%'
         OR company = 'B2S ENTERPRISES LLC'
      ORDER BY login
      LIMIT 1000
    `);
    
    const companies = await pool.query(`
      SELECT DISTINCT company, COUNT(*) as count
      FROM plans
      WHERE company IS NOT NULL
      GROUP BY company
      ORDER BY count DESC
      LIMIT 20
    `);
    
    res.json({
      total: plansInDB.length,
      plans: plansInDB,
      companies: companies.rows,
      message: plansInDB.length > 0 
        ? `Encontrados ${plansInDB.length} plans de B2S ENTERPRISES LLC`
        : 'Nenhum plan encontrado para B2S ENTERPRISES LLC na tabela plans',
    });
  } catch (error) {
    console.error('Error analyzing plans', error);
    res.status(500).json({ message: 'Erro ao analisar plans.', error: error.message });
  }
});

app.post('/api/import/plans', async (req, res) => {
  try {
    const { plans, source, connectionString, apiUrl, companyFilter, syncFromDB, supabaseUrl, organizationId } = req.body;
    
    const { importPlans, fetchPlansFromAPI, fetchPlansFromDB } = require('./src/importPlans');
    const { fetchPlansFromSupabase, findB2SOrganizationId } = require('./src/fetchSupabasePlans');
    
    let plansToImport = plans;
    
    // Se syncFromDB = true, busca do banco atual
    if (syncFromDB && !plansToImport) {
      const { rows } = await pool.query(`
        SELECT 
          COALESCE(login, username, name) as login,
          company,
          COALESCE(on_turf, 0) as on_turf,
          COALESCE(off_turf, 0) as off_turf
        FROM plans
        WHERE company ILIKE '%B2S%ENTERPRISES%' 
           OR company ILIKE '%B2S ENTERPRISES%'
           OR company = 'B2S ENTERPRISES LLC'
           ${companyFilter ? `OR company = $1` : ''}
        ORDER BY login
      `, companyFilter ? [companyFilter] : []);
      
      plansToImport = rows.map(p => ({
        login: p.login,
        onTurf: parseInt(p.on_turf) || 0,
        offTurf: parseInt(p.off_turf) || 0,
        company: p.company,
      }));
    }
    // Se não forneceu plans diretamente, busca da fonte
    else if (!plansToImport) {
      if (source === 'supabase' && supabaseUrl) {
        // Busca plans do Supabase
        let orgId = organizationId;
        if (!orgId) {
          orgId = await findB2SOrganizationId(supabaseUrl);
        }
        plansToImport = await fetchPlansFromSupabase(supabaseUrl, orgId);
      } else if (source === 'api' && apiUrl) {
        plansToImport = await fetchPlansFromAPI(apiUrl);
      } else if (source === 'db' && connectionString) {
        plansToImport = await fetchPlansFromDB(connectionString, companyFilter);
      } else {
        return res.status(400).json({ 
          message: 'Forneça plans diretamente, use syncFromDB=true, ou especifique source (supabase/api/db) com connectionString/apiUrl/supabaseUrl' 
        });
      }
    }
    
    if (!Array.isArray(plansToImport) || plansToImport.length === 0) {
      return res.status(400).json({ message: 'Nenhum plan fornecido ou formato inválido.' });
    }
    
    const results = await importPlans(plansToImport);
    
    // Limpa cache
    cache.allLogins = null;
    cache.loginsBySlug.clear();
    cache.cacheTime = 0;
    
    res.json({
      message: `Importação concluída: ${results.filter(r => r.status === 'created').length} criados, ${results.filter(r => r.status === 'exists').length} já existiam`,
      results,
      total: plansToImport.length,
      created: results.filter(r => r.status === 'created').length,
      exists: results.filter(r => r.status === 'exists').length,
    });
  } catch (error) {
    console.error('Error importing plans', error);
    res.status(500).json({ message: 'Erro ao importar plans.', error: error.message });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});


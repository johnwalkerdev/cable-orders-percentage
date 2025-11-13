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
  const now = Date.now();
  if (cache.allLogins && now - cache.cacheTime < cache.TTL) {
    res.set('X-Cache', 'HIT');
    return res.json(cache.allLogins);
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, login, slug, on_turf AS "onTurf", off_turf AS "offTurf", updated_at AS "updatedAt" FROM logins ORDER BY login'
    );
    cache.allLogins = rows;
    cache.cacheTime = now;
    res.set('X-Cache', 'MISS');
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

  if (
    typeof onTurf !== 'number' ||
    typeof offTurf !== 'number' ||
    Number.isNaN(onTurf) ||
    Number.isNaN(offTurf)
  ) {
    return res.status(400).json({ message: 'Valores inválidos.' });
  }

  try {
    const { rowCount, rows } = await pool.query(
      `UPDATE logins 
       SET on_turf = $1, off_turf = $2, updated_at = NOW() 
       WHERE slug = $3 
       RETURNING id, login, slug, on_turf AS "onTurf", off_turf AS "offTurf", updated_at AS "updatedAt"`,
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
    const { plans, source, connectionString, apiUrl, companyFilter, syncFromDB } = req.body;
    
    const { importPlans, fetchPlansFromAPI, fetchPlansFromDB } = require('./src/importPlans');
    
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
      if (source === 'api' && apiUrl) {
        plansToImport = await fetchPlansFromAPI(apiUrl);
      } else if (source === 'db' && connectionString) {
        plansToImport = await fetchPlansFromDB(connectionString, companyFilter);
      } else {
        return res.status(400).json({ 
          message: 'Forneça plans diretamente, use syncFromDB=true, ou especifique source (api/db) com connectionString/apiUrl' 
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


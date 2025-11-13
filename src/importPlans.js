const pool = require('./db');
const crypto = require('crypto');

/**
 * Gera um slug único baseado no login
 */
function generateSlug(login) {
  const normalized = login.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const hash = crypto.randomBytes(4).toString('hex');
  return `${normalized}-${hash}`;
}

/**
 * Importa plans de uma fonte externa e cria logins
 * @param {Array} plans - Array de plans com estrutura: { login: string, ... }
 */
async function importPlans(plans) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const results = [];
    
    for (const plan of plans) {
      const login = plan.login || plan.name || plan.username;
      if (!login) {
        console.warn('Plan sem login válido:', plan);
        continue;
      }
      
      // Verifica se já existe
      const existing = await client.query(
        'SELECT id, slug FROM logins WHERE login = $1',
        [login]
      );
      
      if (existing.rows.length > 0) {
        console.log(`Login já existe: ${login}`);
        results.push({ login, status: 'exists', id: existing.rows[0].id });
        continue;
      }
      
      // Cria novo login
      const slug = generateSlug(login);
      const insertResult = await client.query(
        `INSERT INTO logins (login, slug, on_turf, off_turf) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id, login, slug`,
        [login, slug, plan.onTurf || 0, plan.offTurf || 0]
      );
      
      results.push({ 
        login, 
        status: 'created', 
        id: insertResult.rows[0].id,
        slug: insertResult.rows[0].slug 
      });
      console.log(`Login criado: ${login} (${slug})`);
    }
    
    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Busca plans de uma API externa
 * @param {string} apiUrl - URL da API que retorna os plans
 */
async function fetchPlansFromAPI(apiUrl) {
  const fetch = require('node-fetch');
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.plans || data.data || data;
  } catch (error) {
    console.error('Erro ao buscar plans da API:', error);
    throw error;
  }
}

/**
 * Busca plans de outro banco PostgreSQL
 * @param {string} connectionString - Connection string do banco externo
 * @param {string} companyFilter - Filtro para empresa (ex: "B2S ENTERPRISES LLC")
 */
async function fetchPlansFromDB(connectionString, companyFilter = null) {
  const { Pool } = require('pg');
  const externalPool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  
  try {
    let query = `
      SELECT DISTINCT 
        p.login,
        p.username,
        p.name,
        p.company,
        COALESCE(p.on_turf, 0) as on_turf,
        COALESCE(p.off_turf, 0) as off_turf
      FROM plans p
      WHERE 1=1
    `;
    
    const params = [];
    if (companyFilter) {
      params.push(companyFilter);
      query += ` AND p.company = $${params.length}`;
    }
    
    query += ` ORDER BY p.login`;
    
    const { rows } = await externalPool.query(query, params);
    await externalPool.end();
    
    return rows.map(row => ({
      login: row.login || row.username || row.name,
      onTurf: parseInt(row.on_turf) || 0,
      offTurf: parseInt(row.off_turf) || 0,
      company: row.company,
    }));
  } catch (error) {
    await externalPool.end();
    throw error;
  }
}

module.exports = {
  importPlans,
  fetchPlansFromAPI,
  fetchPlansFromDB,
  generateSlug,
};


const { Pool } = require('pg');

/**
 * Busca plans do Supabase filtrando por B2S ENTERPRISES LLC
 * @param {string} supabaseConnectionString - Connection string do Supabase
 * @param {string} organizationId - ID da organização B2S ENTERPRISES LLC (opcional)
 */
async function fetchPlansFromSupabase(supabaseConnectionString, organizationId = null) {
  const pool = new Pool({
    connectionString: supabaseConnectionString,
    ssl: { rejectUnauthorized: false },
  });
  
  try {
    let query;
    let params = [];
    
    // Se tiver organization_id, busca por ele
    if (organizationId) {
      query = `
        SELECT 
          p.*,
          o.name as organization_name,
          o.company_name
        FROM plans p
        LEFT JOIN organizations o ON o.id = p.organization_id
        WHERE p.organization_id = $1
        ORDER BY p.updated_at DESC
      `;
      params = [organizationId];
    } else {
      // Busca por nome da organização
      query = `
        SELECT 
          p.*,
          o.name as organization_name,
          o.company_name
        FROM plans p
        LEFT JOIN organizations o ON o.id = p.organization_id
        WHERE o.name ILIKE '%B2S%ENTERPRISES%'
           OR o.company_name ILIKE '%B2S%ENTERPRISES%'
           OR o.name ILIKE '%B2S ENTERPRISES LLC%'
        ORDER BY p.updated_at DESC
      `;
    }
    
    const { rows } = await pool.query(query, params);
    
    // Mapeia para o formato esperado
    return rows.map(plan => {
      // Tenta encontrar um identificador de login
      // Se não houver coluna de login, usa o ID do plan ou busca em outras tabelas relacionadas
      let login = plan.login || plan.username || plan.name;
      
      if (!login) {
        // Se não tiver login direto, tenta buscar em outras tabelas ou usa o ID
        // Por enquanto, usa o ID do plan como fallback
        login = `plan-${plan.id}`;
      }
      
      return {
        login: login,
        onTurf: parseInt(plan.on_turf) || 0,
        offTurf: parseInt(plan.off_turf) || 0,
        company: plan.organization_name || plan.company_name || plan.company || 'B2S ENTERPRISES LLC',
        planId: plan.id,
        organizationId: plan.organization_id,
        metadata: {
          originalId: plan.id,
          updatedAt: plan.updated_at,
          createdAt: plan.created_at,
        },
      };
    });
  } finally {
    await pool.end();
  }
}

/**
 * Busca o organization_id de B2S ENTERPRISES LLC
 */
async function findB2SOrganizationId(supabaseConnectionString) {
  const pool = new Pool({
    connectionString: supabaseConnectionString,
    ssl: { rejectUnauthorized: false },
  });
  
  try {
    const { rows } = await pool.query(`
      SELECT id, name, company_name
      FROM organizations
      WHERE name ILIKE '%B2S%ENTERPRISES%'
         OR company_name ILIKE '%B2S%ENTERPRISES%'
         OR name ILIKE '%B2S ENTERPRISES LLC%'
      LIMIT 1
    `);
    
    if (rows.length > 0) {
      return rows[0].id;
    }
    
    return null;
  } finally {
    await pool.end();
  }
}

module.exports = {
  fetchPlansFromSupabase,
  findB2SOrganizationId,
};


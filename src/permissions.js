const pool = require('./db');

/**
 * Busca todas as organizações e roles de um usuário
 * @param {string} userEmail - Email do usuário
 * @returns {Promise<Array>} Array de { organizationId, role, organizationName }
 */
async function getUserOrganizations(userEmail) {
  const { rows } = await pool.query(`
    SELECT 
      uo.organization_id,
      uo.role,
      o.name as organization_name,
      o.company_name
    FROM user_organizations uo
    JOIN organizations o ON o.id = uo.organization_id
    WHERE uo.user_email = $1
    ORDER BY o.name
  `, [userEmail]);
  
  return rows;
}

/**
 * Verifica se o usuário tem acesso a uma organização específica
 * @param {string} userEmail - Email do usuário
 * @param {string} organizationId - ID da organização
 * @returns {Promise<Object|null>} { role, organizationName } ou null se não tiver acesso
 */
async function getUserOrganizationAccess(userEmail, organizationId) {
  const { rows } = await pool.query(`
    SELECT 
      uo.role,
      o.name as organization_name,
      o.company_name
    FROM user_organizations uo
    JOIN organizations o ON o.id = uo.organization_id
    WHERE uo.user_email = $1 AND uo.organization_id = $2
  `, [userEmail, organizationId]);
  
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Verifica se o usuário tem uma role específica em uma organização
 * @param {string} userEmail - Email do usuário
 * @param {string} organizationId - ID da organização
 * @param {string} requiredRole - Role requerida ('admin', 'vendor', 'viewer')
 * @returns {Promise<boolean>}
 */
async function hasRole(userEmail, organizationId, requiredRole) {
  const access = await getUserOrganizationAccess(userEmail, organizationId);
  if (!access) return false;
  
  const roleHierarchy = { admin: 3, vendor: 2, viewer: 1 };
  const userRoleLevel = roleHierarchy[access.role] || 0;
  const requiredRoleLevel = roleHierarchy[requiredRole] || 0;
  
  return userRoleLevel >= requiredRoleLevel;
}

/**
 * Verifica se o usuário é admin em uma organização
 * @param {string} userEmail - Email do usuário
 * @param {string} organizationId - ID da organização
 * @returns {Promise<boolean>}
 */
async function isAdmin(userEmail, organizationId) {
  return hasRole(userEmail, organizationId, 'admin');
}

/**
 * Busca IDs das organizações que o usuário tem acesso
 * @param {string} userEmail - Email do usuário
 * @param {string} minRole - Role mínima requerida (opcional)
 * @returns {Promise<Array<string>>} Array de organization IDs
 */
async function getUserOrganizationIds(userEmail, minRole = null) {
  let query = `
    SELECT organization_id
    FROM user_organizations
    WHERE user_email = $1
  `;
  
  const params = [userEmail];
  
  if (minRole) {
    const roleHierarchy = { admin: 3, vendor: 2, viewer: 1 };
    const minLevel = roleHierarchy[minRole] || 0;
    query += ` AND role IN (${Object.keys(roleHierarchy).filter(r => roleHierarchy[r] >= minLevel).map((_, i) => `$${i + 2}`).join(', ')})`;
    Object.keys(roleHierarchy).filter(r => roleHierarchy[r] >= minLevel).forEach((r, i) => {
      params.push(r);
    });
  }
  
  const { rows } = await pool.query(query, params);
  return rows.map(r => r.organization_id);
}

/**
 * Verifica se o usuário pode visualizar dados de outra organização
 * Regra: Admin em uma organização pode ver dados de outras organizações onde tem acesso
 * @param {string} userEmail - Email do usuário
 * @param {string} targetOrganizationId - ID da organização alvo
 * @returns {Promise<boolean>}
 */
async function canViewOrganization(userEmail, targetOrganizationId) {
  // Se o usuário tem acesso direto à organização, pode ver
  const directAccess = await getUserOrganizationAccess(userEmail, targetOrganizationId);
  if (directAccess) return true;
  
  // Se o usuário é admin em qualquer organização, pode ver outras organizações onde tem acesso
  const userOrgs = await getUserOrganizations(userEmail);
  const isAdminAnywhere = userOrgs.some(org => org.role === 'admin');
  
  if (isAdminAnywhere) {
    // Admin pode ver todas as organizações (ou apenas as que tem acesso, dependendo da regra de negócio)
    // Por enquanto, vamos permitir que admin veja todas
    return true;
  }
  
  return false;
}

/**
 * Filtra logins baseado nas permissões do usuário
 * @param {string} userEmail - Email do usuário
 * @param {string} organizationId - ID da organização (opcional, se não fornecido retorna todas que tem acesso)
 * @returns {Promise<Array>} Array de logins filtrados
 */
async function getAccessibleLogins(userEmail, organizationId = null) {
  const userOrgIds = await getUserOrganizationIds(userEmail);
  
  if (userOrgIds.length === 0) {
    return [];
  }
  
  let query = `
    SELECT 
      l.id,
      l.login,
      l.slug,
      l.on_turf AS "onTurf",
      l.off_turf AS "offTurf",
      l.updated_at AS "updatedAt",
      l.organization_id,
      o.name as organization_name
    FROM logins l
    LEFT JOIN organizations o ON o.id = l.organization_id
    WHERE l.organization_id = ANY($1)
  `;
  
  const params = [userOrgIds];
  
  if (organizationId) {
    // Verifica se tem acesso a essa organização específica
    const hasAccess = await canViewOrganization(userEmail, organizationId);
    if (!hasAccess) {
      return [];
    }
    query += ` AND l.organization_id = $2`;
    params.push(organizationId);
  }
  
  query += ` ORDER BY l.login`;
  
  const { rows } = await pool.query(query, params);
  return rows;
}

module.exports = {
  getUserOrganizations,
  getUserOrganizationAccess,
  hasRole,
  isAdmin,
  getUserOrganizationIds,
  canViewOrganization,
  getAccessibleLogins,
};


#!/usr/bin/env node

require('dotenv').config();
const { Pool } = require('pg');

async function analyzeSupabasePlans() {
  // Usa a connection string do Supabase se disponível, senão usa a do Neon
  const supabaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
  
  if (!supabaseUrl) {
    console.error('❌ SUPABASE_DATABASE_URL ou DATABASE_URL não encontrado no .env');
    process.exit(1);
  }
  
  const pool = new Pool({
    connectionString: supabaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  
  try {
    console.log('🔍 Analisando estrutura da tabela plans no Supabase...\n');
    
    // 1. Verifica estrutura da tabela
    const { rows: columns } = await pool.query(`
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'plans'
      ORDER BY ordinal_position
    `);
    
    console.log('📋 Estrutura da tabela plans:');
    columns.forEach(col => {
      console.log(`   - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'YES' ? '[nullable]' : '[required]'}`);
    });
    console.log('');
    
    // 2. Conta total de plans
    const { rows: countRows } = await pool.query('SELECT COUNT(*) as total FROM plans');
    console.log(`📊 Total de plans: ${countRows[0].total}\n`);
    
    // 3. Verifica se há coluna de organização/company
    const hasOrgId = columns.some(c => c.column_name === 'organization_id');
    const hasCompany = columns.some(c => c.column_name === 'company' || c.column_name === 'organization_name');
    
    // 4. Busca organizations relacionadas
    if (hasOrgId) {
      const { rows: orgs } = await pool.query(`
        SELECT DISTINCT 
          p.organization_id,
          COUNT(*) as plan_count
        FROM plans p
        WHERE p.organization_id IS NOT NULL
        GROUP BY p.organization_id
        ORDER BY plan_count DESC
        LIMIT 10
      `);
      
      console.log('🏢 Organizações encontradas:');
      orgs.forEach(org => {
        console.log(`   - ${org.organization_id}: ${org.plan_count} plans`);
      });
      console.log('');
      
      // Tenta buscar nome da organização se houver tabela organizations
      try {
        const { rows: orgNames } = await pool.query(`
          SELECT 
            o.id,
            o.name,
            o.company_name,
            COUNT(p.id) as plan_count
          FROM organizations o
          JOIN plans p ON p.organization_id = o.id
          WHERE o.name ILIKE '%B2S%' 
             OR o.company_name ILIKE '%B2S%'
             OR o.name ILIKE '%ENTERPRISES%'
          GROUP BY o.id, o.name, o.company_name
          ORDER BY plan_count DESC
        `);
        
        if (orgNames.length > 0) {
          console.log('🎯 Organizações B2S ENTERPRISES encontradas:');
          orgNames.forEach(org => {
            console.log(`   - ${org.name || org.company_name} (${org.id}): ${org.plan_count} plans`);
          });
          console.log('');
        }
      } catch (err) {
        // Tabela organizations pode não existir
        console.log('ℹ️  Tabela organizations não encontrada ou sem acesso\n');
      }
    }
    
    // 5. Busca plans de B2S ENTERPRISES LLC
    console.log('🔎 Buscando plans de B2S ENTERPRISES LLC...\n');
    
    let b2sPlans = [];
    
    if (hasOrgId) {
      // Busca pelo organization_id se tiver tabela organizations
      try {
        const { rows } = await pool.query(`
          SELECT 
            p.*,
            o.name as org_name,
            o.company_name
          FROM plans p
          LEFT JOIN organizations o ON o.id = p.organization_id
          WHERE o.name ILIKE '%B2S%ENTERPRISES%'
             OR o.company_name ILIKE '%B2S%ENTERPRISES%'
             OR o.name ILIKE '%B2S ENTERPRISES LLC%'
          ORDER BY p.updated_at DESC
          LIMIT 100
        `);
        b2sPlans = rows;
      } catch (err) {
        console.log('⚠️  Não foi possível buscar por organization (tabela organizations pode não existir)');
      }
    }
    
    if (b2sPlans.length === 0 && hasCompany) {
      // Tenta buscar pela coluna company
      const { rows } = await pool.query(`
        SELECT * FROM plans
        WHERE company ILIKE '%B2S%ENTERPRISES%'
           OR company ILIKE '%B2S ENTERPRISES LLC%'
        ORDER BY updated_at DESC
        LIMIT 100
      `);
      b2sPlans = rows;
    }
    
    if (b2sPlans.length === 0) {
      console.log('⚠️  Nenhum plan encontrado com filtro B2S ENTERPRISES LLC');
      console.log('\n💡 Mostrando primeiros 5 plans como exemplo:');
      const { rows: sample } = await pool.query('SELECT * FROM plans LIMIT 5');
      sample.forEach((plan, i) => {
        console.log(`\n   Plan ${i + 1}:`);
        Object.keys(plan).forEach(key => {
          const value = plan[key];
          if (value !== null && value !== undefined) {
            console.log(`     ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
          }
        });
      });
    } else {
      console.log(`✅ Encontrados ${b2sPlans.length} plans de B2S ENTERPRISES LLC\n`);
      console.log('📝 Exemplo de plan:');
      const example = b2sPlans[0];
      Object.keys(example).forEach(key => {
        const value = example[key];
        if (value !== null && value !== undefined) {
          console.log(`   ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
        }
      });
    }
    
    // 6. Verifica quais colunas podem ser usadas como login
    const loginColumns = columns.filter(c => 
      c.column_name.toLowerCase().includes('login') ||
      c.column_name.toLowerCase().includes('username') ||
      c.column_name.toLowerCase().includes('name') ||
      c.column_name.toLowerCase().includes('user')
    );
    
    if (loginColumns.length > 0) {
      console.log('\n🔑 Colunas que podem ser usadas como login:');
      loginColumns.forEach(col => {
        console.log(`   - ${col.column_name}`);
      });
    } else {
      console.log('\n⚠️  Nenhuma coluna óbvia encontrada para usar como login');
      console.log('   Será necessário mapear manualmente ou usar o ID');
    }
    
  } catch (error) {
    console.error('❌ Erro ao analisar plans:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

analyzeSupabasePlans();


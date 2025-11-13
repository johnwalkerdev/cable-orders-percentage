#!/usr/bin/env node

require('dotenv').config();
const pool = require('../src/db');
const { importPlans, fetchPlansFromDB } = require('../src/importPlans');

async function syncPlansFromB2S() {
  console.log('🔍 Analisando plans de B2S ENTERPRISES LLC...\n');
  
  try {
    // Verifica se há plans na tabela plans do mesmo banco
    const { rows: plansInDB } = await pool.query(`
      SELECT 
        COALESCE(login, username, name) as login,
        company,
        COALESCE(on_turf, 0) as on_turf,
        COALESCE(off_turf, 0) as off_turf
      FROM plans
      WHERE company ILIKE '%B2S%ENTERPRISES%' 
         OR company ILIKE '%B2S ENTERPRISES%'
         OR company = 'B2S ENTERPRISES LLC'
      ORDER BY login
    `);
    
    if (plansInDB.length === 0) {
      console.log('⚠️  Nenhum plan encontrado na tabela plans para B2S ENTERPRISES LLC');
      console.log('\n💡 Verificando se há plans em outras tabelas...\n');
      
      // Tenta buscar em outras tabelas possíveis
      const { rows: allTables } = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_name NOT IN ('logins', 'plans')
        ORDER BY table_name
      `);
      
      if (allTables.length > 0) {
        console.log('📋 Tabelas encontradas no banco:');
        allTables.forEach(t => console.log(`   - ${t.table_name}`));
        console.log('\n💡 Se os plans estão em outra tabela, especifique o nome da tabela.');
      }
      
      return;
    }
    
    console.log(`✅ Encontrados ${plansInDB.length} plans de B2S ENTERPRISES LLC\n`);
    
    // Formata os plans para importação
    const plansToImport = plansInDB.map(p => ({
      login: p.login,
      onTurf: parseInt(p.on_turf) || 0,
      offTurf: parseInt(p.off_turf) || 0,
      company: p.company,
    }));
    
    console.log('📊 Plans encontrados:');
    plansToImport.slice(0, 10).forEach(p => {
      console.log(`   - ${p.login} (ON: ${p.onTurf}, OFF: ${p.offTurf})`);
    });
    if (plansToImport.length > 10) {
      console.log(`   ... e mais ${plansToImport.length - 10} plans`);
    }
    
    console.log('\n🚀 Iniciando importação para tabela logins...\n');
    
    const results = await importPlans(plansToImport);
    
    const created = results.filter(r => r.status === 'created');
    const exists = results.filter(r => r.status === 'exists');
    
    console.log(`\n✅ Importação concluída!`);
    console.log(`   ✅ Criados: ${created.length}`);
    console.log(`   ℹ️  Já existiam: ${exists.length}`);
    
    if (created.length > 0) {
      console.log('\n📝 Logins criados:');
      created.slice(0, 20).forEach(r => {
        console.log(`   - ${r.login} → /login/${r.slug}`);
      });
      if (created.length > 20) {
        console.log(`   ... e mais ${created.length - 20} logins`);
      }
    }
    
  } catch (error) {
    console.error('❌ Erro ao sincronizar plans:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

syncPlansFromB2S();


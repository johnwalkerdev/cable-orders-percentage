#!/usr/bin/env node

require('dotenv').config();
const pool = require('../src/db');

async function setupExamplePermissions() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🔧 Configurando permissões de exemplo...\n');
    
    // 1. Cria organizações
    console.log('📋 Criando organizações...');
    
    const { rows: b2sOrg } = await client.query(`
      INSERT INTO organizations (name, company_name)
      VALUES ('B2S ENTERPRISES LLC', 'B2S ENTERPRISES LLC')
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `);
    
    let b2sId;
    if (b2sOrg.length > 0) {
      b2sId = b2sOrg[0].id;
      console.log(`   ✅ ${b2sOrg[0].name} (${b2sId})`);
    } else {
      const { rows: existing } = await client.query(
        "SELECT id FROM organizations WHERE name = 'B2S ENTERPRISES LLC'"
      );
      b2sId = existing[0].id;
      console.log(`   ℹ️  ${b2sId} já existe`);
    }
    
    const { rows: org2 } = await client.query(`
      INSERT INTO organizations (name, company_name)
      VALUES ('Organization 2 de teste', 'Organization 2 de teste')
      ON CONFLICT DO NOTHING
      RETURNING id, name
    `);
    
    let org2Id;
    if (org2.length > 0) {
      org2Id = org2[0].id;
      console.log(`   ✅ ${org2[0].name} (${org2Id})`);
    } else {
      const { rows: existing } = await client.query(
        "SELECT id FROM organizations WHERE name = 'Organization 2 de teste'"
      );
      org2Id = existing[0].id;
      console.log(`   ℹ️  ${org2Id} já existe`);
    }
    
    // 2. Cria permissões para Andressa
    console.log('\n👤 Configurando permissões para andressaferrarig@gmail.com...');
    
    // Admin em B2S ENTERPRISES LLC
    await client.query(`
      INSERT INTO user_organizations (user_email, organization_id, role)
      VALUES ($1, $2, 'admin')
      ON CONFLICT (user_email, organization_id) 
      DO UPDATE SET role = 'admin', updated_at = NOW()
    `, ['andressaferrarig@gmail.com', b2sId]);
    console.log(`   ✅ Admin em B2S ENTERPRISES LLC`);
    
    // Vendor em Organization 2 de teste
    await client.query(`
      INSERT INTO user_organizations (user_email, organization_id, role)
      VALUES ($1, $2, 'vendor')
      ON CONFLICT (user_email, organization_id) 
      DO UPDATE SET role = 'vendor', updated_at = NOW()
    `, ['andressaferrarig@gmail.com', org2Id]);
    console.log(`   ✅ Vendor em Organization 2 de teste`);
    
    // 3. Atualiza logins existentes para associar à organização B2S
    console.log('\n🔗 Associando logins existentes à B2S ENTERPRISES LLC...');
    const { rowCount } = await client.query(`
      UPDATE logins
      SET organization_id = $1
      WHERE organization_id IS NULL
    `, [b2sId]);
    console.log(`   ✅ ${rowCount} logins associados`);
    
    await client.query('COMMIT');
    
    console.log('\n✅ Configuração concluída!');
    console.log('\n📊 Resumo:');
    console.log(`   - andressaferrarig@gmail.com é ADMIN em B2S ENTERPRISES LLC`);
    console.log(`   - andressaferrarig@gmail.com é VENDOR em Organization 2 de teste`);
    console.log(`   - Ela pode visualizar e editar dados de ambas as organizações`);
    console.log(`   - Como admin em B2S, ela pode ver commissions de outras organizações`);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

setupExamplePermissions()
  .then(() => {
    console.log('\n✅ Processo concluído com sucesso!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Erro ao configurar permissões:', error);
    console.error(error.stack);
    process.exit(1);
  });


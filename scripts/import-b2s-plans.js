#!/usr/bin/env node

require('dotenv').config();

async function importB2SPlans() {
  const baseUrl = process.env.API_URL || 'http://localhost:3000';
  
  console.log('🔍 Analisando plans de B2S ENTERPRISES LLC...\n');
  
  try {
    // 1. Analisa plans no banco
    const analyzeResponse = await fetch(`${baseUrl}/api/plans/analyze`);
    const analyzeData = await analyzeResponse.json();
    
    console.log(`📊 ${analyzeData.message}`);
    console.log(`   Total: ${analyzeData.total} plans\n`);
    
    if (analyzeData.companies && analyzeData.companies.length > 0) {
      console.log('🏢 Empresas encontradas:');
      analyzeData.companies.forEach(c => {
        console.log(`   - ${c.company}: ${c.count} plans`);
      });
      console.log('');
    }
    
    if (analyzeData.total === 0) {
      console.log('⚠️  Nenhum plan encontrado na tabela plans.');
      console.log('\n💡 Opções:');
      console.log('   1. Se os plans estão em outro banco, use:');
      console.log('      curl -X POST http://localhost:3000/api/import/plans \\');
      console.log('        -H "Content-Type: application/json" \\');
      console.log('        -d \'{"source":"db","connectionString":"...","companyFilter":"B2S ENTERPRISES LLC"}\'');
      console.log('');
      console.log('   2. Se os plans estão em uma API, use:');
      console.log('      curl -X POST http://localhost:3000/api/import/plans \\');
      console.log('        -H "Content-Type: application/json" \\');
      console.log('        -d \'{"source":"api","apiUrl":"https://api.exemplo.com/plans"}\'');
      return;
    }
    
    console.log('🚀 Importando plans para tabela logins...\n');
    
    // 2. Importa plans
    const importResponse = await fetch(`${baseUrl}/api/import/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ syncFromDB: true }),
    });
    
    const importData = await importResponse.json();
    
    if (!importResponse.ok) {
      throw new Error(importData.message || 'Erro ao importar');
    }
    
    console.log(`✅ ${importData.message}`);
    console.log(`   Total processados: ${importData.total}`);
    console.log(`   ✅ Criados: ${importData.created}`);
    console.log(`   ℹ️  Já existiam: ${importData.exists}\n`);
    
    if (importData.results && importData.results.length > 0) {
      const created = importData.results.filter(r => r.status === 'created');
      if (created.length > 0) {
        console.log('📝 Primeiros logins criados:');
        created.slice(0, 10).forEach(r => {
          console.log(`   - ${r.login} → /login/${r.slug}`);
        });
        if (created.length > 10) {
          console.log(`   ... e mais ${created.length - 10} logins`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    if (error.message.includes('fetch')) {
      console.error('\n💡 Certifique-se de que o servidor está rodando: npm run dev');
    }
    process.exit(1);
  }
}

// Usa node-fetch se disponível, senão tenta fetch nativo
let fetch;
try {
  fetch = require('node-fetch');
} catch {
  if (typeof globalThis.fetch === 'undefined') {
    console.error('❌ node-fetch não encontrado. Instale com: npm install node-fetch@2');
    process.exit(1);
  }
  fetch = globalThis.fetch;
}

importB2SPlans();


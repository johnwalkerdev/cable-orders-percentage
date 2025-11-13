#!/usr/bin/env node

require('dotenv').config();
const { importPlans, fetchPlansFromAPI, fetchPlansFromDB } = require('../src/importPlans');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Uso: node scripts/import-plans.js [opções]

Opções:
  --from-supabase <connectionString> [--org-id <id>]  Importa do Supabase
  --from-db <connectionString> [--company <nome>]     Importa de outro banco PostgreSQL
  --from-api <url>                                     Importa de uma API
  --from-file <caminho>                               Importa de arquivo JSON
  --plans <json>                                      Importa plans diretamente (JSON string)

Exemplos:
  node scripts/import-plans.js --from-supabase "postgresql://..." --org-id "uuid"
  node scripts/import-plans.js --from-db "postgresql://..." --company "B2S ENTERPRISES LLC"
  node scripts/import-plans.js --from-api "https://api.example.com/plans"
  node scripts/import-plans.js --from-file "./plans.json"
  node scripts/import-plans.js --plans '[{"login":"user1","onTurf":0,"offTurf":0}]'
`);
    process.exit(1);
  }
  
  let plansToImport = [];
  
  try {
    if (args.includes('--from-supabase')) {
      const supabaseIndex = args.indexOf('--from-supabase');
      const supabaseUrl = args[supabaseIndex + 1];
      const orgIdIndex = args.indexOf('--org-id');
      const orgId = orgIdIndex !== -1 ? args[orgIdIndex + 1] : null;
      
      if (!supabaseUrl) {
        throw new Error('Connection string do Supabase é obrigatória para --from-supabase');
      }
      
      const { fetchPlansFromSupabase, findB2SOrganizationId } = require('../src/fetchSupabasePlans');
      
      console.log('Buscando plans do Supabase...');
      let organizationId = orgId;
      if (!organizationId) {
        console.log('Buscando ID da organização B2S ENTERPRISES LLC...');
        organizationId = await findB2SOrganizationId(supabaseUrl);
        if (organizationId) {
          console.log(`Organização encontrada: ${organizationId}`);
        } else {
          console.log('⚠️  Organização B2S ENTERPRISES LLC não encontrada, buscando todos os plans...');
        }
      }
      
      plansToImport = await fetchPlansFromSupabase(supabaseUrl, organizationId);
      console.log(`Encontrados ${plansToImport.length} plans`);
      
    } else if (args.includes('--from-db')) {
      const dbIndex = args.indexOf('--from-db');
      const connectionString = args[dbIndex + 1];
      const companyIndex = args.indexOf('--company');
      const company = companyIndex !== -1 ? args[companyIndex + 1] : null;
      
      if (!connectionString) {
        throw new Error('Connection string é obrigatória para --from-db');
      }
      
      console.log('Buscando plans do banco de dados...');
      plansToImport = await fetchPlansFromDB(connectionString, company);
      console.log(`Encontrados ${plansToImport.length} plans`);
      
    } else if (args.includes('--from-api')) {
      const apiIndex = args.indexOf('--from-api');
      const apiUrl = args[apiIndex + 1];
      
      if (!apiUrl) {
        throw new Error('URL da API é obrigatória para --from-api');
      }
      
      console.log('Buscando plans da API...');
      plansToImport = await fetchPlansFromAPI(apiUrl);
      console.log(`Encontrados ${plansToImport.length} plans`);
      
    } else if (args.includes('--from-file')) {
      const fileIndex = args.indexOf('--from-file');
      const filePath = args[fileIndex + 1];
      const fs = require('fs');
      
      if (!filePath) {
        throw new Error('Caminho do arquivo é obrigatório para --from-file');
      }
      
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(fileContent);
      plansToImport = Array.isArray(data) ? data : (data.plans || data.data || []);
      console.log(`Carregados ${plansToImport.length} plans do arquivo`);
      
    } else if (args.includes('--plans')) {
      const plansIndex = args.indexOf('--plans');
      const plansJson = args[plansIndex + 1];
      
      if (!plansJson) {
        throw new Error('JSON de plans é obrigatório para --plans');
      }
      
      plansToImport = JSON.parse(plansJson);
      console.log(`Carregados ${plansToImport.length} plans do JSON`);
    } else {
      throw new Error('Especifique uma fonte: --from-db, --from-api, --from-file ou --plans');
    }
    
    if (plansToImport.length === 0) {
      console.log('Nenhum plan para importar.');
      process.exit(0);
    }
    
    console.log('\nIniciando importação...');
    const results = await importPlans(plansToImport);
    
    const created = results.filter(r => r.status === 'created');
    const exists = results.filter(r => r.status === 'exists');
    
    console.log(`\n✅ Importação concluída!`);
    console.log(`   Criados: ${created.length}`);
    console.log(`   Já existiam: ${exists.length}`);
    
    if (created.length > 0) {
      console.log('\nLogins criados:');
      created.forEach(r => console.log(`   - ${r.login} (${r.slug})`));
    }
    
  } catch (error) {
    console.error('❌ Erro na importação:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();


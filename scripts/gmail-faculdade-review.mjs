import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { google } from 'googleapis';

const credDir = join(homedir(), '.gmail-mcp');
const keys = JSON.parse(readFileSync(join(credDir, 'gcp-oauth.keys.json'), 'utf8'));
const creds = JSON.parse(readFileSync(join(credDir, 'credentials.json'), 'utf8'));

const auth = new google.auth.OAuth2(keys.installed.client_id, keys.installed.client_secret);
auth.setCredentials(creds);
const gmail = google.gmail({ version: 'v1', auth });

async function getHeader(msg, name) {
  return msg.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

async function searchAll(query) {
  const ids = [];
  let pageToken;
  do {
    const { data } = await gmail.users.messages.list({
      userId: 'me', q: query, maxResults: 100, pageToken,
    });
    if (data.messages) ids.push(...data.messages.map(m => m.id));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

async function getDetails(id) {
  const { data } = await gmail.users.messages.get({
    userId: 'me', id, format: 'metadata',
    metadataHeaders: ['From', 'Subject', 'Date'],
  });
  return data;
}

function hasAttachment(msg) {
  const parts = msg.payload?.parts || [];
  return parts.some(p => p.filename && p.filename.length > 0);
}

async function main() {
  const period = 'before:2016/01/01 after:2008/12/31';

  console.log('Buscando emails do período 2009-2015...\n');

  // Emails com anexo (mais valiosos - trabalhos, TCC, etc.)
  console.log('1. Buscando emails COM ANEXO...');
  const comAnexoIds = await searchAll(`has:attachment ${period}`);
  console.log(`   Encontrados: ${comAnexoIds.length}\n`);

  // Busca detalhes dos primeiros 30 com anexo
  console.log('=== EMAILS COM ANEXO (amostra de 30) ===');
  let count = 0;
  const comAnexoDetails = [];
  for (const id of comAnexoIds.slice(0, 100)) {
    const msg = await getDetails(id);
    if (hasAttachment(msg)) {
      const from = await getHeader(msg, 'from');
      const subject = await getHeader(msg, 'subject');
      const date = await getHeader(msg, 'date');
      comAnexoDetails.push({ id, from, subject, date });
      if (count < 30) {
        console.log(`  [${date?.substring(5, 16)}] ${from.substring(0, 45)}`);
        console.log(`  📎 ${subject.substring(0, 70)}`);
        console.log('  ---');
        count++;
      }
    }
  }

  // Emails de professores/instituição (domínio @anhembi ou @laureate)
  console.log('\n2. Buscando emails de PROFESSORES (@anhembi/@laureate no período)...');
  // Esses já foram deletados (marketing), mas pode ter outros domínios
  const profIds = await searchAll(`from:(rabontempo OR delmar OR @anhembi OR prof) ${period}`);
  console.log(`   Encontrados: ${profIds.length}`);

  if (profIds.length > 0) {
    console.log('\n=== EMAILS DE PROFESSORES (amostra) ===');
    for (const id of profIds.slice(0, 10)) {
      const msg = await getDetails(id);
      const from = await getHeader(msg, 'from');
      const subject = await getHeader(msg, 'subject');
      const date = await getHeader(msg, 'date');
      console.log(`  [${date?.substring(5, 16)}] ${from.substring(0, 45)}`);
      console.log(`  ${subject.substring(0, 70)}`);
      console.log('  ---');
    }
  }

  // Todos os emails do período (para deletar em lote)
  console.log('\n3. Total de emails no período 2009-2015...');
  const todosIds = await searchAll(period);
  console.log(`   Total: ${todosIds.length} emails`);

  console.log('\n==============================');
  console.log('RESUMO:');
  console.log(`  Emails com anexo (2009-2015): ${comAnexoIds.length}`);
  console.log(`  Emails de professores: ${profIds.length}`);
  console.log(`  Total do período: ${todosIds.length}`);
  console.log('\nOpções:');
  console.log('  A) Deletar TUDO do período 2009-2015 exceto emails com anexo');
  console.log('  B) Deletar TUDO do período 2009-2015 sem exceção');
  console.log('  C) Me passar a lista de emails com anexo para decidir um a um');
}

main().catch(console.error);

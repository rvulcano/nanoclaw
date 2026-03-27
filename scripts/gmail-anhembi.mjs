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

async function showSample(label, ids, n = 5) {
  console.log(`\n=== ${label} (${ids.length} emails) ===`);
  for (const id of ids.slice(0, n)) {
    const msg = await getDetails(id);
    const from = await getHeader(msg, 'from');
    const subject = await getHeader(msg, 'subject');
    const date = await getHeader(msg, 'date');
    console.log(`  [${date?.substring(0, 16)}] ${from.substring(0, 40)}`);
    console.log(`  ${subject.substring(0, 70)}`);
    console.log('  ---');
  }
  if (ids.length > n) console.log(`  ... e mais ${ids.length - n} emails`);
}

async function deleteBatch(ids) {
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 1000) {
    const batch = ids.slice(i, i + 1000);
    await gmail.users.messages.batchDelete({ userId: 'me', requestBody: { ids: batch } });
    deleted += batch.length;
    process.stdout.write(`\r  Deletados: ${deleted}/${ids.length}`);
  }
  console.log('');
}

async function main() {
  console.log('Buscando emails para deletar...\n');

  // 1. Marketing da Anhembi (qualquer época)
  const marketing = await searchAll('from:(@anhembi.br OR @laureate.net OR @anhembi.edu.br)');
  await showSample('Marketing da Anhembi', marketing);

  // 2. Emails do período da faculdade (2009-2015) por nomes dos colegas
  const nomes = ['carlos eduardo', 'thiago toshiaki', 'victor franco', 'guilherme gaspario', 'julio marangoni'];
  const nomeQuery = nomes.map(n => `"${n}"`).join(' OR ');
  const colegas = await searchAll(`(${nomeQuery}) before:2016/01/01 after:2008/12/31`);
  await showSample('Colegas da faculdade (2009-2015)', colegas);

  // 3. Emails genéricos do período (faculdade, TCC, projeto, aula)
  const periodo = await searchAll(
    '(faculdade OR TCC OR "trabalho de conclusão" OR semestre OR disciplina OR "nota final" OR "grupo de trabalho") before:2016/01/01 after:2008/12/31'
  );
  await showSample('Emails do período universitário (2009-2015)', periodo);

  const allIds = [...new Set([...marketing, ...colegas, ...periodo])];
  console.log(`\n==============================`);
  console.log(`Total para deletar: ${allIds.length} emails`);
  console.log(`  - Marketing Anhembi: ${marketing.length}`);
  console.log(`  - Colegas (2009-2015): ${colegas.length}`);
  console.log(`  - Período universitário: ${periodo.length}`);
  console.log('\nConfirma deletar todos? Responda com: node scripts/gmail-delete.mjs');
}

main().catch(console.error);

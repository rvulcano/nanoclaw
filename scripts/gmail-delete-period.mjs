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
  const period = 'before:2016/01/01 after:2008/12/31';

  // Deletar emails SEM anexo do período
  console.log('Buscando emails SEM anexo (2009-2015)...');
  const semAnexo = await searchAll(`-has:attachment ${period}`);
  console.log(`${semAnexo.length} emails para deletar\n`);

  if (semAnexo.length === 0) { console.log('Nada a deletar.'); return; }

  console.log('Deletando...');
  await deleteBatch(semAnexo);
  console.log(`\n✓ ${semAnexo.length} emails deletados!`);
  console.log('Os 3269 emails com anexo foram preservados.');
}

main().catch(console.error);

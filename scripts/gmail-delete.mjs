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

async function main() {
  console.log('Buscando emails de marketing da Anhembi...');
  const ids = await searchAll('from:(@anhembi.br OR @laureate.net OR @anhembi.edu.br)');
  console.log(`${ids.length} emails encontrados. Deletando...`);

  for (let i = 0; i < ids.length; i += 1000) {
    const batch = ids.slice(i, i + 1000);
    await gmail.users.messages.batchDelete({ userId: 'me', requestBody: { ids: batch } });
    process.stdout.write(`\r  ${Math.min(i + 1000, ids.length)}/${ids.length} deletados...`);
  }

  console.log(`\n✓ ${ids.length} emails de marketing da Anhembi deletados!`);
}

main().catch(console.error);

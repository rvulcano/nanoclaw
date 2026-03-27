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

async function count(query) {
  const { data } = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 1 });
  return data.resultSizeEstimate || 0;
}

async function main() {
  console.log('Analisando sua caixa de entrada...\n');

  const [total, inbox, unread, promos, social, spam, withLabel] = await Promise.all([
    count(''),
    count('in:inbox'),
    count('is:unread'),
    count('label:Promoções'),
    count('label:Redes Sociais'),
    count('in:spam'),
    count('label:Vagas OR label:Compras OR label:Finanças'),
  ]);

  console.log('=== VISÃO GERAL ===');
  console.log(`  Total de emails:        ${total.toLocaleString()}`);
  console.log(`  Na caixa de entrada:    ${inbox.toLocaleString()}`);
  console.log(`  Não lidos:              ${unread.toLocaleString()}`);
  console.log(`  Spam:                   ${spam.toLocaleString()}`);
  console.log('');
  console.log('=== LABELS ===');
  console.log(`  Promoções (ocultas):    ${promos.toLocaleString()}`);
  console.log(`  Redes Sociais (ocultas):${social.toLocaleString()}`);
  console.log(`  Vagas/Compras/Finanças: ${withLabel.toLocaleString()}`);

  // Top remetentes na inbox
  console.log('\n=== TOP REMETENTES NA INBOX (amostra) ===');
  const { data } = await gmail.users.messages.list({ userId: 'me', q: 'in:inbox', maxResults: 50 });
  if (data.messages) {
    const senders = {};
    for (const m of data.messages) {
      const { data: msg } = await gmail.users.messages.get({
        userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['From'],
      });
      const from = msg.payload?.headers?.find(h => h.name === 'From')?.value || '';
      const domain = from.match(/@([^>]+)/)?.[1] || from;
      senders[domain] = (senders[domain] || 0) + 1;
    }
    const sorted = Object.entries(senders).sort((a, b) => b[1] - a[1]).slice(0, 15);
    for (const [sender, cnt] of sorted) {
      console.log(`  ${cnt.toString().padStart(3)}x  ${sender}`);
    }
  }
}

main().catch(console.error);

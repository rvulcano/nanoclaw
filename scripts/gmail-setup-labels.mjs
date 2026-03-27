import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { google } from 'googleapis';

const credDir = join(homedir(), '.gmail-mcp');
const keys = JSON.parse(readFileSync(join(credDir, 'gcp-oauth.keys.json'), 'utf8'));
const creds = JSON.parse(readFileSync(join(credDir, 'credentials.json'), 'utf8'));

const auth = new google.auth.OAuth2(
  keys.installed.client_id,
  keys.installed.client_secret,
);
auth.setCredentials(creds);

const gmail = google.gmail({ version: 'v1', auth });

// Labels a criar
const LABELS = [
  { name: 'Vagas',         color: { backgroundColor: '#16a766', textColor: '#ffffff' } },
  { name: 'Faculdade',     color: { backgroundColor: '#a479e2', textColor: '#ffffff' } },
  { name: 'Compras',       color: { backgroundColor: '#ffad47', textColor: '#ffffff' } },
  { name: 'Promoções',     color: { backgroundColor: '#f691b3', textColor: '#ffffff' } },
  { name: 'Redes Sociais', color: { backgroundColor: '#4a86e8', textColor: '#ffffff' } },
  { name: 'Finanças',      color: { backgroundColor: '#89d3b2', textColor: '#ffffff' } },
];

// Filtros por label
const FILTERS = [
  {
    label: 'Vagas',
    criteria: {
      from: 'indeed.com OR linkedin.com OR glassdoor.com OR noreply.linkedin.com OR jobalerts.linkedin.com',
      subject: 'candidatura OR candidato OR "se candidatar" OR "processo seletivo" OR recrutador OR entrevista OR "próxima etapa"',
    },
    skipInbox: false,
  },
  {
    label: 'Compras',
    criteria: {
      subject: 'pedido OR rastreamento OR "código de rastreio" OR "nota fiscal" OR "obrigado pela compra" OR "seu pedido" OR "confirmação de compra" OR "pedido confirmado"',
    },
    skipInbox: false,
  },
  {
    label: 'Promoções',
    criteria: {
      subject: 'oferta OR cupom OR desconto OR promoção OR newsletter OR "aproveite" OR "últimas horas" OR "frete grátis" OR "% off"',
    },
    skipInbox: true,
  },
  {
    label: 'Redes Sociais',
    criteria: {
      from: 'linkedin.com OR instagram.com OR facebook.com OR twitter.com OR tiktok.com OR youtube.com OR pinterest.com',
    },
    skipInbox: true,
  },
  {
    label: 'Finanças',
    criteria: {
      subject: 'boleto OR cobrança OR vencimento OR fatura OR pagamento OR extrato OR débito OR "segunda via"',
    },
    skipInbox: false,
  },
];

async function main() {
  console.log('Buscando labels existentes...');
  const { data: { labels: existing } } = await gmail.users.labels.list({ userId: 'me' });
  const existingNames = new Map(existing.map(l => [l.name, l.id]));

  // Criar labels
  const labelIds = {};
  for (const label of LABELS) {
    const existingKey = [...existingNames.keys()].find(
      k => k.toLowerCase() === label.name.toLowerCase()
    );
    if (existingKey) {
      labelIds[label.name] = existingNames.get(existingKey);
      console.log(`  ✓ Label "${label.name}" já existe`);
    } else {
      try {
        const { data } = await gmail.users.labels.create({
          userId: 'me',
          requestBody: {
            name: label.name,
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show',
            color: label.color,
          },
        });
        labelIds[label.name] = data.id;
        console.log(`  + Label "${label.name}" criada`);
      } catch (e) {
        if (e.status === 409) {
          // recarrega lista e tenta achar
          const { data: { labels: fresh } } = await gmail.users.labels.list({ userId: 'me' });
          const found = fresh.find(l => l.name.toLowerCase() === label.name.toLowerCase());
          if (found) {
            labelIds[label.name] = found.id;
            console.log(`  ✓ Label "${label.name}" já existia`);
          } else {
            console.warn(`  ! Não consegui criar label "${label.name}": conflito`);
          }
        } else throw e;
      }
    }
  }

  // Criar filtros
  console.log('\nCriando filtros...');
  for (const f of FILTERS) {
    const labelId = labelIds[f.label];
    const query = [];
    if (f.criteria.from) query.push(`from:(${f.criteria.from})`);
    if (f.criteria.subject) query.push(`subject:(${f.criteria.subject})`);

    const action = { addLabelIds: [labelId] };
    if (f.skipInbox) action.removeLabelIds = ['INBOX'];

    try {
      await gmail.users.settings.filters.create({
        userId: 'me',
        requestBody: {
          criteria: { query: query.join(' OR ') },
          action,
        },
      });
      console.log(`  + Filtro "${f.label}" criado${f.skipInbox ? ' (pula inbox)' : ''}`);
    } catch (e) {
      if (e.status === 400 && e.errors?.[0]?.message?.includes('already exists')) {
        console.log(`  ✓ Filtro "${f.label}" já existe`);
      } else throw e;
    }
  }

  console.log('\n✓ Configuração concluída!');
  console.log('As labels e filtros já estão ativos no seu Gmail.');
  console.log('Emails novos serão classificados automaticamente.');
  console.log('\nPróximo passo: analisar emails antigos da Anhembi para classificação/deleção.');
}

main().catch(console.error);

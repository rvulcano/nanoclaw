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
    const { data } = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 100, pageToken });
    if (data.messages) ids.push(...data.messages.map(m => m.id));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

async function getLabelId(name) {
  const { data } = await gmail.users.labels.list({ userId: 'me' });
  return data.labels.find(l => l.name.toLowerCase() === name.toLowerCase())?.id;
}

async function applyLabel(ids, labelId, removeInbox = false) {
  for (let i = 0; i < ids.length; i += 1000) {
    const batch = ids.slice(i, i + 1000);
    const mod = { addLabelIds: [labelId] };
    if (removeInbox) mod.removeLabelIds = ['INBOX'];
    await gmail.users.messages.batchModify({ userId: 'me', requestBody: { ids: batch, ...mod } });
  }
}

async function deleteBatch(ids) {
  for (let i = 0; i < ids.length; i += 1000) {
    await gmail.users.messages.batchDelete({ userId: 'me', requestBody: { ids: ids.slice(i, i + 1000) } });
    process.stdout.write(`\r  ${Math.min(i + 1000, ids.length)}/${ids.length}`);
  }
  console.log('');
}

async function main() {
  // Busca IDs das labels
  const [vagasId, comprasId, promosId, socialId, financasId] = await Promise.all([
    getLabelId('Vagas'), getLabelId('Compras'), getLabelId('Promoções'),
    getLabelId('Redes Sociais'), getLabelId('Finanças'),
  ]);

  // 1. DELETAR lixo óbvio
  console.log('1. Deletando emails de lixo...');
  const lixoQuery = 'from:(vidadesindico.com.br OR buynotice.alibaba.com OR alibaba.com OR aliexpress.com)';
  const lixo = await searchAll(lixoQuery);
  if (lixo.length > 0) {
    process.stdout.write(`   ${lixo.length} emails... `);
    await deleteBatch(lixo);
    console.log(`   ✓ ${lixo.length} deletados`);
  } else {
    console.log('   Nenhum encontrado');
  }

  // 2. LABEL: Vagas (fica na inbox)
  console.log('\n2. Aplicando label Vagas...');
  const vagas = await searchAll(
    'from:(indeed.com OR linkedin.com OR glassdoor.com OR jobalerts.linkedin.com OR jobs-noreply@linkedin.com OR ats.bizneo.com OR loft.teamtailor OR workable OR gupy OR inhire OR kenoby)'
  );
  if (vagas.length > 0 && vagasId) {
    await applyLabel(vagas, vagasId, false);
    console.log(`   ✓ ${vagas.length} emails com label Vagas`);
  }

  // 3. LABEL: Compras (fica na inbox)
  console.log('\n3. Aplicando label Compras...');
  const compras = await searchAll(
    'from:(amazon.com.br OR mercadolivre OR shopee OR magalu OR americanas OR submarino OR casasbahia OR drogasil OR ultrafarma) subject:(pedido OR rastreamento OR "nota fiscal" OR "obrigado pela compra" OR confirmação)'
  );
  if (compras.length > 0 && comprasId) {
    await applyLabel(compras, comprasId, false);
    console.log(`   ✓ ${compras.length} emails com label Compras`);
  }

  // 4. LABEL: Promoções (sai da inbox)
  console.log('\n4. Aplicando label Promoções (remove da inbox)...');
  const promos = await searchAll(
    'from:(e.drogasil.com.br OR mail.beehiiv.com OR clubedecriacao.com.br OR cambly.com OR pocketcasts.com OR vidadesindico.com.br) OR category:promotions'
  );
  if (promos.length > 0 && promosId) {
    await applyLabel(promos, promosId, true);
    console.log(`   ✓ ${promos.length} emails com label Promoções (removidos da inbox)`);
  }

  // 5. LABEL: Redes Sociais (sai da inbox)
  console.log('\n5. Aplicando label Redes Sociais (remove da inbox)...');
  const social = await searchAll('category:social OR from:(facebook.com OR instagram.com OR twitter.com OR tiktok.com)');
  if (social.length > 0 && socialId) {
    await applyLabel(social, socialId, true);
    console.log(`   ✓ ${social.length} emails com label Redes Sociais (removidos da inbox)`);
  }

  // 6. LABEL: Finanças (fica na inbox)
  console.log('\n6. Aplicando label Finanças...');
  const financas = await searchAll(
    'subject:(boleto OR cobrança OR vencimento OR fatura OR pagamento OR extrato OR "segunda via")'
  );
  if (financas.length > 0 && financasId) {
    await applyLabel(financas, financasId, false);
    console.log(`   ✓ ${financas.length} emails com label Finanças`);
  }

  console.log('\n✓ Organização concluída!');
}

main().catch(console.error);

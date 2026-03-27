import { createServer } from 'http';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { exec } from 'child_process';

const keysPath = join(homedir(), '.gmail-mcp', 'gcp-oauth.keys.json');
const credPath = join(homedir(), '.gmail-mcp', 'credentials.json');

const keys = JSON.parse(readFileSync(keysPath, 'utf8'));
const { client_id, client_secret } = keys.installed;

const PORT = 8765;
const REDIRECT = `http://localhost:${PORT}/callback`;
const SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/calendar',
].join(' ');

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `access_type=offline&scope=${encodeURIComponent(SCOPES)}&response_type=code` +
  `&client_id=${client_id}&redirect_uri=${encodeURIComponent(REDIRECT)}`;

console.log('\n=== Gmail OAuth ===');
console.log('Abrindo navegador...');
console.log('Se não abrir, acesse manualmente:\n');
console.log(authUrl);
console.log('\nAguardando autorização...');

exec(`start "" "${authUrl}"`);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');
  if (!code) { res.end('Sem código'); return; }

  res.end('<h2>Autorizado! Pode fechar essa janela.</h2>');
  server.close();

  const params = new URLSearchParams({
    code, client_id, client_secret,
    redirect_uri: REDIRECT,
    grant_type: 'authorization_code',
  });

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const tokens = await r.json();
  if (tokens.error) { console.error('Erro:', tokens); process.exit(1); }

  mkdirSync(join(homedir(), '.gmail-mcp'), { recursive: true });
  writeFileSync(credPath, JSON.stringify(tokens, null, 2));
  console.log('\n✓ Credenciais salvas em', credPath);
  process.exit(0);
});

server.listen(PORT, () => console.log(`Servidor em localhost:${PORT}`));

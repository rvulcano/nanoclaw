import { createServer } from 'http';
import qrcode from 'qrcode';
import makeWASocket, { DisconnectReason, useMultiFileAuthState, Browsers } from '@whiskeysockets/baileys';
import pino from 'pino';
import { exec } from 'child_process';

const PORT = 8888;
let currentQR = null;
let authenticated = false;

const server = createServer(async (req, res) => {
  if (req.url === '/qr-image' && currentQR) {
    const img = await qrcode.toBuffer(currentQR, { width: 400 });
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(img);
  } else if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ authenticated }));
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<head><title>WhatsApp QR</title>
<meta http-equiv="refresh" content="30">
<style>
  body { font-family: Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f0f2f5; }
  .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); text-align: center; }
  h2 { color: #128C7E; }
  img { width: 300px; height: 300px; }
  p { color: #666; }
</style>
</head>
<body>
<div class="card">
  <h2>Vincular WhatsApp</h2>
  <img src="/qr-image?t=${Date.now()}" alt="QR Code"/>
  <p>1. Abra o WhatsApp > Configurações > Dispositivos vinculados<br>
     2. Toque em <b>Vincular dispositivo</b><br>
     3. Escaneie o QR code acima</p>
  <p><small>A página atualiza automaticamente a cada 30s</small></p>
</div>
</body>
</html>`);
  }
});

server.listen(PORT, () => {
  console.log(`\n✓ Acesse no navegador: http://localhost:${PORT}`);
  exec(`start http://localhost:${PORT}`);
});

const { state, saveCreds } = await useMultiFileAuthState('store/auth');
const logger = pino({ level: 'silent' });

const sock = makeWASocket({ auth: state, logger, browser: Browsers.macOS('Chrome') });

sock.ev.on('creds.update', saveCreds);

sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
  if (qr) {
    currentQR = qr;
    console.log('QR code atualizado — acesse http://localhost:' + PORT);
  }
  if (connection === 'open') {
    authenticated = true;
    console.log('\n✓ WhatsApp autenticado com sucesso!');
    server.close();
    process.exit(0);
  }
  if (connection === 'close') {
    const code = lastDisconnect?.error?.output?.statusCode;
    if (code !== DisconnectReason.loggedOut) {
      console.log('Reconectando...');
    } else {
      console.log('Deslogado.');
      process.exit(1);
    }
  }
});

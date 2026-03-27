import https from 'https';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';

const GROQ_HOST = 'api.groq.com';
const GROQ_PATH = '/openai/v1/audio/transcriptions';

let groqApiKey: string | null = null;

function getGroqApiKey(): string | null {
  if (groqApiKey !== null) return groqApiKey || null;
  const env = readEnvFile(['GROQ_API_KEY']);
  groqApiKey = env.GROQ_API_KEY || '';
  if (!groqApiKey) {
    logger.warn(
      'GROQ_API_KEY not set in .env — voice messages will not be transcribed',
    );
  }
  return groqApiKey || null;
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  mimetype: string,
): Promise<string | null> {
  const apiKey = getGroqApiKey();
  if (!apiKey) return null;

  const ext = mimetype.includes('ogg') ? 'ogg' : 'mp4';
  const boundary = `----NanoClawBoundary${Date.now()}`;

  // Build multipart form data manually
  const parts: Buffer[] = [];

  // File field
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mimetype}\r\n\r\n`,
    ),
  );
  parts.push(audioBuffer);
  parts.push(Buffer.from('\r\n'));

  // Model field
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3\r\n`,
    ),
  );

  // Language field
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\npt\r\n`,
    ),
  );

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(parts);

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: GROQ_HOST,
        path: GROQ_PATH,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode !== 200) {
            logger.error(
              { status: res.statusCode, body: responseBody },
              'Groq transcription failed',
            );
            resolve(null);
            return;
          }
          try {
            const result = JSON.parse(responseBody) as { text?: string };
            logger.info(
              { length: result.text?.length },
              'Audio transcribed successfully',
            );
            resolve(result.text || null);
          } catch (err) {
            logger.error({ err, body: responseBody }, 'Failed to parse Groq response');
            resolve(null);
          }
        });
      },
    );

    req.on('error', (err) => {
      logger.error({ err }, 'Failed to transcribe audio');
      resolve(null);
    });

    req.write(body);
    req.end();
  });
}

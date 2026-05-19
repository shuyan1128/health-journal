import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '.env') });

import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const key = process.env.VITE_ANTHROPIC_API_KEY;
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(req.body),
  });
  const data = await response.json();
  if (!response.ok) {
    console.error('Anthropic error:', response.status, JSON.stringify(data));
  }
  res.status(response.status).json(data);
});

app.listen(3001, () => {
  const key = process.env.VITE_ANTHROPIC_API_KEY;
  console.log('Proxy server running on http://localhost:3001');
  console.log('API key loaded:', key ? `${key.slice(0, 15)}...` : 'NOT FOUND');
});

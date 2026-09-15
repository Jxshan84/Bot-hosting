import express, { Request, Response } from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import Docker from 'dockerode';
import { ContainerManager } from './ContainerManager';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

app.use(cors());
app.use(express.json());

// 1. Create a new bot container
app.post('/api/bots', async (req: Request, res: Response) => {
  try {
    const { botId, ramLimitMb, cpuCount, env } = req.body;
    if (!botId) {
      return res.status(400).json({ error: 'botId is required' });
    }

    const container = await ContainerManager.createBot({
      botId,
      ramLimitMb,
      cpuCount,
      env,
    });

    res.status(201).json({ success: true, containerId: container.id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Start bot
app.post('/api/bots/:id/start', async (req: Request, res: Response) => {
  try {
    await ContainerManager.startBot(req.params.id);
    res.json({ status: 'running' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Stop bot
app.post('/api/bots/:id/stop', async (req: Request, res: Response) => {
  try {
    await ContainerManager.stopBot(req.params.id);
    res.json({ status: 'stopped' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Live resource stats (RAM, CPU)
app.get('/api/bots/:id/stats', async (req: Request, res: Response) => {
  try {
    const stats = await ContainerManager.getBotStats(req.params.id);
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Realtime Live Terminal / Console (Docker Stream -> WebSocket)
wss.on('connection', (ws: WebSocket, req) => {
  const urlParams = new URLSearchParams(req.url?.split('?')[1]);
  const containerId = urlParams.get('containerId');

  if (!containerId) {
    ws.close(1008, 'Missing containerId');
    return;
  }

  const container = docker.getContainer(containerId);

  // Attach interactive shell stream
  container.attach(
    { stream: true, stdout: true, stderr: true, stdin: true },
    (err, stream) => {
      if (err || !stream) {
        ws.send(`\r\nError attaching to terminal: ${err?.message}\r\n`);
        ws.close();
        return;
      }

      // Container output -> Browser xterm.js
      stream.on('data', (chunk: Buffer) => {
        ws.send(chunk.toString('utf-8'));
      });

      // Browser keystrokes -> Container input
      ws.on('message', (data: string) => {
        stream.write(data);
      });

      ws.on('close', () => {
        stream.end();
      });
    }
  );
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Bot Hosting Daemon running on port ${PORT}`);
});
        

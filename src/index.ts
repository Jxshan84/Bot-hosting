import express, { Request, Response } from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import Docker from 'dockerode';
import { ContainerManager } from './ContainerManager';
import { FileManager } from './FileManager';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

app.use(cors());
app.use(express.json());

// 1. Create bot directory & container
app.post('/api/bots', async (req: Request, res: Response) => {
  try {
    const { botId, ramLimitMb, cpuCount, env } = req.body;
    if (!botId) {
      return res.status(400).json({ error: 'botId is required' });
    }

    await FileManager.initBotDirectory(botId);

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

// 4. Live resource stats
app.get('/api/bots/:id/stats', async (req: Request, res: Response) => {
  try {
    const stats = await ContainerManager.getBotStats(req.params.id);
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. List files inside bot directory
app.get('/api/bots/:botId/files', async (req: Request, res: Response) => {
  try {
    const subPath = (req.query.path as string) || '';
    const files = await FileManager.listFiles(req.params.botId, subPath);
    res.json({ files });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Read specific file content
app.get('/api/bots/:botId/files/content', async (req: Request, res: Response) => {
  try {
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ error: 'Path query is required' });
    }
    const content = await FileManager.readFile(req.params.botId, filePath);
    res.json({ content });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Save file content
app.post('/api/bots/:botId/files/save', async (req: Request, res: Response) => {
  try {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: 'path and content are required' });
    }
    await FileManager.saveFile(req.params.botId, filePath, content);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Delete file or directory
app.delete('/api/bots/:botId/files', async (req: Request, res: Response) => {
  try {
    const targetPath = req.query.path as string;
    if (!targetPath) {
      return res.status(400).json({ error: 'Path query is required' });
    }
    await FileManager.deleteItem(req.params.botId, targetPath);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Realtime Console Stream
wss.on('connection', (ws: WebSocket, req) => {
  const urlParams = new URLSearchParams(req.url?.split('?')[1]);
  const containerId = urlParams.get('containerId');

  if (!containerId) {
    ws.close(1008, 'Missing containerId');
    return;
  }

  const container = docker.getContainer(containerId);

  container.attach(
    { stream: true, stdout: true, stderr: true, stdin: true },
    (err, stream) => {
      if (err || !stream) {
        ws.send(`\r\nError attaching to terminal: ${err?.message}\r\n`);
        ws.close();
        return;
      }

      stream.on('data', (chunk: Buffer) => {
        ws.send(chunk.toString('utf-8'));
      });

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

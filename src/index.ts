import express, { Request, Response } from 'express';
import cors from 'cors';
import Docker from 'dockerode';

const app = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

app.use(cors({ origin: '*' }));
app.use(express.json());

// 1. Live Stats & Real-time Status Check
app.get('/api/bots/:id/stats', async (req: Request, res: Response) => {
  try {
    const container = docker.getContainer(req.params.id);
    const inspect = await container.inspect();
    const isRunning = inspect.State.Running;

    if (!isRunning) {
      return res.json({
        running: false,
        status: inspect.State.Status,
        memoryUsedMB: '0.00',
        memoryLimitMB: '0.00',
        memoryPercent: '0.00%',
      });
    }

    const statsData = await container.stats({ stream: false });
    const memUsage = statsData.memory_stats?.usage || 0;
    const memLimit = statsData.memory_stats?.limit || 1;

    res.json({
      running: true,
      status: inspect.State.Status,
      memoryUsedMB: (memUsage / (1024 * 1024)).toFixed(2),
      memoryLimitMB: (memLimit / (1024 * 1024)).toFixed(2),
      memoryPercent: ((memUsage / memLimit) * 100).toFixed(2) + '%',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Start Bot (304 Handled)
app.post('/api/bots/:id/start', async (req: Request, res: Response) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.start();
    res.json({ success: true, message: 'Container started' });
  } catch (err: any) {
    if (err.statusCode === 304 || (err.message && err.message.includes('304'))) {
      return res.json({ success: true, message: 'Container already running' });
    }
    res.status(500).json({ error: err.message });
  }
});

// 3. Stop Bot (304 Handled)
app.post('/api/bots/:id/stop', async (req: Request, res: Response) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.stop();
    res.json({ success: true, message: 'Container stopped' });
  } catch (err: any) {
    if (err.statusCode === 304 || (err.message && err.message.includes('304'))) {
      return res.json({ success: true, message: 'Container already stopped' });
    }
    res.status(500).json({ error: err.message });
  }
});

// 4. Console Logs
app.get('/api/bots/:id/logs', async (req: Request, res: Response) => {
  try {
    const container = docker.getContainer(req.params.id);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: 100,
    });
    res.type('text/plain').send(logs.toString('utf8'));
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

const PORT = process.env.PORT || 4000;
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`Bot Hosting Daemon running on port ${PORT}`);
});

const express = require('express');
const cors = require('cors');
const Docker = require('dockerode');

const app = express();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

app.use(cors({ origin: '*' }));
app.use(express.json());

// 1. Live Stats & Status Check Route
app.get('/api/bots/:id/stats', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const inspect = await container.inspect();
    const isRunning = inspect.State.Running;

    // Agar container stopped/exited hai
    if (!isRunning) {
      return res.json({
        running: false,
        status: inspect.State.Status, // 'exited'
        memoryUsedMB: '0.00',
        memoryLimitMB: '0.00',
        memoryPercent: '0.00%',
      });
    }

    // Container running hone par actual RAM metrics fetch karein
    const statsData = await container.stats({ stream: false });
    const memUsage = statsData.memory_stats?.usage || 0;
    const memLimit = statsData.memory_stats?.limit || 1;

    res.json({
      running: true,
      status: inspect.State.Status, // 'running'
      memoryUsedMB: (memUsage / (1024 * 1024)).toFixed(2),
      memoryLimitMB: (memLimit / (1024 * 1024)).toFixed(2),
      memoryPercent: ((memUsage / memLimit) * 100).toFixed(2) + '%',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Start Bot Route (304 Handled)
app.post('/api/bots/:id/start', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.start();
    res.json({ success: true, message: 'Container started' });
  } catch (err) {
    // 304 = Container already running (Treat as success)
    if (err.statusCode === 304 || (err.message && err.message.includes('304'))) {
      return res.json({ success: true, message: 'Container already running' });
    }
    res.status(500).json({ error: err.message });
  }
});

// 3. Stop Bot Route (304 Handled)
app.post('/api/bots/:id/stop', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.stop();
    res.json({ success: true, message: 'Container stopped' });
  } catch (err) {
    // 304 = Container already stopped (Treat as success)
    if (err.statusCode === 304 || (err.message && err.message.includes('304'))) {
      return res.json({ success: true, message: 'Container already stopped' });
    }
    res.status(500).json({ error: err.message });
  }
});

// 4. Console Logs Route
app.get('/api/bots/:id/logs', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: 100,
    });
    res.type('text/plain').send(logs.toString('utf8'));
  } catch (err) {
    res.status(500).send(err.message);
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server listening on 0.0.0.0:${PORT}`);
});

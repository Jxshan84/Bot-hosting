import Docker from 'dockerode';
import path from 'path';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

export interface CreateBotOptions {
  botId: string;
  image?: string;
  ramLimitMb?: number;
  cpuCount?: number;
  env?: Record<string, string>;
}

export class ContainerManager {
  private static STORAGE_ROOT = '/srv/hosting/bots';

  static async createBot(options: CreateBotOptions): Promise<Docker.Container> {
    const {
      botId,
      image = 'node:20-alpine',
      ramLimitMb = 512,
      cpuCount = 1.0,
      env = {}
    } = options;

    const hostBotDir = path.join(this.STORAGE_ROOT, botId);
    const envArray = Object.entries(env).map(([k, v]) => `${k}=${v}`);

    const container = await docker.createContainer({
      Image: image,
      name: `bot-${botId}`,
      WorkingDir: '/home/container',
      Env: envArray,
      Cmd: ['sh', '-c', 'npm install && node index.js'],
      Tty: true,
      OpenStdin: true,
      StdinOnce: false,
      HostConfig: {
        Memory: ramLimitMb * 1024 * 1024,      // RAM capping
        NanoCpus: Math.floor(cpuCount * 1e9),  // CPU limit
        PidsLimit: 100,                        // Fork bomb protection
        Binds: [`${hostBotDir}:/home/container:rw`],
        NetworkMode: 'bot-network',
        RestartPolicy: {
          Name: 'on-failure',
          MaximumRetryCount: 5,
        },
      },
    });

    return container;
  }

  static async startBot(containerId: string): Promise<void> {
    const container = docker.getContainer(containerId);
    await container.start();
  }

  static async stopBot(containerId: string): Promise<void> {
    const container = docker.getContainer(containerId);
    await container.stop({ t: 5 });
  }

  static async getBotStats(containerId: string) {
    const container = docker.getContainer(containerId);
    const stats = await container.stats({ stream: false });

    const usedMemory = stats.memory_stats.usage || 0;
    const memoryLimit = stats.memory_stats.limit || 1;
    const memoryPercent = ((usedMemory / memoryLimit) * 100).toFixed(2);

    return {
      memoryUsedMB: (usedMemory / (1024 * 1024)).toFixed(2),
      memoryLimitMB: (memoryLimit / (1024 * 1024)).toFixed(2),
      memoryPercent: `${memoryPercent}%`,
    };
  }
}


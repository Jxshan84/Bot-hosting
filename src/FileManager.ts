import fs from 'fs/promises';
import path from 'path';

const STORAGE_ROOT = '/srv/hosting/bots';

export class FileManager {
  /**
   * Path traversal attack prevent karne ke liye secure path validator
   */
  private static resolveSafePath(botId: string, userPath: string = ''): string {
    const baseDir = path.resolve(STORAGE_ROOT, botId);
    const cleanUserPath = userPath.replace(/^(\.\.(\/|\\|$))+/, '');
    const safePath = path.resolve(baseDir, cleanUserPath);

    if (!safePath.startsWith(baseDir)) {
      throw new Error('Access denied: Unauthorized directory access');
    }

    return safePath;
  }

  // Initial bot setup with default starter files
  static async initBotDirectory(botId: string): Promise<void> {
    const botDir = this.resolveSafePath(botId);
    await fs.mkdir(botDir, { recursive: true });

    const packageJsonPath = path.join(botDir, 'package.json');
    const indexJsPath = path.join(botDir, 'index.js');

    const defaultPackageJson = {
      name: `bot-${botId}`,
      version: '1.0.0',
      main: 'index.js',
      dependencies: {
        "discord.js": "^14.15.3"
      }
    };

    const defaultIndexJs = `console.log("Bot container initialized successfully!");\n`;

    await fs.writeFile(packageJsonPath, JSON.stringify(defaultPackageJson, null, 2));
    await fs.writeFile(indexJsPath, defaultIndexJs);
  }

  // Directory listing
  static async listFiles(botId: string, subPath: string = '') {
    const targetDir = this.resolveSafePath(botId, subPath);
    const entries = await fs.readdir(targetDir, { withFileTypes: true });

    return entries.map(entry => ({
      name: entry.name,
      isDirectory: entry.isDirectory(),
      size: entry.isFile() ? 'file' : 'folder'
    }));
  }

  // Read file content for code editor
  static async readFile(botId: string, filePath: string): Promise<string> {
    const targetPath = this.resolveSafePath(botId, filePath);
    return await fs.readFile(targetPath, 'utf-8');
  }

  // Save updated code
  static async saveFile(botId: string, filePath: string, content: string): Promise<void> {
    const targetPath = this.resolveSafePath(botId, filePath);
    await fs.writeFile(targetPath, content, 'utf-8');
  }

  // Delete file or folder
  static async deleteItem(botId: string, itemPath: string): Promise<void> {
    const targetPath = this.resolveSafePath(botId, itemPath);
    await fs.rm(targetPath, { recursive: true, force: true });
  }
}


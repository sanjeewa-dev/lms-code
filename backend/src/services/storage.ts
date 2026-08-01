import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { env } from '../config/env';

/**
 * StorageService abstracts file persistence. It currently writes to local disk
 * (outside the web root), but the interface is intentionally small so it can be
 * swapped for S3 or another object store later without touching callers.
 */
export interface StorageService {
  save(buffer: Buffer, originalName: string): Promise<string>;
  saveFromPath(sourcePath: string, originalName: string): Promise<string>;
  read(storageKey: string): Promise<Buffer>;
  createReadStream(storageKey: string): fs.ReadStream;
  remove(storageKey: string): Promise<void>;
  absolutePath(storageKey: string): string;
}

class LocalStorageService implements StorageService {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  async save(buffer: Buffer, originalName: string): Promise<string> {
    const ext = path.extname(originalName).toLowerCase();
    const key = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    await fsp.writeFile(path.join(this.baseDir, key), buffer);
    return key;
  }

  async saveFromPath(sourcePath: string, originalName: string): Promise<string> {
    const ext = path.extname(originalName).toLowerCase();
    const key = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    await fsp.copyFile(sourcePath, path.join(this.baseDir, key));
    return key;
  }

  absolutePath(storageKey: string): string {
    // Prevent path traversal - only allow the basename within baseDir.
    const safe = path.basename(storageKey);
    return path.join(this.baseDir, safe);
  }

  async read(storageKey: string): Promise<Buffer> {
    return fsp.readFile(this.absolutePath(storageKey));
  }

  createReadStream(storageKey: string): fs.ReadStream {
    return fs.createReadStream(this.absolutePath(storageKey));
  }

  async remove(storageKey: string): Promise<void> {
    await fsp.rm(this.absolutePath(storageKey), { force: true });
  }
}

export const storage: StorageService = new LocalStorageService(env.uploadDir);

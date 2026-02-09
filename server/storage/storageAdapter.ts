import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

export interface FileMetadata {
  size: number;
  lastModified: Date;
  contentType: string;
}

export interface StorageAdapter {
  putFile(data: Buffer, ext: string): Promise<{ fileId: string; filePath: string; publicUrl: string }>;
  getReadStream(fileId: string, ext: string, options?: { start?: number; end?: number }): fs.ReadStream | null;
  getFileMetadata(fileId: string, ext: string): FileMetadata | null;
  deleteFile(fileId: string, ext: string): void;
  fileExists(fileId: string, ext: string): boolean;
  resolveFilePath(fileId: string, ext: string): string | null;
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private baseDir: string, private urlPrefix: string) {
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
  }

  async putFile(data: Buffer, ext: string): Promise<{ fileId: string; filePath: string; publicUrl: string }> {
    const fileId = randomUUID();
    const fileName = `${fileId}.${ext}`;
    const filePath = path.join(this.baseDir, fileName);
    fs.writeFileSync(filePath, data);
    return { fileId, filePath, publicUrl: `${this.urlPrefix}/${fileId}` };
  }

  getReadStream(fileId: string, ext: string, options?: { start?: number; end?: number }): fs.ReadStream | null {
    const filePath = this.resolveFilePath(fileId, ext);
    if (!filePath) return null;
    return fs.createReadStream(filePath, options);
  }

  getFileMetadata(fileId: string, ext: string): FileMetadata | null {
    const filePath = this.resolveFilePath(fileId, ext);
    if (!filePath) return null;
    const stat = fs.statSync(filePath);
    const extMap: Record<string, string> = {
      m4a: "audio/mp4",
      mp3: "audio/mpeg",
      mp4: "audio/mp4",
      wav: "audio/wav",
      ogg: "audio/ogg",
      webm: "audio/webm",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
    };
    return {
      size: stat.size,
      lastModified: stat.mtime,
      contentType: extMap[ext] || "application/octet-stream",
    };
  }

  deleteFile(fileId: string, ext: string): void {
    const filePath = this.resolveFilePath(fileId, ext);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  fileExists(fileId: string, ext: string): boolean {
    return this.resolveFilePath(fileId, ext) !== null;
  }

  resolveFilePath(fileId: string, ext: string): string | null {
    const sanitized = fileId.replace(/[^a-zA-Z0-9\-]/g, "");
    const filePath = path.join(this.baseDir, `${sanitized}.${ext}`);
    return fs.existsSync(filePath) ? filePath : null;
  }
}

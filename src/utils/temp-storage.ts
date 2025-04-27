import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

export class TempStorage {
  private static instance: TempStorage;
  private tempDir: string;

  private constructor() {
    // Create a subdirectory in the system's temp directory
    this.tempDir = path.join(os.tmpdir(), 'friendly-fetch');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  public static getInstance(): TempStorage {
    if (!TempStorage.instance) {
      TempStorage.instance = new TempStorage();
    }
    return TempStorage.instance;
  }

  /**
   * Save content to a temporary file
   * @param content The content to save
   * @param contentType The MIME type of the content
   * @returns Object containing the file path
   */
  public async saveToTemp(content: Buffer | string, contentType: string): Promise<{
    filePath: string;
  }> {
    // Generate a unique filename based on content hash and type
    const buffer = content instanceof Buffer ? content : Buffer.from(content);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 12);
    const ext = this.getFileExtension(contentType);
    const filename = `${hash}${ext}`;
    const filePath = path.join(this.tempDir, filename);

    // Write the content to the file
    await fs.promises.writeFile(filePath, buffer);

    return {
      filePath
    };
  }

  /**
   * Get appropriate file extension based on content type
   */
  private getFileExtension(contentType: string): string {
    const commonExtensions: Record<string, string> = {
      'application/pdf': '.pdf',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'application/zip': '.zip',
      'text/plain': '.txt',
      'text/html': '.html',
      'text/css': '.css',
      'text/javascript': '.js',
      'application/json': '.json',
      'application/xml': '.xml'
    };

    return commonExtensions[contentType] || '.bin';
  }
} 
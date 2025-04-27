import { vi } from 'vitest';
import { Buffer } from 'buffer';

// Make Buffer available globally
global.Buffer = Buffer;

// Mock fetch if not available
if (!global.fetch) {
  global.fetch = vi.fn();
}

// Mock Response if not available
if (!global.Response) {
  global.Response = class Response {
    constructor(body: BodyInit | null = null, init?: ResponseInit) {
      this.body = body;
      this.headers = new Headers(init?.headers);
      this.status = init?.status || 200;
      this.statusText = init?.statusText || 'OK';
    }

    body: BodyInit | null;
    headers: Headers;
    status: number;
    statusText: string;
    ok = true;
    redirected = false;
    type: ResponseType = 'default';
    url = '';

    async arrayBuffer(): Promise<ArrayBuffer> {
      if (this.body instanceof Buffer) {
        return this.body.buffer.slice(
          this.body.byteOffset,
          this.body.byteOffset + this.body.byteLength
        );
      }
      if (typeof this.body === 'string') {
        return Buffer.from(this.body).buffer;
      }
      return new ArrayBuffer(0);
    }

    async text(): Promise<string> {
      if (this.body instanceof Buffer) {
        return this.body.toString('utf-8');
      }
      if (typeof this.body === 'string') {
        return this.body;
      }
      return '';
    }

    // Add other methods as needed
    async blob(): Promise<Blob> {
      throw new Error('Not implemented');
    }

    async json(): Promise<any> {
      const text = await this.text();
      return JSON.parse(text);
    }

    async formData(): Promise<FormData> {
      throw new Error('Not implemented');
    }

    clone(): Response {
      return new Response(this.body, {
        headers: this.headers,
        status: this.status,
        statusText: this.statusText
      });
    }
  } as unknown as typeof Response;
}

// Mock Headers if not available
if (!global.Headers) {
  global.Headers = class Headers {
    private headers: Map<string, string>;

    constructor(init?: HeadersInit) {
      this.headers = new Map();
      if (init) {
        if (init instanceof Headers) {
          init.forEach((value, key) => this.headers.set(key.toLowerCase(), value));
        } else if (Array.isArray(init)) {
          init.forEach(([key, value]) => this.headers.set(key.toLowerCase(), value));
        } else {
          Object.entries(init).forEach(([key, value]) => 
            this.headers.set(key.toLowerCase(), value)
          );
        }
      }
    }

    append(name: string, value: string): void {
      this.headers.set(name.toLowerCase(), value);
    }

    delete(name: string): void {
      this.headers.delete(name.toLowerCase());
    }

    get(name: string): string | null {
      return this.headers.get(name.toLowerCase()) || null;
    }

    has(name: string): boolean {
      return this.headers.has(name.toLowerCase());
    }

    set(name: string, value: string): void {
      this.headers.set(name.toLowerCase(), value);
    }

    forEach(callback: (value: string, key: string) => void): void {
      this.headers.forEach((value, key) => callback(value, key));
    }
  } as unknown as typeof Headers;
} 
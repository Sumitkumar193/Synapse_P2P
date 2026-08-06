import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export interface HTTPRequestOptions {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: any;
  timeoutMs?: number;
}

/**
 * Transport abstraction for HTTP REST and SSE API calls.
 */
export class HTTPTransport {
  public async request<T = any>(options: HTTPRequestOptions): Promise<T> {
    const { url, method = 'POST', headers = {}, body, timeoutMs = 30000 } = options;
    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const requestModule = isHttps ? https : http;

    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (postData) {
      reqHeaders['Content-Length'] = String(Buffer.byteLength(postData));
    }

    return new Promise((resolve, reject) => {
      const req = requestModule.request(
        parsedUrl,
        {
          method,
          headers: reqHeaders,
          timeout: timeoutMs,
        },
        (res) => {
          let data = '';
          res.setEncoding('utf-8');

          res.on('data', (chunk) => {
            data += chunk;
          });

          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const parsed = JSON.parse(data);
                resolve(parsed);
              } catch {
                resolve(data as any);
              }
            } else {
              reject(new Error(`HTTP error ${res.statusCode}: ${data}`));
            }
          });
        }
      );

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`HTTP request timeout after ${timeoutMs}ms`));
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }
}

/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as http from 'http';
import fs from 'fs';
import path from 'path';
import type { TraceModel } from './traceModel';

export type ServerRouteHandler = (request: http.IncomingMessage, response: http.ServerResponse) => boolean;

export class TraceServer {
  private _traceModel: TraceModel;
  private _server: http.Server | undefined;
  private _urlPrefix: string;
  private _routes: { prefix?: string, exact?: string, needsReferrer: boolean, handler: ServerRouteHandler }[] = [];

  constructor(traceModel: TraceModel) {
    this._traceModel = traceModel;
    this._urlPrefix = '';

    const traceModelHandler: ServerRouteHandler = (request, response) => {
      response.statusCode = 200;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(this._traceModel));
      return true;
    };
    this.routePath('/tracemodel', traceModelHandler);
  }

  routePrefix(prefix: string, handler: ServerRouteHandler, skipReferrerCheck?: boolean) {
    this._routes.push({ prefix, handler, needsReferrer: !skipReferrerCheck });
  }

  routePath(path: string, handler: ServerRouteHandler, skipReferrerCheck?: boolean) {
    this._routes.push({ exact: path, handler, needsReferrer: !skipReferrerCheck });
  }

  async start(): Promise<string> {
    this._server = http.createServer(this._onRequest.bind(this));
    this._server.listen();
    await new Promise(cb => this._server!.once('listening', cb));
    const address = this._server.address();
    this._urlPrefix = typeof address === 'string' ? address : `http://127.0.0.1:${address.port}`;
    return this._urlPrefix;
  }

  async stop() {
    await new Promise(cb => this._server!.close(cb));
  }

  urlPrefix() {
    return this._urlPrefix;
  }

  serveFile(response: http.ServerResponse, absoluteFilePath: string, headers?: { [name: string]: string }): boolean {
    try {
      const content = fs.readFileSync(absoluteFilePath);
      response.statusCode = 200;
      const contentType = extensionToMime[path.extname(absoluteFilePath).substring(1)] || 'application/octet-stream';
      response.setHeader('Content-Type', contentType);
      response.setHeader('Content-Length', content.byteLength);
      for (const [name, value] of Object.entries(headers || {}))
        response.setHeader(name, value);
      response.end(content);
      return true;
    } catch (e) {
      return false;
    }
  }

  private _onRequest(request: http.IncomingMessage, response: http.ServerResponse) {
    request.on('error', () => response.end());
    try {
      if (!request.url) {
        response.end();
        return;
      }
      const url = new URL('http://localhost' + request.url);
      const hasReferrer = request.headers['referer'] && request.headers['referer'].startsWith(this._urlPrefix);
      for (const route of this._routes) {
        if (route.needsReferrer && !hasReferrer)
          continue;
        if (route.exact && url.pathname === route.exact && route.handler(request, response))
          return;
        if (route.prefix && url.pathname.startsWith(route.prefix) && route.handler(request, response))
          return;
      }
      response.statusCode = 404;
      response.end();
    } catch (e) {
      response.end();
    }
  }
}

const extensionToMime: { [key: string]: string } = {
  'css': 'text/css',
  'html': 'text/html',
  'jpeg': 'image/jpeg',
  'jpg': 'image/jpeg',
  'js': 'application/javascript',
  'png': 'image/png',
  'ttf': 'font/ttf',
  'svg': 'image/svg+xml',
  'webp': 'image/webp',
  'woff': 'font/woff',
  'woff2': 'font/woff2',
};

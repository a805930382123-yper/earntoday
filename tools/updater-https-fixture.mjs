// Disposable test server only. Does not change system proxy, DNS or TLS verification.
import { createServer } from "node:https";
import { createServer as createProxyServer } from "node:http";
import { connect } from "node:net";

export async function startHttpsFixture({ pfx, passphrase, payload }) {
  let manifest = "{invalid-json"; let chunksSent = 0;
  const tunnels = new Set();
  const server = createServer({ pfx, passphrase }, (request, response) => {
    const url = new URL(request.url, "https://github.com");
    if (url.pathname.endsWith("/latest.json")) {
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store", Connection: "close" });
      response.end(manifest); return;
    }
    if (url.pathname.endsWith("-setup.exe")) {
      response.writeHead(200, { "Content-Type": "application/octet-stream", "Content-Length": payload.length, Connection: "close" });
      if (url.searchParams.has("interrupted")) {
        response.write(payload.subarray(0, 512 * 1024)); chunksSent++;
        setTimeout(() => response.destroy(), 300);
      } else response.end(payload);
      return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const proxy = createProxyServer();
  proxy.on("connect", (request, client, head) => {
    if (request.url !== "github.com:443") { client.end("HTTP/1.1 502 Bad Gateway\r\n\r\n"); return; }
    const upstream = connect(server.address().port, "127.0.0.1", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      client.pipe(upstream); upstream.pipe(client);
    });
    for (const socket of [client, upstream]) {
      tunnels.add(socket); socket.on("close", () => tunnels.delete(socket));
      socket.on("error", () => { client.destroy(); upstream.destroy(); });
    }
  });
  await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
  return {
    proxyUrl: `http://127.0.0.1:${proxy.address().port}`,
    setManifest: data => { manifest = typeof data === "string" ? data : JSON.stringify(data); },
    get chunksSent() { return chunksSent; },
    async stop() {
      for (const socket of tunnels) socket.destroy();
      server.closeAllConnections();
      await Promise.all([new Promise(resolve => proxy.close(resolve)), new Promise(resolve => server.close(resolve))]);
    },
  };
}

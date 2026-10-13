const endpoint = process.argv[2] ?? "http://127.0.0.1:9333";
const expression = process.argv[3] ?? "location.href";

const target = endpoint.includes("/devtools/page/")
  ? { webSocketDebuggerUrl: endpoint }
  : (await (await fetch(`${endpoint}/json`)).json()).find((item) => item.type === "page");
if (!target) throw new Error("No debuggable page");

const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();

function send(method, params = {}) {
  const message = { id: ++id, method, params };
  ws.send(JSON.stringify(message));
  return new Promise((resolve, reject) => pending.set(message.id, { resolve, reject }));
}

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.id && pending.has(data.id)) {
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    data.error ? reject(new Error(JSON.stringify(data.error))) : resolve(data.result);
  }
};

await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

const result = await send("Runtime.evaluate", {
  expression,
  returnByValue: true,
  awaitPromise: true,
});
console.log(JSON.stringify(result, null, 2));
ws.close();

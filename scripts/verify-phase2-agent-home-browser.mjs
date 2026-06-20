import { spawn } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

async function findOpenPort(start = 5290) {
  const { createServer: createNetServer } = await import("node:net");
  for (let port = start; port < start + 40; port += 1) {
    const available = await new Promise((resolveAvailable) => {
      const server = createNetServer();
      server.once("error", () => resolveAvailable(false));
      server.once("listening", () => {
        server.close(() => resolveAvailable(true));
      });
      server.listen(port, "127.0.0.1");
    });
    if (available) return port;
  }
  throw new Error("No open local port found for Agent Home browser smoke");
}

async function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(300);
  }
  throw new Error(`preview server did not become ready: ${lastError}`);
}

function contentTypeFor(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function createStaticDistServer(distDir) {
  const indexPath = join(distDir, "index.html");
  assert(existsSync(indexPath), "dist/index.html is missing; run npm run build before browser smoke");
  return createServer((request, response) => {
    const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
    const normalized = pathname === "/" ? "/index.html" : pathname;
    const candidate = resolve(distDir, `.${decodeURIComponent(normalized)}`);
    const filePath = candidate.startsWith(resolve(distDir)) && existsSync(candidate) ? candidate : indexPath;
    response.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
    createReadStream(filePath).pipe(response);
  });
}

function candidateBrowsers() {
  const env = [
    process.env.ZHIMENG_BROWSER,
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
  ].filter(Boolean);
  if (process.platform === "win32") {
    const programFiles = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
    return [
      ...env,
      ...programFiles.map((root) => join(root, "Microsoft", "Edge", "Application", "msedge.exe")),
      ...programFiles.map((root) => join(root, "Google", "Chrome", "Application", "chrome.exe")),
    ];
  }
  if (process.platform === "darwin") {
    return [
      ...env,
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
  }
  return [
    ...env,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/microsoft-edge",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
}

function findBrowser() {
  const seen = new Set();
  for (const candidate of candidateBrowsers()) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("No headless Edge/Chrome executable found. Set ZHIMENG_BROWSER to a Chrome-compatible browser path.");
}

function browserBaseArgs(userDataDir, remoteDebuggingPort = null) {
  const baseArgs = [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${userDataDir}`,
  ];
  if (remoteDebuggingPort) baseArgs.push(`--remote-debugging-port=${remoteDebuggingPort}`);
  return baseArgs;
}

async function waitForJson(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  let lastError = "";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  throw new Error(`DevTools endpoint did not become ready: ${lastError}`);
}

function encodeWebSocketFrame(text) {
  const payload = Buffer.from(text);
  let header;
  if (payload.length < 126) {
    header = Buffer.alloc(2);
    header[1] = 0x80 | payload.length;
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  header[0] = 0x81;
  const mask = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const masked = Buffer.alloc(payload.length);
  for (let index = 0; index < payload.length; index += 1) {
    masked[index] = payload[index] ^ mask[index % 4];
  }
  return Buffer.concat([header, mask, masked]);
}

function decodeWebSocketFrames(buffer) {
  const messages = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    let headerLength = 2;
    if (length === 126) {
      if (offset + 4 > buffer.length) break;
      length = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (length === 127) {
      if (offset + 10 > buffer.length) break;
      length = Number(buffer.readBigUInt64BE(offset + 2));
      headerLength = 10;
    }
    const maskLength = masked ? 4 : 0;
    const frameEnd = offset + headerLength + maskLength + length;
    if (frameEnd > buffer.length) break;
    const payloadStart = offset + headerLength + maskLength;
    let payload = buffer.subarray(payloadStart, frameEnd);
    if (masked) {
      const mask = buffer.subarray(offset + headerLength, offset + headerLength + 4);
      payload = Buffer.from(payload.map((value, index) => value ^ mask[index % 4]));
    }
    if (opcode === 1) messages.push(payload.toString("utf8"));
    offset = frameEnd;
  }
  return { messages, rest: buffer.subarray(offset) };
}

async function connectWebSocket(wsUrl) {
  const { connect } = await import("node:net");
  const url = new URL(wsUrl);
  const socket = connect(Number(url.port || 80), url.hostname);
  await new Promise((resolveConnect, rejectConnect) => {
    socket.once("connect", resolveConnect);
    socket.once("error", rejectConnect);
  });
  const key = Buffer.from(`zhimeng-${Date.now()}`).toString("base64");
  socket.write([
    `GET ${url.pathname}${url.search} HTTP/1.1`,
    `Host: ${url.host}`,
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Key: ${key}`,
    "Sec-WebSocket-Version: 13",
    "",
    "",
  ].join("\r\n"));
  let handshake = Buffer.alloc(0);
  while (!handshake.includes(Buffer.from("\r\n\r\n"))) {
    const chunk = await new Promise((resolveChunk, rejectChunk) => {
      socket.once("data", resolveChunk);
      socket.once("error", rejectChunk);
    });
    handshake = Buffer.concat([handshake, chunk]);
  }
  const splitAt = handshake.indexOf("\r\n\r\n") + 4;
  const header = handshake.subarray(0, splitAt).toString("utf8");
  assert(header.includes("101"), `DevTools WebSocket handshake failed: ${header}`);
  let frameBuffer = handshake.subarray(splitAt);
  let nextId = 0;
  const pending = new Map();
  socket.on("data", (chunk) => {
    frameBuffer = Buffer.concat([frameBuffer, chunk]);
    const decoded = decodeWebSocketFrames(frameBuffer);
    frameBuffer = decoded.rest;
    for (const messageText of decoded.messages) {
      const message = JSON.parse(messageText);
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      }
    }
  });
  return {
    send(method, params = {}) {
      const id = ++nextId;
      socket.write(encodeWebSocketFrame(JSON.stringify({ id, method, params })));
      return new Promise((resolveMessage, rejectMessage) => {
        const timeout = setTimeout(() => {
          pending.delete(id);
          rejectMessage(new Error(`DevTools command timed out: ${method}`));
        }, 20000);
        pending.set(id, (message) => {
          clearTimeout(timeout);
          if (message.error) rejectMessage(new Error(`${method}: ${JSON.stringify(message.error)}`));
          else resolveMessage(message.result);
        });
      });
    },
    close() {
      socket.end();
    },
  };
}

async function evaluateWithRetry(devtools, params, attempts = 5) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await devtools.send("Runtime.evaluate", params);
    } catch (error) {
      lastError = error;
      if (!String(error instanceof Error ? error.message : error).includes("Execution context was destroyed")) throw error;
      await delay(600);
    }
  }
  throw lastError;
}

async function stopBrowserProcess(browserProcess) {
  if (!browserProcess) return;
  if (browserProcess.exitCode !== null || browserProcess.signalCode !== null) return;
  const exited = new Promise((resolveExit) => {
    browserProcess.once("exit", resolveExit);
  });
  browserProcess.kill();
  await Promise.race([exited, delay(1500)]);
}

const port = Number(process.env.ZHIMENG_PHASE2_BROWSER_PORT || await findOpenPort());
const debugPort = Number(process.env.ZHIMENG_PHASE2_BROWSER_DEBUG_PORT || await findOpenPort(5500));
const url = `http://127.0.0.1:${port}/?phase2-browser-smoke=1`;
const runtimeDir = resolve(".codex-runtime");
mkdirSync(runtimeDir, { recursive: true });
const screenshotPath = join(runtimeDir, "phase2-agent-home-browser.png");
const browserDataDir = mkdtempSync(join(tmpdir(), "zhimeng-agent-home-browser-"));
const server = createStaticDistServer(resolve("dist"));
let browserProcess = null;
let devtools = null;

try {
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  await waitForServer(`http://127.0.0.1:${port}/`);
  const browserPath = findBrowser();
  browserProcess = spawn(browserPath, [
    ...browserBaseArgs(browserDataDir, debugPort),
    "--window-size=1440,920",
    url,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let browserStderr = "";
  browserProcess.stderr?.on("data", (chunk) => { browserStderr += String(chunk); });
  browserProcess.stdout?.resume();
  const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`);
  assert(version.webSocketDebuggerUrl, "DevTools browser websocket URL missing");
  const pageTarget = await (async () => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 30000) {
      const targets = await waitForJson(`http://127.0.0.1:${debugPort}/json`);
      const match = targets.find((target) => target.type === "page" && String(target.url || "").includes(`127.0.0.1:${port}`));
      if (match?.webSocketDebuggerUrl) return match;
      await delay(250);
    }
    throw new Error(`Could not find Agent Home page target. Browser stderr: ${browserStderr}`);
  })();
  devtools = await connectWebSocket(pageTarget.webSocketDebuggerUrl);
  await devtools.send("Runtime.enable");
  await devtools.send("Page.enable");
  await delay(800);
  const readyResult = await evaluateWithRetry(devtools, {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      new Promise((resolve) => {
        const startedAt = Date.now();
        const tick = () => {
          const home = document.querySelector('[data-testid="agent-home-focused"]');
          const left = home?.querySelector('aside:first-of-type');
          const main = home?.querySelector('main');
          const composer = document.querySelector('[data-testid="agent-thread-composer"]');
          const side = document.querySelector('[data-testid="agent-home-side-tabs"]');
          if (home && left && main && composer && side) {
            const rectOf = (element) => {
              const rect = element.getBoundingClientRect();
              return {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              };
            };
            resolve({
              ok: true,
              title: document.title,
              sideState: side.getAttribute('data-panel-state'),
              html: document.documentElement.outerHTML,
              layout: {
                viewport: { width: window.innerWidth, height: window.innerHeight },
                home: rectOf(home),
                left: rectOf(left),
                main: rectOf(main),
                side: rectOf(side),
                composer: rectOf(composer),
              },
            });
            return;
          }
          if (Date.now() - startedAt > 20000) {
            resolve({ ok: false, title: document.title, text: document.body.innerText, html: document.documentElement.outerHTML });
            return;
          }
          setTimeout(tick, 100);
        };
        tick();
      })
    `,
  });
  const readyValue = readyResult.result?.value || {};
  assert(readyValue.ok, `Agent Home did not render in browser: ${JSON.stringify(readyValue).slice(0, 2000)}`);
  const layout = readyValue.layout || {};
  assert(layout.left?.width >= 220 && layout.left?.width <= 280, `left rail width drifted: ${JSON.stringify(layout.left)}`);
  assert(layout.side?.width >= 40 && layout.side?.width <= 70, `collapsed right rail width drifted: ${JSON.stringify(layout.side)}`);
  assert(layout.main?.width > 760, `main chat area is too narrow: ${JSON.stringify(layout.main)}`);
  assert(layout.main?.width > (layout.left?.width || 0) * 2, `main chat area must remain the primary surface: ${JSON.stringify(layout)}`);
  assert(layout.composer?.width >= 720, `composer is too narrow for a chat-first home: ${JSON.stringify(layout.composer)}`);
  assert(layout.composer?.x > layout.left?.width, `composer should be in the main panel, not the left rail: ${JSON.stringify(layout)}`);
  const dom = String(readyValue.html || "");
  for (const phrase of [
    "织梦写作台 / Zhimeng Writing Agent",
    "agent-home-focused",
    "agent-thread-composer",
    "agent-home-side-tabs",
    "data-panel-state=\"collapsed\"",
    "composer-model-pill",
  ]) {
    assert(dom.includes(phrase), `browser DOM missing: ${phrase}`);
  }
  assert(!dom.includes("agent-home-side-tab-model"), "Agent Home right rail must not expose a model/API tab");
  assert(!dom.includes("agent-model-drawer"), "Agent Home must not render the legacy model drawer");
  const statusRailResult = await evaluateWithRetry(devtools, {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      new Promise((resolve) => {
        const button = document.querySelector('[data-testid="agent-home-side-tab-status"]');
        if (!button) {
          resolve({ ok: false, reason: "missing status tab", html: document.documentElement.outerHTML });
          return;
        }
        button.click();
        const startedAt = Date.now();
        const rectOf = (element) => {
          const rect = element.getBoundingClientRect();
          return {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        };
        const tick = () => {
          const side = document.querySelector('[data-testid="agent-home-side-tabs"]');
          const strip = document.querySelector('[data-testid="home-toolchain-strip"]');
          const runtimeSummary = document.querySelector('[data-testid="home-runtime-summary"]');
          const runtimeDetails = document.querySelector('[data-testid="home-runtime-log-details"]');
          const steps = Array.from(document.querySelectorAll('.codex-toolchain-step'));
          if (side?.getAttribute('data-panel-state') === 'open' && strip && runtimeSummary && runtimeDetails && steps.length === 4) {
            resolve({
              ok: true,
              sideState: side.getAttribute('data-panel-state'),
              runtimeDetailsOpen: runtimeDetails.hasAttribute('open'),
              labels: steps.map((step) => step.innerText.replace(/\\s+/g, " ").trim()),
              layout: {
                side: rectOf(side),
                strip: rectOf(strip),
                runtimeSummary: rectOf(runtimeSummary),
                runtimeDetails: rectOf(runtimeDetails),
                steps: steps.map(rectOf),
              },
            });
            return;
          }
          if (Date.now() - startedAt > 5000) {
            resolve({
              ok: false,
              sideState: side?.getAttribute('data-panel-state') || "",
              stepCount: steps.length,
              text: document.body.innerText,
              html: document.documentElement.outerHTML,
            });
            return;
          }
          setTimeout(tick, 100);
        };
        tick();
      })
    `,
  });
  const statusRail = statusRailResult.result?.value || {};
  assert(statusRail.ok, `Agent Home status rail did not expose toolchain strip: ${JSON.stringify(statusRail).slice(0, 2000)}`);
  assert(statusRail.sideState === "open", `status rail should open the right panel: ${JSON.stringify(statusRail)}`);
  assert(statusRail.runtimeDetailsOpen === false, `runtime log details should be collapsed by default: ${JSON.stringify(statusRail)}`);
  assert(statusRail.layout?.side?.width >= 300, `opened right rail is too narrow for status details: ${JSON.stringify(statusRail.layout)}`);
  assert(statusRail.layout?.strip?.width >= 260, `toolchain strip is too narrow: ${JSON.stringify(statusRail.layout)}`);
  assert(statusRail.layout?.runtimeSummary?.height <= 80, `runtime summary should stay compact: ${JSON.stringify(statusRail.layout)}`);
  assert(statusRail.layout?.runtimeDetails?.height <= 48, `runtime log details should not dominate while collapsed: ${JSON.stringify(statusRail.layout)}`);
  assert(Array.isArray(statusRail.layout?.steps) && statusRail.layout.steps.every((step) => step.width >= 50 && step.height >= 24), `toolchain steps are not readable: ${JSON.stringify(statusRail.layout)}`);
  for (const label of ["请求", "网关", "审批", "报告"]) {
    assert(String(statusRail.labels || "").includes(label), `toolchain label missing after browser render: ${label}`);
  }
  const screenshotResult = await devtools.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  writeFileSync(screenshotPath, Buffer.from(screenshotResult.data, "base64"));
  assert(existsSync(screenshotPath), `screenshot not created: ${screenshotPath}`);
  assert(statSync(screenshotPath).size > 10000, `screenshot too small: ${screenshotPath}`);
  console.log(`phase2-agent-home-browser ok`);
  console.log(`screenshot: ${screenshotPath}`);
} catch (error) {
  throw error;
} finally {
  devtools?.close();
  await stopBrowserProcess(browserProcess);
  await new Promise((resolveClose) => server.close(resolveClose));
  rmSync(browserDataDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
}

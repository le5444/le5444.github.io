import { spawn, spawnSync } from "node:child_process";
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
      ...programFiles.map((root) => join(root, "Google", "Chrome", "Application", "chrome.exe")),
      ...programFiles.map((root) => join(root, "Microsoft", "Edge", "Application", "msedge.exe")),
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
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-features=Translate,MediaRouter,OptimizationHints",
    "--disable-sync",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-breakpad",
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
        }, 60000);
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
  const firstExit = await Promise.race([exited.then(() => true), delay(3000).then(() => false)]);
  if (!firstExit && browserProcess.exitCode === null && browserProcess.signalCode === null) {
    if (process.platform === "win32" && browserProcess.pid) {
      spawnSync("taskkill", ["/pid", String(browserProcess.pid), "/T", "/F"], { stdio: "ignore" });
    }
    browserProcess.kill("SIGKILL");
    await Promise.race([exited, delay(3000)]);
  }
}

async function closeBrowserByDevtools(devtools) {
  if (!devtools) return;
  try {
    await devtools.send("Browser.close");
    await delay(500);
  } catch {
    // The page websocket may close before acknowledging Browser.close.
  }
}

async function cleanupBrowserDataDir(path) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
      return;
    } catch (error) {
      if (attempt === 7) {
        console.warn(`[phase2-browser] browser temp cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      await delay(400);
    }
  }
}

const port = Number(process.env.ZHIMENG_PHASE2_BROWSER_PORT || await findOpenPort());
const debugPort = Number(process.env.ZHIMENG_PHASE2_BROWSER_DEBUG_PORT || await findOpenPort(5500));
const mockProviderPort = Number(process.env.ZHIMENG_PHASE2_BROWSER_PROVIDER_PORT || await findOpenPort(5600));
const url = `http://127.0.0.1:${port}/?phase2-browser-smoke=1`;
const runtimeDir = resolve(".codex-runtime");
mkdirSync(runtimeDir, { recursive: true });
const collapsedScreenshotPath = join(runtimeDir, "phase2-agent-home-browser-collapsed.png");
const screenshotPath = join(runtimeDir, "phase2-agent-home-browser-status-open.png");
const browserDataDir = mkdtempSync(join(tmpdir(), "zhimeng-agent-home-browser-"));
const server = createStaticDistServer(resolve("dist"));
let browserProcess = null;
let mockProviderProcess = null;
let devtools = null;

try {
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", resolveListen);
  });
  await waitForServer(`http://127.0.0.1:${port}/`);
  mockProviderProcess = spawn(process.execPath, [
    "scripts/smoke-openai-compatible-server.mjs",
    String(mockProviderPort),
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let mockProviderStderr = "";
  mockProviderProcess.stderr?.on("data", (chunk) => { mockProviderStderr += String(chunk); });
  mockProviderProcess.stdout?.resume();
  await waitForServer(`http://127.0.0.1:${mockProviderPort}/v1/models`, 15000).catch((error) => {
    throw new Error(`mock Provider did not become ready: ${error instanceof Error ? error.message : String(error)} ${mockProviderStderr}`);
  });
  const browserPath = findBrowser();
  browserProcess = spawn(browserPath, [
    ...browserBaseArgs(browserDataDir, debugPort),
    "--window-size=1440,920",
    url,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let browserStderr = "";
  browserProcess.stderr?.on("data", (chunk) => { browserStderr += String(chunk); });
  browserProcess.stdout?.resume();
  const version = await waitForJson(`http://127.0.0.1:${debugPort}/json/version`, 60000).catch((error) => {
    const stderr = browserStderr.trim();
    const exitCode = browserProcess?.exitCode;
    throw new Error(`DevTools endpoint did not become ready: ${error instanceof Error ? error.message : String(error)}; browserExit=${exitCode ?? "running"}; browserStderr=${stderr.slice(-2000) || "[empty]"}`);
  });
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
  await devtools.send("Page.navigate", { url });
  await delay(1200);
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
            const modelPill = document.querySelector('[data-testid="composer-model-pill"]');
            const emptyModelLink = document.querySelector('[data-testid="agent-home-empty-model-link"]');
            const starterModelButton = document.querySelector('[data-testid="agent-home-starter-config-model"]');
            const starter = document.querySelector('.codex-chat-empty');
            const messageList = document.querySelector('.codex-message-list');
            const composerCard = document.querySelector('.codex-composer-card');
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
              sideText: side.innerText.replace(/\\s+/g, " ").trim(),
              html: document.documentElement.outerHTML,
              bodyText: document.body.innerText.replace(/\\s+/g, " ").trim(),
              modelPillText: modelPill?.innerText.replace(/\\s+/g, " ").trim() || "",
              modelPillTitle: modelPill?.getAttribute("title") || "",
              emptyModelLinkText: emptyModelLink?.innerText.replace(/\\s+/g, " ").trim() || "",
              emptyModelLinkTitle: emptyModelLink?.getAttribute("title") || "",
              starterModelButtonText: starterModelButton?.innerText.replace(/\\s+/g, " ").trim() || "",
              starterModelButtonTitle: starterModelButton?.getAttribute("title") || "",
              layout: {
                viewport: { width: window.innerWidth, height: window.innerHeight },
                home: rectOf(home),
                left: rectOf(left),
                main: rectOf(main),
                side: rectOf(side),
                composer: rectOf(composer),
                composerCard: composerCard ? rectOf(composerCard) : null,
                starter: starter ? rectOf(starter) : null,
                messageList: messageList ? rectOf(messageList) : null,
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
  assert(layout.side?.width >= 52 && layout.side?.width <= 74, `collapsed right rail width drifted: ${JSON.stringify(layout.side)}`);
  assert(layout.main?.width > 760, `main chat area is too narrow: ${JSON.stringify(layout.main)}`);
  assert(layout.main?.width > (layout.left?.width || 0) * 2, `main chat area must remain the primary surface: ${JSON.stringify(layout)}`);
  assert(layout.composer?.width >= 720, `composer is too narrow for a chat-first home: ${JSON.stringify(layout.composer)}`);
  assert(layout.composer?.x > layout.left?.width, `composer should be in the main panel, not the left rail: ${JSON.stringify(layout)}`);
  assert(layout.starter?.height > 100, `empty starter should be visible above the composer: ${JSON.stringify(layout)}`);
  assert(layout.composerCard?.y > layout.starter?.y, `composer should stay below the starter: ${JSON.stringify(layout)}`);
  const starterComposerGap = (layout.composerCard?.y || layout.composer?.y || 0) - ((layout.starter?.y || 0) + (layout.starter?.height || 0));
  assert(starterComposerGap >= 0 && starterComposerGap <= 42, `empty starter should stay visually attached to composer, gap=${starterComposerGap}: ${JSON.stringify(layout)}`);
  assert(layout.messageList?.height > layout.starter?.height, `empty starter should sit inside the message surface, not replace it: ${JSON.stringify(layout)}`);
  const initialModelText = `${readyValue.modelPillText || ""}\n${readyValue.emptyModelLinkText || ""}`;
  const initialModelTitle = `${readyValue.modelPillTitle || ""}\n${readyValue.emptyModelLinkTitle || ""}`;
  if (initialModelText.includes("LM Studio Local") || initialModelText.includes("local-model")) {
    assert(initialModelText.includes("配置档案"), `offline local model label should clarify saved profile, not live model availability: ${JSON.stringify({ initialModelText, initialModelTitle })}`);
    assert(initialModelTitle.includes("不代表本地模型服务已启动"), `offline local model title should explain service is not started: ${JSON.stringify({ initialModelText, initialModelTitle })}`);
  }
  const dom = String(readyValue.html || "");
  const initialBodyText = String(readyValue.bodyText || "");
  assert(initialBodyText.includes("对话模式"), `default Agent Home should use 对话模式 wording: ${JSON.stringify({ bodyText: initialBodyText }).slice(0, 2000)}`);
  assert(initialBodyText.includes("全部") && initialBodyText.includes("置顶") && initialBodyText.includes("项目") && initialBodyText.includes("对话"), `left filter should expose concise chat/project filters: ${JSON.stringify({ bodyText: initialBodyText }).slice(0, 2000)}`);
  assert(!initialBodyText.includes("自由模式"), `default Agent Home should not expose old 自由模式 wording: ${JSON.stringify({ bodyText: initialBodyText }).slice(0, 2000)}`);
  assert(!initialBodyText.includes("对话 · 1 对话模式"), `left header stats should avoid duplicated chat wording: ${JSON.stringify({ bodyText: initialBodyText }).slice(0, 2000)}`);
  assert(!initialBodyText.includes("自由"), `default focused Agent Home should not expose old 自由 wording: ${JSON.stringify({ bodyText: initialBodyText }).slice(0, 2000)}`);
  for (const label of ["上下文", "文件", "变更", "审批", "状态"]) {
    assert(String(readyValue.sideText || "").includes(label), `collapsed right rail should expose short Chinese label: ${label}; sideText=${JSON.stringify(readyValue.sideText)}`);
  }
  const threadMenuResult = await evaluateWithRetry(devtools, {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      new Promise((resolve) => {
        const rowButton = document.querySelector('[data-testid^="agent-thread-row-menu-"]');
        const headerButton = document.querySelector('[data-testid="agent-home-thread-menu"]');
        if (!rowButton || !headerButton) {
          resolve({ ok: false, reason: "missing thread menu buttons", bodyText: document.body.innerText });
          return;
        }
        const readPanel = (selector) => {
          const panel = document.querySelector(selector);
          return panel ? panel.innerText.replace(/\\s+/g, " ").trim() : "";
        };
        rowButton.click();
        setTimeout(() => {
          const rowText = readPanel('[data-testid^="agent-thread-row-menu-panel-"]');
          rowButton.click();
          setTimeout(() => {
            headerButton.click();
            setTimeout(() => {
              const headerText = readPanel('[data-testid="agent-home-thread-menu-panel"]');
              headerButton.click();
              resolve({ ok: Boolean(rowText && headerText), rowText, headerText });
            }, 80);
          }, 80);
        }, 80);
      })
    `,
  });
  const threadMenu = threadMenuResult.result?.value || {};
  assert(threadMenu.ok, `thread menus should open from both left row and header: ${JSON.stringify(threadMenu).slice(0, 2000)}`);
  for (const label of ["置顶", "重命名", "创建分支", "导出", "归档", "删除"]) {
    assert(String(threadMenu.rowText || "").includes(label), `left row thread menu missing ${label}: ${JSON.stringify(threadMenu).slice(0, 2000)}`);
    assert(String(threadMenu.headerText || "").includes(label), `header thread menu missing ${label}: ${JSON.stringify(threadMenu).slice(0, 2000)}`);
  }
  const workspaceMenuResult = await evaluateWithRetry(devtools, {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      new Promise((resolve) => {
        const workspaceButton = Array.from(document.querySelectorAll('button[data-testid^="agent-home-workspace-menu-"]'))
          .find((button) => !button.getAttribute("data-testid").includes("-open-") && !button.getAttribute("data-testid").includes("-files-") && !button.getAttribute("data-testid").includes("-pin-") && !button.getAttribute("data-testid").includes("-rename-") && !button.getAttribute("data-testid").includes("-delete-"));
        if (!workspaceButton) {
          resolve({ ok: false, reason: "missing workspace menu button", bodyText: document.body.innerText });
          return;
        }
        workspaceButton.click();
        setTimeout(() => {
          const panel = document.querySelector('[data-testid^="agent-home-workspace-menu-panel-"]');
          const text = panel ? panel.innerText.replace(/\\s+/g, " ").trim() : "";
          workspaceButton.click();
          resolve({ ok: Boolean(text), text });
        }, 80);
      })
    `,
  });
  const workspaceMenu = workspaceMenuResult.result?.value || {};
  assert(workspaceMenu.ok, `workspace menu should open from left project row: ${JSON.stringify(workspaceMenu).slice(0, 2000)}`);
  for (const label of ["打开项目对话", "打开项目文件", "置顶", "重命名", "删除"]) {
    assert(String(workspaceMenu.text || "").includes(label), `workspace menu missing ${label}: ${JSON.stringify(workspaceMenu).slice(0, 2000)}`);
  }
  for (const phrase of [
    "织梦写作台 / Zhimeng Writing Agent",
    "agent-home-focused",
    "agent-thread-composer",
    "agent-home-side-tabs",
    "data-panel-state=\"collapsed\"",
    "composer-model-pill",
    "agent-home-starter-config-model",
  ]) {
    assert(dom.includes(phrase), `browser DOM missing: ${phrase}`);
  }
  assert(/模型中心|配置模型/.test(String(readyValue.starterModelButtonText || "")), `empty Agent Home should expose the primary model setup action: ${JSON.stringify({
    starterModelButtonText: readyValue.starterModelButtonText,
    starterModelButtonTitle: readyValue.starterModelButtonTitle,
  })}`);
  assert(String(readyValue.starterModelButtonTitle || "").includes("baseURL"), `empty Agent Home model setup action should explain API fields: ${JSON.stringify({
    starterModelButtonText: readyValue.starterModelButtonText,
    starterModelButtonTitle: readyValue.starterModelButtonTitle,
  })}`);
  for (const phrase of [
    "workbench-sidebar-project-section",
    "agent-home-new-project-thread",
    "agent-home-workspace-create",
    "composer-project-strip",
    "composer-open-files",
    "composer-scan-workspace",
    "composer-bind-workspace-root",
    "home-workspace-root-input",
    "home-workspace-root-save",
    "home-workspace-root-scan",
    "home-index-preview-file",
    "home-index-attach-file",
    "home-index-preview-diff",
    "home-index-attach-index",
    "项目文件工作流",
    "当前步骤",
    "读取 read_file 预览",
    "挂入上下文",
    "生成待审 Diff 草案",
  ]) {
    assert(dom.includes(phrase), `browser DOM missing project-mode workflow affordance: ${phrase}`);
  }
  assert(!dom.includes("agent-home-side-tab-model"), "Agent Home right rail must not expose a model/API tab");
  assert(!dom.includes("agent-model-drawer"), "Agent Home must not render the legacy model drawer");
  const collapsedScreenshotResult = await devtools.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  writeFileSync(collapsedScreenshotPath, Buffer.from(collapsedScreenshotResult.data, "base64"));
  assert(existsSync(collapsedScreenshotPath), `collapsed screenshot not created: ${collapsedScreenshotPath}`);
  assert(statSync(collapsedScreenshotPath).size > 10000, `collapsed screenshot too small: ${collapsedScreenshotPath}`);
  const customProviderSettingsResult = await evaluateWithRetry(devtools, {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      new Promise((resolve) => {
        const openButton = document.querySelector('[data-testid="agent-home-starter-config-model"]') || document.querySelector('[data-testid="composer-model-pill"]');
        if (!openButton) {
          resolve({ ok: false, reason: "missing model setup opener", html: document.documentElement.outerHTML });
          return;
        }
        openButton.click();
        const startedAt = Date.now();
        const setNativeValue = (element, value) => {
          const proto = Object.getPrototypeOf(element);
          const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
          descriptor?.set?.call(element, value);
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        };
        const tick = () => {
          const panel = document.querySelector('[data-testid="settings-modal-panel"]');
          const quickstart = document.querySelector('[data-testid="settings-provider-custom-quickstart"]');
          const apiUrl = document.querySelector('[data-testid="settings-custom-api-url-input"]');
          const apiKey = document.querySelector('[data-testid="settings-custom-api-key-input"]');
          const modelId = document.querySelector('[data-testid="settings-custom-model-id-input"]');
          const modelName = document.querySelector('[data-testid="settings-custom-model-name-input"]');
          const provider = document.querySelector('[data-testid="settings-custom-provider-select"]');
          const save = document.querySelector('[data-testid="settings-quick-save-button"]');
          const pasteParser = document.querySelector('[data-testid="settings-provider-paste-parser"]');
          const pasteInput = document.querySelector('[data-testid="settings-provider-config-paste-input"]');
          const pasteButton = document.querySelector('[data-testid="settings-parse-provider-config-button"]');
          const presets = document.querySelector('[data-testid="settings-provider-presets"]');
          const discover = Array.from(document.querySelectorAll("button")).find((button) => (button.innerText || "").includes("获取账号模型"));
          const keyInputs = Array.from(document.querySelectorAll('input[type="password"]'));
          const manualFormText = document.querySelector('[data-testid="settings-provider-manual-form"]')?.innerText || "";
          const currentProviderStatus = document.querySelector('[data-testid="settings-current-provider-status"]')?.innerText.replace(/\s+/g, " ").trim() || "";
          const discoveryPanel = document.querySelector('[data-testid="settings-model-discovery"]');
          if (panel && quickstart && apiUrl && apiKey && modelId && modelName && provider && save && discover && pasteParser && pasteInput && pasteButton) {
            const panelRect = panel.getBoundingClientRect();
            const panelStyle = getComputedStyle(panel);
            const panelStyleSnapshot = {
              backgroundColor: panelStyle.getPropertyValue("background-color"),
              borderRadius: panelStyle.getPropertyValue("border-radius"),
              color: panelStyle.getPropertyValue("color"),
            };
            const presetsDefaultClosed = presets instanceof HTMLDetailsElement ? !presets.open : false;
            const presetsSummaryText = presets?.querySelector("summary")?.innerText.replace(/\\s+/g, " ").trim() || "";
            setNativeValue(pasteInput, JSON.stringify({
              baseURL: "  http://127.0.0.1:${mockProviderPort}/v1/  ",
              apiKey: "  sk-browser-smoke-key  ",
              provider: "openai-compatible",
              model: "paste-parser-preflight-model",
              name: "Paste Parser Preflight",
            }));
            window.__zhimengPasteParserMessage = "";
            window.__zhimengPasteParserDraft = {};
            setTimeout(() => {
              pasteButton.click();
              setTimeout(() => {
                window.__zhimengPasteParserMessage = document.querySelector('[data-testid="settings-provider-config-paste-message"]')?.innerText.replace(/\\s+/g, " ").trim() || "";
                window.__zhimengPasteParserDraft = {
                  apiUrl: apiUrl.value,
                  apiKey: apiKey.value,
                  modelId: modelId.value,
                  modelName: modelName.value,
                  provider: provider.value,
                };
                discover.click();
              }, 180);
            }, 100);
            const waitDiscovered = () => {
              const text = document.body.innerText;
              const draftButton = Array.from(document.querySelectorAll("button")).find((button) => (button.innerText || "").includes("填入草稿"));
              if (text.includes("smoke-model") && draftButton) {
                draftButton.click();
                setTimeout(() => {
                  window.__zhimengDiscoveredDraftStatus = document.body.innerText.includes("草稿已选，保存 API 配置后首页生效");
                  setNativeValue(modelName, "Browser Smoke Model");
                  save.click();
                }, 80);
                return;
              }
              if (Date.now() - startedAt > 12000) {
                setNativeValue(modelId, "smoke-model");
                setNativeValue(modelName, "Browser Smoke Model");
                save.click();
                return;
              }
              setTimeout(waitDiscovered, 120);
            };
            waitDiscovered();
            const waitSaved = () => {
              const storage = JSON.parse(localStorage.getItem("novelsmith-api-settings") || "{}");
              const modelPill = document.querySelector('[data-testid="composer-model-pill"]');
              const status = document.querySelector('[data-testid="composer-send-mode-status"]');
              const modelPillText = (modelPill?.textContent || modelPill?.innerText || "").replace(/\s+/g, " ").trim();
              const compactModelPillText = modelPillText.replace(/\s+/g, "");
              const bodyText = document.body.innerText;
              const modelPillReady = compactModelPillText.includes("BrowserSmokeModel")
                || modelPillText.includes("smoke-model")
                || (bodyText.includes("Browser Smoke Model") && !modelPillText.includes("正在检测模型") && !modelPillText.includes("需要配置模型"));
              if (!document.querySelector('[data-testid="settings-modal-panel"]') && storage.modelId === "smoke-model" && modelPillReady) {
                resolve({
                  ok: true,
                  storage: {
                    apiUrl: storage.apiUrl,
                    apiKey: storage.apiKey,
                    modelId: storage.modelId,
                    modelName: storage.modelName,
                    provider: storage.provider,
                  },
                  modelPillText,
                  statusText: status?.innerText.replace(/\\s+/g, " ").trim() || "",
                  bodyText,
                  keyInputCount: keyInputs.length,
                  manualFormText,
                  currentProviderStatus,
                  discoveredDraftStatus: Boolean(window.__zhimengDiscoveredDraftStatus),
                  hasDiscoveryPanel: Boolean(discoveryPanel),
                  hasPasteParser: Boolean(pasteParser),
                  pasteParserMessage: window.__zhimengPasteParserMessage || "",
                  pasteParserDraft: window.__zhimengPasteParserDraft || {},
                  usedQuickSave: save?.getAttribute("data-testid") === "settings-quick-save-button",
                  presetsDefaultClosed,
                  presetsSummaryText,
                  panelRect: {
                    width: Math.round(panelRect.width),
                    height: Math.round(panelRect.height),
                    top: Math.round(panelRect.top),
                  },
                  panelStyle: panelStyleSnapshot,
                });
                return;
              }
              if (Date.now() - startedAt > 12000) {
                resolve({
                  ok: false,
                  reason: "settings did not save or model pill did not refresh",
                  storage,
                  modalStillOpen: Boolean(document.querySelector('[data-testid="settings-modal-panel"]')),
                  modelPillText,
                  text: bodyText,
                  html: document.documentElement.outerHTML,
                });
                return;
              }
              setTimeout(waitSaved, 100);
            };
            waitSaved();
            return;
          }
          if (Date.now() - startedAt > 8000) {
            resolve({
              ok: false,
              reason: "custom provider settings form did not appear",
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
  const customProviderSettings = customProviderSettingsResult.result?.value || {};
  assert(customProviderSettings.ok, `Custom Provider settings could not be filled and saved: ${JSON.stringify(customProviderSettings).slice(0, 2000)}`);
  assert(customProviderSettings.storage?.apiUrl === `http://127.0.0.1:${mockProviderPort}/v1`, `custom Provider API URL did not persist trimmed URL: ${JSON.stringify(customProviderSettings)}`);
  assert(customProviderSettings.storage?.apiKey === "sk-browser-smoke-key", `custom Provider API key did not persist in local settings: ${JSON.stringify(customProviderSettings)}`);
  assert(customProviderSettings.storage?.modelId === "smoke-model", `custom Provider model ID did not persist: ${JSON.stringify(customProviderSettings)}`);
  assert(customProviderSettings.storage?.provider === "openai-compatible", `custom Provider type did not persist: ${JSON.stringify(customProviderSettings)}`);
  assert(customProviderSettings.keyInputCount === 1, `settings modal should expose one API key entry, not duplicate manual forms: ${JSON.stringify(customProviderSettings)}`);
  assert(customProviderSettings.usedQuickSave === true, `settings modal should save from the custom API quickstart area: ${JSON.stringify(customProviderSettings)}`);
  assert(customProviderSettings.panelRect?.width <= 760, `settings modal should stay a lightweight desktop panel, not a fullscreen surface: ${JSON.stringify(customProviderSettings.panelRect)}`);
  assert(customProviderSettings.panelRect?.top >= 40, `settings modal should open as a floating panel with page context visible: ${JSON.stringify(customProviderSettings.panelRect)}`);
  assert(String(customProviderSettings.panelStyle?.backgroundColor).includes("255, 255, 255"), `settings modal should render as a light Codex-style panel: ${JSON.stringify(customProviderSettings.panelStyle)}`);
  assert(Number.parseFloat(String(customProviderSettings.panelStyle?.borderRadius || "0")) <= 14, `settings modal radius should stay restrained: ${JSON.stringify(customProviderSettings.panelStyle)}`);
  assert(String(customProviderSettings.manualFormText).includes("要修改接口、key 或模型 ID，请使用最上方"), `manual settings section should point back to the single custom API entry: ${JSON.stringify(customProviderSettings)}`);
  assert(String(customProviderSettings.currentProviderStatus).includes("当前首页正在使用"), `settings modal should show active Provider status: ${JSON.stringify(customProviderSettings)}`);
  assert(customProviderSettings.hasPasteParser === true, `settings modal should expose paste-to-config parser: ${JSON.stringify(customProviderSettings)}`);
  assert(String(customProviderSettings.pasteParserMessage || "").includes("已解析并填入草稿"), `paste parser should confirm draft-only parsing: ${JSON.stringify(customProviderSettings)}`);
  assert(customProviderSettings.pasteParserDraft?.apiUrl === `http://127.0.0.1:${mockProviderPort}/v1`, `paste parser should fill trimmed API URL into the draft: ${JSON.stringify(customProviderSettings)}`);
  assert(customProviderSettings.pasteParserDraft?.apiKey === "sk-browser-smoke-key", `paste parser should fill trimmed API key into the draft: ${JSON.stringify(customProviderSettings)}`);
  assert(customProviderSettings.pasteParserDraft?.modelId === "paste-parser-preflight-model", `paste parser should fill model ID into the draft before /models selection: ${JSON.stringify(customProviderSettings)}`);
  assert(customProviderSettings.pasteParserDraft?.provider === "openai-compatible", `paste parser should fill provider into the draft: ${JSON.stringify(customProviderSettings)}`);
  assert(customProviderSettings.discoveredDraftStatus === true, `settings modal should support selecting a discovered model as a draft before saving: ${JSON.stringify(customProviderSettings)}`);
  assert(customProviderSettings.hasDiscoveryPanel === true, `settings modal should keep model discovery next to custom API config: ${JSON.stringify(customProviderSettings)}`);
  assert(customProviderSettings.presetsDefaultClosed === true, `provider endpoint templates should stay secondary/collapsed by default: ${JSON.stringify(customProviderSettings)}`);
  assert(String(customProviderSettings.presetsSummaryText).includes("不是模型清单"), `provider endpoint templates should not read like stale model choices: ${JSON.stringify(customProviderSettings)}`);
  assert(
    String(customProviderSettings.modelPillText).replace(/\s+/g, "").includes("BrowserSmokeModel")
      || String(customProviderSettings.modelPillText).includes("smoke-model")
      || String(customProviderSettings.bodyText).includes("Browser Smoke Model"),
    `composer model pill did not reflect saved custom Provider: ${JSON.stringify(customProviderSettings)}`,
  );
  const directChatResult = await evaluateWithRetry(devtools, {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      new Promise((resolve) => {
        const composer = document.querySelector('[data-testid="agent-thread-composer"]');
        const send = document.querySelector('[data-testid="agent-send-button"]');
        if (!composer || !send) {
          resolve({ ok: false, reason: "missing composer or send button", html: document.documentElement.outerHTML });
          return;
        }
        const proto = Object.getPrototypeOf(composer);
        const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
        descriptor?.set?.call(composer, "请回复浏览器模型配置冒烟。");
        composer.dispatchEvent(new Event("input", { bubbles: true }));
        composer.dispatchEvent(new Event("change", { bubbles: true }));
        setTimeout(() => {
          document.querySelector('[data-testid="agent-send-button"]')?.click();
          const startedAt = Date.now();
          const tick = () => {
            const text = document.body.innerText;
            const modelPill = document.querySelector('[data-testid="composer-model-pill"]');
            if (text.includes("浏览器模型配置冒烟成功。")) {
              resolve({
                ok: true,
                bodyText: text,
                modelPillText: (modelPill?.textContent || modelPill?.innerText || "").replace(/\\s+/g, " ").trim(),
              });
              return;
            }
            if (Date.now() - startedAt > 20000) {
              resolve({
                ok: false,
                reason: "AI reply did not appear",
                bodyText: text,
                html: document.documentElement.outerHTML,
              });
              return;
            }
            setTimeout(tick, 150);
          };
          tick();
        }, 100);
      })
    `,
  });
  const directChat = directChatResult.result?.value || {};
  assert(directChat.ok, `Custom Provider saved in browser but direct chat did not return a reply: ${JSON.stringify(directChat).slice(0, 2000)}`);
  assert(String(directChat.modelPillText).replace(/\s+/g, "").includes("BrowserSmokeModel") || String(directChat.modelPillText).includes("smoke-model"), `direct chat model pill drifted: ${JSON.stringify(directChat)}`);
  const lastChat = await waitForJson(`http://127.0.0.1:${mockProviderPort}/__last-chat`);
  assert(lastChat.model === "smoke-model", `mock Provider did not receive saved model id: ${JSON.stringify(lastChat)}`);
  assert(lastChat.authorization === "[present]", `mock Provider did not receive Authorization header: ${JSON.stringify(lastChat)}`);
  assert(String(lastChat.text || "").includes("请回复浏览器模型配置冒烟。"), `mock Provider did not receive browser composer text: ${JSON.stringify(lastChat).slice(0, 2000)}`);
  await evaluateWithRetry(devtools, {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      (() => {
        const settings = JSON.parse(localStorage.getItem("novelsmith-api-settings") || "{}");
        settings.modelId = "auth-fail-model";
        settings.modelName = "Auth Failure Smoke Model";
        settings.provider = "openai-compatible";
        localStorage.setItem("novelsmith-api-settings", JSON.stringify(settings));
        location.reload();
        return true;
      })()
    `,
  });
  const authFailLoadedResult = await evaluateWithRetry(devtools, {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      new Promise((resolve) => {
        const startedAt = Date.now();
        const tick = () => {
          const settings = JSON.parse(localStorage.getItem("novelsmith-api-settings") || "{}");
          const modelPill = document.querySelector('[data-testid="composer-model-pill"]');
          const title = modelPill?.getAttribute("title") || "";
          const text = modelPill?.innerText || "";
          const home = document.querySelector('[data-testid="agent-home-focused"]');
          if (home && settings.modelId === "auth-fail-model" && (title.includes("Auth Failure Smoke Model") || title.includes("auth-fail-model") || text.includes("Auth Failure Smoke Model") || text.includes("auth-fail-model"))) {
            resolve({ ok: true, title, text, settings });
            return;
          }
          if (Date.now() - startedAt > 10000) {
            resolve({ ok: false, title, text, settings, bodyText: document.body.innerText });
            return;
          }
          setTimeout(tick, 120);
        };
        tick();
      })
    `,
  });
  const authFailLoaded = authFailLoadedResult.result?.value || {};
  assert(authFailLoaded.ok, `auth-fail Provider config did not load before failure smoke: ${JSON.stringify(authFailLoaded).slice(0, 2000)}`);
  const failureRecoveryResult = await evaluateWithRetry(devtools, {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      new Promise((resolve) => {
        const startedAt = Date.now();
        const setNativeValue = (element, value) => {
          const proto = Object.getPrototypeOf(element);
          const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
          descriptor?.set?.call(element, value);
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        };
        const sendFailureMessage = () => {
          const composer = document.querySelector('[data-testid="agent-thread-composer"]');
          const send = document.querySelector('[data-testid="agent-send-button"]');
          if (!composer || !send) return false;
          setNativeValue(composer, "请触发浏览器失败恢复按钮。");
          setTimeout(() => document.querySelector('[data-testid="agent-send-button"]')?.click(), 80);
          return true;
        };
        let sent = false;
        const tick = () => {
          const home = document.querySelector('[data-testid="agent-home-focused"]');
          if (home && !sent) sent = sendFailureMessage();
          const bodyText = document.body.innerText;
          const openModel = document.querySelector('[data-testid="message-open-model-settings"]');
          const retry = document.querySelector('[data-testid="message-retry-last"]');
          const composerRetry = document.querySelector('[data-testid="composer-blocker-retry-last"]');
          const composerSettings = document.querySelector('[data-testid="composer-open-model"]');
          const failureText = bodyText.includes("AI 请求失败")
            || bodyText.includes("请求失败：")
            || bodyText.includes("模型请求鉴权失败")
            || bodyText.includes("密钥没有通过认证");
          if (failureText && openModel && retry && composerRetry && composerSettings) {
            resolve({
              ok: true,
              bodyText,
              openModelText: openModel.innerText.replace(/\\s+/g, " ").trim(),
              retryText: retry.innerText.replace(/\\s+/g, " ").trim(),
              composerActionsText: document.querySelector('[data-testid="composer-send-mode-status"]')?.innerText.replace(/\\s+/g, " ").trim() || "",
            });
            return;
          }
          if (Date.now() - startedAt > 22000) {
            resolve({
              ok: false,
              sent,
              bodyText,
              hasOpenModel: Boolean(openModel),
              hasRetry: Boolean(retry),
              hasComposerRetry: Boolean(composerRetry),
              hasComposerSettings: Boolean(composerSettings),
              html: document.documentElement.outerHTML,
            });
            return;
          }
          setTimeout(tick, 150);
        };
        tick();
      })
    `,
  });
  const failureRecovery = failureRecoveryResult.result?.value || {};
  assert(failureRecovery.ok, `browser chat failure did not expose model settings and retry actions: ${JSON.stringify(failureRecovery).slice(0, 2000)}`);
  assert(/模型中心|模型设置/.test(String(failureRecovery.openModelText || "")), `failure message model settings action should be labeled: ${JSON.stringify(failureRecovery)}`);
  assert(String(failureRecovery.retryText || "").includes("重试"), `failure message retry action should be labeled: ${JSON.stringify(failureRecovery)}`);
  assert(
    String(failureRecovery.bodyText || "").includes("密钥没有通过认证")
    || String(failureRecovery.bodyText || "").includes("模型请求鉴权失败")
    || String(failureRecovery.bodyText || "").includes("API key"),
    `401 failure should explain the API key/auth problem in user-facing Chinese: ${JSON.stringify(failureRecovery).slice(0, 2000)}`,
  );
  assert(
    String(failureRecovery.bodyText || "").includes("下一步")
    || String(failureRecovery.bodyText || "").includes("保存后点“重试”")
    || String(failureRecovery.bodyText || "").includes("重试上一条消息"),
    `failure message should give a clear next step: ${JSON.stringify(failureRecovery).slice(0, 2000)}`,
  );
  assert(/模型中心|模型设置|设置/.test(String(failureRecovery.composerActionsText || "")) && String(failureRecovery.composerActionsText || "").includes("重试"), `composer blocker should expose text recovery actions: ${JSON.stringify(failureRecovery)}`);
  await evaluateWithRetry(devtools, {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      (() => {
        const settings = JSON.parse(localStorage.getItem("novelsmith-api-settings") || "{}");
        settings.modelId = "smoke-model";
        settings.modelName = "Browser Smoke Model";
        settings.provider = "openai-compatible";
        localStorage.setItem("novelsmith-api-settings", JSON.stringify(settings));
        location.reload();
        return true;
      })()
    `,
  });
  const smokeModelReloadResult = await evaluateWithRetry(devtools, {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      new Promise((resolve) => {
        const startedAt = Date.now();
        const tick = () => {
          const settings = JSON.parse(localStorage.getItem("novelsmith-api-settings") || "{}");
          const modelPill = document.querySelector('[data-testid="composer-model-pill"]');
          const title = modelPill?.getAttribute("title") || "";
          const text = modelPill?.innerText || "";
          const home = document.querySelector('[data-testid="agent-home-focused"]');
          const ready = home
            && settings.modelId === "smoke-model"
            && (title.includes("Browser Smoke Model") || title.includes("smoke-model") || text.includes("Browser Smoke Model") || text.includes("smoke-model"));
          if (ready) {
            resolve({ ok: true, title, text, settings });
            return;
          }
          if (Date.now() - startedAt > 12000) {
            resolve({ ok: false, title, text, settings, bodyText: document.body.innerText });
            return;
          }
          setTimeout(tick, 120);
        };
        tick();
      })
    `,
  });
  const smokeModelReload = smokeModelReloadResult.result?.value || {};
  assert(smokeModelReload.ok, `smoke Provider config did not reload before attachment smoke: ${JSON.stringify(smokeModelReload).slice(0, 2000)}`);
  const attachmentReceiptResult = await evaluateWithRetry(devtools, {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      new Promise((resolve) => {
        const input = document.querySelector('[data-testid="agent-home-composer-attachment-input"]');
        if (!input) {
          resolve({ ok: false, reason: "missing attachment input", html: document.documentElement.outerHTML });
          return;
        }
        try {
          const file = new File(["Phase2 browser attachment receipt preview: 文件片段进入模型请求。"], "phase2-receipt.txt", { type: "text/plain" });
          const transfer = new DataTransfer();
          transfer.items.add(file);
          Object.defineProperty(input, "files", { value: transfer.files, configurable: true });
          input.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (error) {
          resolve({ ok: false, reason: String(error && error.message || error), html: document.documentElement.outerHTML });
          return;
        }
        const startedAt = Date.now();
        const tick = () => {
          const receipt = document.querySelector('[data-testid="agent-home-composer-attachment-receipt"]');
          const card = document.querySelector('[data-testid="agent-home-composer-attachment-card"]');
          if (receipt && card) {
            resolve({
              ok: true,
              receiptText: receipt.innerText.replace(/\\s+/g, " ").trim(),
              cardText: card.innerText.replace(/\\s+/g, " ").trim(),
              hasModelPayload: receipt.getAttribute("data-has-model-payload"),
              imageCount: receipt.getAttribute("data-image-count"),
              parsedFileCount: receipt.getAttribute("data-parsed-file-count"),
              metadataFileCount: receipt.getAttribute("data-metadata-file-count"),
              failedFileCount: receipt.getAttribute("data-failed-file-count"),
              status: receipt.getAttribute("data-status"),
              rejectedFromModel: receipt.getAttribute("data-rejected-from-model"),
              cardKind: card.getAttribute("data-attachment-kind"),
              cardParseStatus: card.getAttribute("data-parse-status"),
            });
            return;
          }
          if (Date.now() - startedAt > 8000) {
            resolve({ ok: false, reason: "attachment receipt did not appear", text: document.body.innerText, html: document.documentElement.outerHTML });
            return;
          }
          setTimeout(tick, 100);
        };
        tick();
      })
    `,
  });
  const attachmentReceipt = attachmentReceiptResult.result?.value || {};
  assert(attachmentReceipt.ok, `Agent Home attachment receipt did not render after upload: ${JSON.stringify(attachmentReceipt).slice(0, 2000)}`);
  assert(attachmentReceipt.hasModelPayload === "true", `attachment receipt should expose model payload: ${JSON.stringify(attachmentReceipt)}`);
  assert(attachmentReceipt.imageCount === "0", `text attachment should expose zero image count: ${JSON.stringify(attachmentReceipt)}`);
  assert(attachmentReceipt.parsedFileCount === "1", `text attachment should expose parsed file count: ${JSON.stringify(attachmentReceipt)}`);
  assert(attachmentReceipt.metadataFileCount === "0", `text attachment should expose zero metadata file count: ${JSON.stringify(attachmentReceipt)}`);
  assert(attachmentReceipt.failedFileCount === "0", `text attachment should expose zero failed file count: ${JSON.stringify(attachmentReceipt)}`);
  assert(attachmentReceipt.status === "进入模型请求", `attachment receipt should state model request delivery: ${JSON.stringify(attachmentReceipt)}`);
  assert(attachmentReceipt.rejectedFromModel === "false", `accepted text attachment should not be marked rejected: ${JSON.stringify(attachmentReceipt)}`);
  assert(attachmentReceipt.cardKind === "file", `attachment card should expose file kind: ${JSON.stringify(attachmentReceipt)}`);
  assert(attachmentReceipt.cardParseStatus === "parsed", `attachment card should expose parsed status: ${JSON.stringify(attachmentReceipt)}`);
  assert(String(attachmentReceipt.receiptText).includes("附件回执"), "attachment receipt text should include label");
  assert(String(attachmentReceipt.cardText).includes("文本片段"), "attachment card text should include parsed text delivery");
  const imageAttachmentReceiptResult = await evaluateWithRetry(devtools, {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      new Promise((resolve) => {
        const input = document.querySelector('[data-testid="agent-home-composer-attachment-input"]');
        if (!input) {
          resolve({ ok: false, reason: "missing attachment input", html: document.documentElement.outerHTML });
          return;
        }
        try {
          const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
          const file = new File([imageBytes], "phase2-image.png", { type: "image/png" });
          const transfer = new DataTransfer();
          transfer.items.add(file);
          Object.defineProperty(input, "files", { value: transfer.files, configurable: true });
          input.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (error) {
          resolve({ ok: false, reason: String(error && error.message || error), html: document.documentElement.outerHTML });
          return;
        }
        const startedAt = Date.now();
        const tick = () => {
          const receipt = document.querySelector('[data-testid="agent-home-composer-attachment-receipt"]');
          const cards = Array.from(document.querySelectorAll('[data-testid="agent-home-composer-attachment-card"]'));
          const imageCard = cards.find((card) => card.getAttribute("data-attachment-kind") === "image");
          const fallbackVisible = Boolean(imageCard?.querySelector(".codex-attachment-thumb-fallback:not([hidden])"));
          if (receipt && imageCard && receipt.getAttribute("data-image-count") === "1" && fallbackVisible) {
            resolve({
              ok: true,
              receiptText: receipt.innerText.replace(/\\s+/g, " ").trim(),
              imageCardText: imageCard.innerText.replace(/\\s+/g, " ").trim(),
              fallbackVisible,
              hasModelPayload: receipt.getAttribute("data-has-model-payload"),
              imageCount: receipt.getAttribute("data-image-count"),
              parsedFileCount: receipt.getAttribute("data-parsed-file-count"),
              metadataFileCount: receipt.getAttribute("data-metadata-file-count"),
              failedFileCount: receipt.getAttribute("data-failed-file-count"),
              status: receipt.getAttribute("data-status"),
              rejectedFromModel: receipt.getAttribute("data-rejected-from-model"),
              cardCount: String(cards.length),
              imageCardParseStatus: imageCard.getAttribute("data-parse-status"),
            });
            return;
          }
          if (Date.now() - startedAt > 8000) {
            resolve({
              ok: false,
              reason: "image attachment receipt did not appear",
              receiptText: receipt?.innerText || "",
              imageCount: receipt?.getAttribute("data-image-count") || "",
              fallbackVisible,
              cardCount: String(cards.length),
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
  const imageAttachmentReceipt = imageAttachmentReceiptResult.result?.value || {};
  assert(imageAttachmentReceipt.ok, `Agent Home image attachment receipt did not render after upload: ${JSON.stringify(imageAttachmentReceipt).slice(0, 2000)}`);
  assert(imageAttachmentReceipt.hasModelPayload === "true", `image attachment receipt should expose model payload: ${JSON.stringify(imageAttachmentReceipt)}`);
  assert(imageAttachmentReceipt.imageCount === "1", `image attachment receipt should expose image count: ${JSON.stringify(imageAttachmentReceipt)}`);
  assert(imageAttachmentReceipt.parsedFileCount === "1", `image upload should preserve previous parsed text file count: ${JSON.stringify(imageAttachmentReceipt)}`);
  assert(imageAttachmentReceipt.metadataFileCount === "0", `image upload should expose zero metadata file count: ${JSON.stringify(imageAttachmentReceipt)}`);
  assert(imageAttachmentReceipt.failedFileCount === "0", `image upload should expose zero failed file count: ${JSON.stringify(imageAttachmentReceipt)}`);
  assert(imageAttachmentReceipt.status === "进入模型请求", `image attachment receipt should state model request delivery: ${JSON.stringify(imageAttachmentReceipt)}`);
  assert(imageAttachmentReceipt.rejectedFromModel === "false", `accepted image attachment should not be marked rejected: ${JSON.stringify(imageAttachmentReceipt)}`);
  assert(imageAttachmentReceipt.cardCount === "2", `text + image upload should render two attachment cards: ${JSON.stringify(imageAttachmentReceipt)}`);
  assert(imageAttachmentReceipt.imageCardParseStatus === "parsed", `image attachment card should expose parsed status: ${JSON.stringify(imageAttachmentReceipt)}`);
  assert(imageAttachmentReceipt.fallbackVisible === true, `invalid image upload should show a clean thumbnail fallback: ${JSON.stringify(imageAttachmentReceipt)}`);
  assert(String(imageAttachmentReceipt.receiptText).includes("1 张图片"), "image attachment receipt should mention one image");
  assert(String(imageAttachmentReceipt.imageCardText).includes("多模态图片"), "image attachment card should include multimodal delivery");
  const attachmentSendResult = await evaluateWithRetry(devtools, {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      new Promise((resolve) => {
        const composer = document.querySelector('[data-testid="agent-thread-composer"]');
        const send = document.querySelector('[data-testid="agent-send-button"]');
        if (!composer || !send) {
          resolve({ ok: false, reason: "missing composer or send button", html: document.documentElement.outerHTML });
          return;
        }
        const proto = Object.getPrototypeOf(composer);
        const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
        descriptor?.set?.call(composer, "请确认你收到了这次首页上传的文件和图片。");
        composer.dispatchEvent(new Event("input", { bubbles: true }));
        composer.dispatchEvent(new Event("change", { bubbles: true }));
        setTimeout(() => {
          document.querySelector('[data-testid="agent-send-button"]')?.click();
          const startedAt = Date.now();
          const tick = () => {
            const text = document.body.innerText;
            const messageFallbackVisible = Boolean(document.querySelector(".codex-message-attachment .codex-attachment-image-fallback:not([hidden])"));
            if (
              text.includes("请确认你收到了这次首页上传的文件和图片。")
              && text.includes("浏览器模型配置冒烟成功。")
              && messageFallbackVisible
            ) {
              resolve({ ok: true, bodyText: text, messageFallbackVisible });
              return;
            }
            if (Date.now() - startedAt > 20000) {
              resolve({ ok: false, reason: "attachment chat reply did not appear", bodyText: text, messageFallbackVisible, html: document.documentElement.outerHTML });
              return;
            }
            setTimeout(tick, 150);
          };
          tick();
        }, 100);
      })
    `,
  });
  const attachmentSend = attachmentSendResult.result?.value || {};
  assert(attachmentSend.ok, `Agent Home did not send text+image attachments through chat: ${JSON.stringify(attachmentSend).slice(0, 2000)}`);
  assert(String(attachmentSend.bodyText || "").includes("图片预览不可用"), `sent invalid image should render a clean message fallback: ${JSON.stringify(attachmentSend).slice(0, 2000)}`);
  const attachmentLastChat = await (async () => {
    const startedAt = Date.now();
    let last = {};
    while (Date.now() - startedAt < 20000) {
      last = await waitForJson(`http://127.0.0.1:${mockProviderPort}/__last-chat`);
      if (
        last.model === "smoke-model"
        && String(last.text || "").includes("请确认你收到了这次首页上传的文件和图片。")
        && Number(last.imagePartCount || 0) >= 1
      ) {
        return last;
      }
      await delay(200);
    }
    return last;
  })();
  assert(attachmentLastChat.model === "smoke-model", `attachment chat should use saved model id: ${JSON.stringify(attachmentLastChat)}`);
  assert(attachmentLastChat.authorization === "[present]", `attachment chat should send Authorization header: ${JSON.stringify(attachmentLastChat)}`);
  assert(Number(attachmentLastChat.imagePartCount || 0) >= 1, `attachment chat should include image_url part for multimodal input: ${JSON.stringify(attachmentLastChat).slice(0, 2000)}`);
  assert(String(attachmentLastChat.text || "").includes("phase2-receipt.txt"), `attachment chat should include text attachment filename: ${JSON.stringify(attachmentLastChat).slice(0, 2000)}`);
  assert(String(attachmentLastChat.text || "").includes("文件片段进入模型请求"), `attachment chat should include parsed text attachment preview: ${JSON.stringify(attachmentLastChat).slice(0, 2000)}`);
  assert(Array.isArray(attachmentLastChat.imageUrls) && attachmentLastChat.imageUrls.some((url) => String(url).startsWith("data:image/png;base64,")), `attachment chat should include image data URL: ${JSON.stringify(attachmentLastChat).slice(0, 2000)}`);
  const metadataAttachmentReceiptResult = await evaluateWithRetry(devtools, {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      new Promise((resolve) => {
        document.querySelector('[data-testid="composer-clear-attachments"]')?.click();
        const input = document.querySelector('[data-testid="agent-home-composer-attachment-input"]');
        if (!input) {
          resolve({ ok: false, reason: "missing attachment input", html: document.documentElement.outerHTML });
          return;
        }
        try {
          const file = new File([new Uint8Array([1, 2, 3, 4, 5])], "metadata-only.bin", { type: "application/octet-stream" });
          const transfer = new DataTransfer();
          transfer.items.add(file);
          Object.defineProperty(input, "files", { value: transfer.files, configurable: true });
          input.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (error) {
          resolve({ ok: false, reason: String(error && error.message || error), html: document.documentElement.outerHTML });
          return;
        }
        const startedAt = Date.now();
        const tick = () => {
          const receipt = document.querySelector('[data-testid="agent-home-composer-attachment-receipt"]');
          const card = document.querySelector('[data-testid="agent-home-composer-attachment-card"]');
          if (receipt && card && card.getAttribute("data-attachment-kind") === "file") {
            resolve({
              ok: true,
              receiptText: receipt.innerText.replace(/\\s+/g, " ").trim(),
              cardText: card.innerText.replace(/\\s+/g, " ").trim(),
              hasModelPayload: receipt.getAttribute("data-has-model-payload"),
              imageCount: receipt.getAttribute("data-image-count"),
              parsedFileCount: receipt.getAttribute("data-parsed-file-count"),
              metadataFileCount: receipt.getAttribute("data-metadata-file-count"),
              failedFileCount: receipt.getAttribute("data-failed-file-count"),
              status: receipt.getAttribute("data-status"),
              rejectedFromModel: receipt.getAttribute("data-rejected-from-model"),
              cardParseStatus: card.getAttribute("data-parse-status"),
            });
            return;
          }
          if (Date.now() - startedAt > 8000) {
            resolve({ ok: false, reason: "metadata attachment receipt did not appear", text: document.body.innerText, html: document.documentElement.outerHTML });
            return;
          }
          setTimeout(tick, 100);
        };
        tick();
      })
    `,
  });
  const metadataAttachmentReceipt = metadataAttachmentReceiptResult.result?.value || {};
  assert(metadataAttachmentReceipt.ok, `Agent Home metadata attachment receipt did not render after upload: ${JSON.stringify(metadataAttachmentReceipt).slice(0, 2000)}`);
  assert(metadataAttachmentReceipt.hasModelPayload === "false", `metadata-only attachment should not expose model payload: ${JSON.stringify(metadataAttachmentReceipt)}`);
  assert(metadataAttachmentReceipt.imageCount === "0", `metadata-only attachment should expose zero image count: ${JSON.stringify(metadataAttachmentReceipt)}`);
  assert(metadataAttachmentReceipt.parsedFileCount === "0", `metadata-only attachment should expose zero parsed file count: ${JSON.stringify(metadataAttachmentReceipt)}`);
  assert(metadataAttachmentReceipt.metadataFileCount === "1", `metadata-only attachment should expose metadata file count: ${JSON.stringify(metadataAttachmentReceipt)}`);
  assert(metadataAttachmentReceipt.failedFileCount === "0", `metadata-only attachment should expose zero failed file count: ${JSON.stringify(metadataAttachmentReceipt)}`);
  assert(metadataAttachmentReceipt.status === "仅摘要/元数据", `metadata-only attachment must not claim model request delivery: ${JSON.stringify(metadataAttachmentReceipt)}`);
  assert(metadataAttachmentReceipt.rejectedFromModel === "false", `metadata-only attachment should not be oversized rejected: ${JSON.stringify(metadataAttachmentReceipt)}`);
  assert(metadataAttachmentReceipt.cardParseStatus === "metadata", `metadata attachment card should expose metadata status: ${JSON.stringify(metadataAttachmentReceipt)}`);
  const projectFilesRailResult = await evaluateWithRetry(devtools, {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      new Promise((resolve) => {
        const button = document.querySelector('[data-testid="agent-home-side-tab-files"]');
        if (!button) {
          resolve({ ok: false, reason: "missing files tab", html: document.documentElement.outerHTML });
          return;
        }
        button.click();
        const startedAt = Date.now();
        const targetRoot = "C:\\\\ZhimengBrowserSmoke\\\\ProjectA";
        const setNativeValue = (element, value) => {
          const proto = Object.getPrototypeOf(element);
          const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
          descriptor?.set?.call(element, value);
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        };
        let rootSaved = false;
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
          const workflow = document.querySelector('[data-testid="home-files-workflow"]') || Array.from(document.querySelectorAll("*")).find((node) => (node.innerText || "").includes("项目文件工作流"));
          const rootInput = document.querySelector('[data-testid="home-workspace-root-input"]');
          const rootSave = document.querySelector('[data-testid="home-workspace-root-save"]');
          const rootScan = document.querySelector('[data-testid="home-workspace-root-scan"]');
          const preview = document.querySelector('[data-testid="home-index-preview-file"]');
          const attachFile = document.querySelector('[data-testid="home-index-attach-file"]');
          const previewDiff = document.querySelector('[data-testid="home-index-preview-diff"]');
          const attachIndex = document.querySelector('[data-testid="home-index-attach-index"]');
          const sideText = side?.innerText.replace(/\\s+/g, " ").trim() || "";
          if (side?.getAttribute('data-panel-state') === 'open' && workflow && rootInput && rootSave && rootScan && preview && attachFile && previewDiff && attachIndex) {
            if (!rootSaved) {
              setNativeValue(rootInput, targetRoot);
              setTimeout(() => rootSave.click(), 80);
              rootSaved = true;
            }
            const profiles = JSON.parse(localStorage.getItem("zhimeng-workspace-root-profiles") || "[]");
            const savedProfile = Array.isArray(profiles) ? profiles.find((item) => item && item.rootPath === targetRoot) : null;
            const updatedSideText = side.innerText.replace(/\\s+/g, " ").trim();
            if (savedProfile && updatedSideText.includes(targetRoot)) {
              resolve({
                ok: true,
                sideState: side.getAttribute('data-panel-state'),
                sideText: updatedSideText,
                savedProfile: {
                  workspaceId: savedProfile.workspaceId,
                  rootPath: savedProfile.rootPath,
                  accessMode: savedProfile.accessMode,
                },
                layout: {
                  side: rectOf(side),
                  workflow: rectOf(workflow),
                },
                actions: {
                  rootSaveDisabled: rootSave.disabled,
                  rootScanDisabled: rootScan.disabled,
                  previewDisabled: preview.disabled,
                  attachFileDisabled: attachFile.disabled,
                  previewDiffDisabled: previewDiff.disabled,
                  attachIndexDisabled: attachIndex.disabled,
                },
              });
              return;
            }
          }
          if (Date.now() - startedAt > 8000) {
            const profiles = JSON.parse(localStorage.getItem("zhimeng-workspace-root-profiles") || "[]");
            resolve({
              ok: false,
              reason: "project files rail did not expose workflow or persist root binding",
              sideState: side?.getAttribute('data-panel-state') || "",
              profiles,
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
  const projectFilesRail = projectFilesRailResult.result?.value || {};
  assert(projectFilesRail.ok, `Agent Home files rail did not expose project workflow: ${JSON.stringify(projectFilesRail).slice(0, 2000)}`);
  assert(projectFilesRail.sideState === "open", `files rail should open the right sidebar: ${JSON.stringify(projectFilesRail)}`);
  assert(String(projectFilesRail.sideText || "").includes("项目文件工作流"), `files rail should name the project file workflow: ${JSON.stringify(projectFilesRail).slice(0, 2000)}`);
  assert(String(projectFilesRail.sideText || "").includes("绑定目录") && String(projectFilesRail.sideText || "").includes("当前"), `files rail should expose the current project workflow step: ${JSON.stringify(projectFilesRail).slice(0, 2000)}`);
  assert(String(projectFilesRail.sideText || "").includes("绑定") && String(projectFilesRail.sideText || "").includes("扫描"), `files rail should guide binding and scanning: ${JSON.stringify(projectFilesRail).slice(0, 2000)}`);
  assert(String(projectFilesRail.sideText || "").includes("预览正文") && String(projectFilesRail.sideText || "").includes("生成 Diff"), `files rail should guide preview and Diff: ${JSON.stringify(projectFilesRail).slice(0, 2000)}`);
  assert(projectFilesRail.savedProfile?.rootPath === "C:\\ZhimengBrowserSmoke\\ProjectA", `files rail should persist the bound project root: ${JSON.stringify(projectFilesRail).slice(0, 2000)}`);
  assert(projectFilesRail.savedProfile?.accessMode === "read_only", `first project root binding should upgrade to read_only: ${JSON.stringify(projectFilesRail).slice(0, 2000)}`);
  assert(String(projectFilesRail.sideText || "").includes("C:\\ZhimengBrowserSmoke\\ProjectA"), `files rail should reflect saved project root path: ${JSON.stringify(projectFilesRail).slice(0, 2000)}`);
  assert(projectFilesRail.layout?.side?.width > 300, `files rail should expand to a usable project panel: ${JSON.stringify(projectFilesRail.layout)}`);
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
          const nextStep = document.querySelector('[data-testid="agent-home-side-next-step"]');
          const primaryAction = document.querySelector('[data-testid="agent-home-side-primary-action"]');
          const steps = Array.from(document.querySelectorAll('.codex-toolchain-step'));
          if (side?.getAttribute('data-panel-state') === 'open' && strip && runtimeSummary && runtimeDetails && nextStep && primaryAction && steps.length === 4) {
            resolve({
              ok: true,
              sideState: side.getAttribute('data-panel-state'),
              sideText: side.innerText.replace(/\\s+/g, " ").trim(),
              nextStepText: nextStep.innerText.replace(/\\s+/g, " ").trim(),
              primaryActionText: primaryAction.innerText.replace(/\\s+/g, " ").trim(),
              primaryActionLabel: primaryAction.getAttribute("aria-label") || "",
              runtimeDetailsOpen: runtimeDetails.hasAttribute('open'),
              labels: steps.map((step) => step.innerText.replace(/\\s+/g, " ").trim()),
              layout: {
                side: rectOf(side),
                primaryAction: rectOf(primaryAction),
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
              sideText: side?.innerText.replace(/\\s+/g, " ").trim() || "",
              nextStepText: document.querySelector('[data-testid="agent-home-side-next-step"]')?.innerText.replace(/\\s+/g, " ").trim() || "",
              primaryActionText: document.querySelector('[data-testid="agent-home-side-primary-action"]')?.innerText.replace(/\\s+/g, " ").trim() || "",
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
  assert(String(statusRail.nextStepText || "").includes("当前下一步"), `status rail should expose current next step copy: ${JSON.stringify(statusRail).slice(0, 2000)}`);
  assert(String(statusRail.primaryActionText || "").length > 0, `status rail should expose a visible primary action: ${JSON.stringify(statusRail).slice(0, 2000)}`);
  assert(String(statusRail.primaryActionLabel || "").includes("主动作"), `status rail primary action should expose an accessible label: ${JSON.stringify(statusRail).slice(0, 2000)}`);
  assert(statusRail.runtimeDetailsOpen === false, `runtime log details should be collapsed by default: ${JSON.stringify(statusRail)}`);
  assert(statusRail.layout?.side?.width >= 300, `opened right rail is too narrow for status details: ${JSON.stringify(statusRail.layout)}`);
  assert(statusRail.layout?.primaryAction?.height >= 28 && statusRail.layout.primaryAction.width >= 240, `primary action should be readable in the right rail: ${JSON.stringify(statusRail.layout)}`);
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
  const threadReloadResult = await evaluateWithRetry(devtools, {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      new Promise((resolve) => {
        location.reload();
        const startedAt = Date.now();
        const tick = () => {
          const bodyText = document.body.innerText;
          const cards = Array.from(document.querySelectorAll('[data-testid="agent-home-composer-attachment-card"], .codex-message-attachment'));
          const hasTextAttachment = cards.some((card) => (card.innerText || "").includes("phase2-receipt.txt"));
          const hasImageAttachment = cards.some((card) => (card.innerText || "").includes("phase2-image.png") || card.getAttribute("data-attachment-kind") === "image");
          if (
            bodyText.includes("请确认你收到了这次首页上传的文件和图片。")
            && bodyText.includes("浏览器模型配置冒烟成功。")
            && hasTextAttachment
            && hasImageAttachment
          ) {
            const spaces = JSON.parse(localStorage.getItem("zhimeng-agent-thread-spaces") || "{}");
            resolve({
              ok: true,
              bodyText,
              cardCount: cards.length,
              storageSpaces: Object.keys(spaces.spaces || {}).sort().join(","),
              hasUnboundStorage: Boolean(spaces.spaces?.unbound?.length),
            });
            return;
          }
          if (Date.now() - startedAt > 15000) {
            resolve({
              ok: false,
              bodyText,
              cardCount: cards.length,
              cardsText: cards.map((card) => (card.innerText || "").replace(/\\s+/g, " ").trim()).slice(0, 6),
              storage: localStorage.getItem("zhimeng-agent-thread-spaces"),
              html: document.documentElement.outerHTML,
            });
            return;
          }
          setTimeout(tick, 150);
        };
        tick();
      })
    `,
  });
  const threadReload = threadReloadResult.result?.value || {};
  assert(threadReload.ok, `Agent Home should persist free chat messages and attachments after browser reload: ${JSON.stringify(threadReload).slice(0, 2000)}`);
  assert(String(threadReload.storageSpaces || "").includes("unbound"), `free chat should persist in unbound thread space: ${JSON.stringify(threadReload)}`);
  assert(threadReload.hasUnboundStorage === true, `unbound thread storage should contain at least one thread: ${JSON.stringify(threadReload)}`);
  console.log(`phase2-agent-home-browser ok`);
  console.log(`collapsed screenshot: ${collapsedScreenshotPath}`);
  console.log(`status-open screenshot: ${screenshotPath}`);
} catch (error) {
  throw error;
} finally {
  await closeBrowserByDevtools(devtools);
  devtools?.close();
  await stopBrowserProcess(browserProcess);
  await stopBrowserProcess(mockProviderProcess);
  await new Promise((resolveClose) => server.close(resolveClose));
  await cleanupBrowserDataDir(browserDataDir);
}

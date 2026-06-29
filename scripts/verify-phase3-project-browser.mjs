import { spawn, spawnSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const GATEWAY_PORT = 8765;
const GATEWAY_HOST = "127.0.0.1";
const PHASE3_ROOT = "C:\\ZhimengBrowserSmoke\\ProjectMode";
const PHASE3_INDEX_PATH = "src/phase3-browser-target.md";
const PHASE3_MARKER = "Phase3 browser read_file context marker";
const PHASE3_CONTENT = [
  "# Phase3 Browser Target",
  "",
  `${PHASE3_MARKER}: this text must travel from Gateway read_file into thread_context and then into the Provider request.`,
  "Project mode should prove scan -> select -> preview -> attach -> send.",
  "",
  ...Array.from({ length: 80 }, (_, index) => `Context filler ${index + 1}: keep this mock file long enough to force the read_file preview persistence boundary.`),
].join("\n");

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

async function findOpenPort(start = 5310) {
  const { createServer: createNetServer } = await import("node:net");
  for (let port = start; port < start + 50; port += 1) {
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
  throw new Error("No open local port found for Phase 3 browser smoke");
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
    await delay(250);
  }
  throw new Error(`server did not become ready: ${url} ${lastError}`);
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
  throw new Error(`JSON endpoint did not become ready: ${url} ${lastError}`);
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
  assert(existsSync(indexPath), "dist/index.html is missing; run npm run build before Phase 3 browser smoke");
  return createServer((request, response) => {
    const pathname = new URL(request.url || "/", "http://127.0.0.1").pathname;
    const normalized = pathname === "/" ? "/index.html" : pathname;
    const candidate = resolve(distDir, `.${decodeURIComponent(normalized)}`);
    const filePath = candidate.startsWith(resolve(distDir)) && existsSync(candidate) ? candidate : indexPath;
    response.writeHead(200, { "Content-Type": contentTypeFor(filePath) });
    createReadStream(filePath).pipe(response);
  });
}

function runtimeCapabilities() {
  return {
    execute_read: true,
    execute_write: true,
    execute_command: false,
    execute_provider: true,
    execute_memory: false,
    execute_mcp: false,
    full_access_files: true,
    arbitrary_shell: "disabled",
    skill_script_execution: "disabled",
    capability_summary: {
      workspace_read: "enabled for phase3 browser smoke",
      workspace_write: "enabled only through approval_decide execute gate for phase3 browser smoke",
    },
    tool_matrix: [
      {
        action: "workspace_scan",
        label: "workspace_scan",
        enabled: true,
        request_gate: "execute=true",
        scope: "workspace",
        default: "metadata_only",
      },
      {
        action: "read_file",
        label: "read_file",
        enabled: true,
        request_gate: "execute=true",
        scope: "workspace/full_access",
        default: "read_only",
      },
      {
        action: "write_file",
        label: "write_file",
        enabled: true,
        request_gate: "approval_decide execute=true",
        scope: "workspace",
        default: "approval_gated",
      },
    ],
  };
}

function jsonResponse(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolveRead, rejectRead) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolveRead(raw ? JSON.parse(raw) : {});
      } catch (error) {
        rejectRead(error);
      }
    });
    request.on("error", rejectRead);
  });
}

function createMockGatewayServer() {
  const requests = [];
  const approvals = [];
  let approvalCounter = 0;
  let writtenContent = PHASE3_CONTENT;
  const server = createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
    response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }
    if (request.method === "GET" && request.url === "/health") {
      jsonResponse(response, 200, {
        status: "ok",
        service: "phase3-browser-mock-gateway",
        runtime_capabilities: runtimeCapabilities(),
      });
      return;
    }
    if (request.method === "GET" && request.url === "/__requests") {
      jsonResponse(response, 200, { requests });
      return;
    }
    if (request.method === "POST" && request.url === "/bridge") {
      const body = await readJson(request);
      const action = String(body.action || "");
      const payload = body.payload && typeof body.payload === "object" ? body.payload : {};
      requests.push({ action, payload, execute: Boolean(body.execute), at: Date.now() });
      const base = { status: "ok", runtime_capabilities: runtimeCapabilities() };
      if (action === "approval_status") {
        const summaries = approvals.map((approval) => ({
          id: approval.id,
          action: approval.action,
          status: approval.status,
          target: approval.target,
          message: approval.message,
          created_at: approval.created_at,
          purpose: approval.purpose,
          proposal: approval.proposal,
          agent_context: approval.agent_context,
        }));
        const byAction = {};
        const byStatus = {};
        for (const approval of approvals) {
          byAction[approval.action] = (byAction[approval.action] || 0) + 1;
          byStatus[approval.status] = (byStatus[approval.status] || 0) + 1;
        }
        jsonResponse(response, 200, {
          ...base,
          approval_status: {
            count: approvals.length,
            pending_count: approvals.filter((approval) => !["executed", "rejected", "already_decided"].includes(approval.status)).length,
            queue_count: approvals.length,
            summaries,
            records: approvals,
            by_action: byAction,
            by_status: byStatus,
          },
        });
        return;
      }
      if (action === "workspace_scan") {
        jsonResponse(response, 200, {
          ...base,
          workspace_scan: {
            root_input: payload.root || payload.path || PHASE3_ROOT,
            root: payload.root || payload.path || PHASE3_ROOT,
            access_profile: payload.access_profile || "full_access",
            max_depth: payload.max_depth || 2,
            limit: payload.limit || 120,
            returned: 3,
            has_more: false,
            skipped: 0,
            file_count: 2,
            dir_count: 1,
            items: [
              {
                path: PHASE3_INDEX_PATH,
                name: "phase3-browser-target.md",
                is_dir: false,
                isDir: false,
                extension: ".md",
                size: PHASE3_CONTENT.length,
                modified_at: "2026-06-20T00:00:00.000Z",
                depth: 2,
              },
              {
                path: "docs/phase3-browser-note.md",
                name: "phase3-browser-note.md",
                is_dir: false,
                isDir: false,
                extension: ".md",
                size: 128,
                modified_at: "2026-06-20T00:00:00.000Z",
                depth: 2,
              },
              {
                path: "src",
                name: "src",
                is_dir: true,
                isDir: true,
                extension: "",
                size: 0,
                modified_at: "2026-06-20T00:00:00.000Z",
                depth: 1,
              },
            ],
            policy: {
              source: "phase3-browser-mock",
              metadata_only: true,
              content: "not included",
            },
          },
          workspace_scan_policy: {
            status: "metadata_only",
            detail: "Mock Gateway returns path metadata only; read_file must fetch content separately.",
          },
        });
        return;
      }
      if (action === "read_file") {
        jsonResponse(response, 200, {
          ...base,
          target: payload.path || PHASE3_INDEX_PATH,
          path: payload.index_path || PHASE3_INDEX_PATH,
          content: writtenContent,
          bytes: Buffer.byteLength(writtenContent, "utf8"),
        });
        return;
      }
      if (action === "write_file") {
        const approvalId = `phase3-write-approval-${++approvalCounter}`;
        const target = payload.path || PHASE3_INDEX_PATH;
        const approval = {
          id: approvalId,
          action: "write_file",
          status: "pending",
          target,
          message: "Phase3 mock queued write_file for approval; no file was written.",
          created_at: Date.now(),
          purpose: String(body.purpose || "phase3 browser write_file approval"),
          request: payload,
          result: {
            status: "approval_required",
            approval_id: approvalId,
            action: "write_file",
            target,
            message: "Phase3 mock queued write_file for approval; no file was written.",
          },
          proposal: {
            target_path: target,
            mode: payload.mode || "append",
            source: payload.source || "changes_diff",
          },
          decision: {},
          agent_context: payload.agent_context || {},
        };
        approvals.push(approval);
        jsonResponse(response, 200, {
          ...base,
          status: "approval_required",
          approval_id: approvalId,
          action: "write_file",
          target,
          message: "Phase3 mock queued write_file for approval; no file was written.",
        });
        return;
      }
      if (action === "approval_decide") {
        const approvalId = String(payload.approval_id || "");
        const decision = String(payload.decision || "");
        const approval = approvals.find((item) => item.id === approvalId);
        if (!approval) {
          jsonResponse(response, 200, {
            ...base,
            approval_decide: {
              status: "not_found",
              message: `approval not found: ${approvalId}`,
            },
          });
          return;
        }
        if (["executed", "rejected"].includes(approval.status)) {
          jsonResponse(response, 200, {
            ...base,
            approval_decide: {
              status: "already_decided",
              message: `approval already decided: ${approvalId}`,
              decision: approval.decision,
            },
          });
          return;
        }
        if (decision === "reject") {
          approval.status = "rejected";
          approval.decision = {
            decision,
            status: "rejected",
            message: "Phase3 mock rejected write_file approval.",
            at: Date.now(),
          };
          jsonResponse(response, 200, {
            ...base,
            approval_decide: approval.decision,
          });
          return;
        }
        if (decision === "execute" && body.execute === true) {
          const requestPayload = approval.request && typeof approval.request === "object" ? approval.request : {};
          const appended = String(requestPayload.content || "");
          writtenContent = [
            PHASE3_CONTENT,
            "",
            "## Phase3 write_file executed marker",
            appended,
          ].join("\n");
          approval.status = "executed";
          approval.decision = {
            decision,
            status: "executed",
            message: "Phase3 mock executed write_file approval.",
            at: Date.now(),
            write_file: {
              status: "ok",
              path: approval.target,
              bytes: Buffer.byteLength(appended, "utf8"),
            },
          };
          jsonResponse(response, 200, {
            ...base,
            approval_decide: approval.decision,
          });
          return;
        }
        jsonResponse(response, 200, {
          ...base,
          approval_decide: {
            status: "approval_required",
            message: "approval_decide execute requires request execute=true.",
          },
        });
        return;
      }
      if (action === "context_pack") {
        const threadContext = Array.isArray(payload.thread_context) ? payload.thread_context : [];
        jsonResponse(response, 200, {
          ...base,
          context_pack: {
            thread_context: threadContext,
            context_pack: [],
            active_skill_keys: [],
            tool_policy: { excluded_tool_scopes: [] },
            thread_context_policy: payload.thread_context_policy || { uses: ["thread_context"] },
            next_bridge_actions: [],
          },
        });
        return;
      }
      const emptyPayloads = {
        provider_catalog: { models: [], profiles: [] },
        memory_status: { status: "ok", records: 0 },
        memory_backup_status: { backups: [] },
        skill_status: { status: "ok", skills: [] },
        worker_status: { status: "idle", jobs: [] },
        runtime_events: { events: [], latest: {}, cursor: {} },
        phase_audit: { status: "ok" },
        completion_audit: { status: "ok" },
        provider_config_status: { settings: {}, config: {} },
      };
      jsonResponse(response, 200, {
        ...base,
        [action]: emptyPayloads[action] || { status: "ok" },
      });
      return;
    }
    jsonResponse(response, 404, { status: "not_found" });
  });
  return { server, requests };
}

function candidateBrowsers() {
  const env = [process.env.ZHIMENG_BROWSER, process.env.CHROME_PATH, process.env.EDGE_PATH].filter(Boolean);
  if (process.platform === "win32") {
    const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
    return [
      ...env,
      ...roots.map((root) => join(root, "Microsoft", "Edge", "Application", "msedge.exe")),
      ...roots.map((root) => join(root, "Google", "Chrome", "Application", "chrome.exe")),
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

function browserBaseArgs(userDataDir, remoteDebuggingPort) {
  return [
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
    `--remote-debugging-port=${remoteDebuggingPort}`,
  ];
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
  const key = Buffer.from(`zhimeng-phase3-${Date.now()}`).toString("base64");
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
  await new Promise((resolveHandshake, rejectHandshake) => {
    let buffer = Buffer.alloc(0);
    const onData = (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (buffer.includes(Buffer.from("\r\n\r\n"))) {
        socket.off("data", onData);
        resolveHandshake();
      }
    };
    socket.on("data", onData);
    socket.once("error", rejectHandshake);
  });
  let nextId = 0;
  const pending = new Map();
  let rest = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    const decoded = decodeWebSocketFrames(Buffer.concat([rest, chunk]));
    rest = decoded.rest;
    for (const text of decoded.messages) {
      const message = JSON.parse(text);
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
        }, 120000);
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
    // Browser.close may close the page socket before it acknowledges.
  }
}

async function cleanupBrowserDataDir(path) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 });
      return;
    } catch (error) {
      if (attempt === 7) {
        console.warn(`[phase3-browser] browser temp cleanup skipped: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      await delay(400);
    }
  }
}

const pagePort = Number(process.env.ZHIMENG_PHASE3_BROWSER_PORT || await findOpenPort());
const debugPort = Number(process.env.ZHIMENG_PHASE3_BROWSER_DEBUG_PORT || await findOpenPort(5700));
const mockProviderPort = Number(process.env.ZHIMENG_PHASE3_BROWSER_PROVIDER_PORT || await findOpenPort(5800));
const browserProviderApiUrl = `http://lvh.me:${mockProviderPort}/v1`;
const pageUrl = `http://127.0.0.1:${pagePort}/?phase3-project-browser-smoke=1`;
const browserDataDir = mkdtempSync(join(tmpdir(), "zhimeng-phase3-project-browser-"));
const staticServer = createStaticDistServer(resolve("dist"));
const { server: gatewayServer } = createMockGatewayServer();
let browserProcess = null;
let mockProviderProcess = null;
let devtools = null;

try {
  await new Promise((resolveListen, rejectListen) => {
    staticServer.once("error", rejectListen);
    staticServer.listen(pagePort, "127.0.0.1", resolveListen);
  });
  await waitForServer(`http://127.0.0.1:${pagePort}/`);
  await new Promise((resolveListen, rejectListen) => {
    gatewayServer.once("error", (error) => {
      rejectListen(new Error(`mock Gateway could not bind ${GATEWAY_HOST}:${GATEWAY_PORT}; stop any existing Gateway before this browser smoke. ${error.message}`));
    });
    gatewayServer.listen(GATEWAY_PORT, GATEWAY_HOST, resolveListen);
  });
  await waitForServer(`http://${GATEWAY_HOST}:${GATEWAY_PORT}/health`);
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
    pageUrl,
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
      const match = targets.find((target) => target.type === "page" && String(target.url || "").includes(`127.0.0.1:${pagePort}`));
      if (match?.webSocketDebuggerUrl) return match;
      await delay(250);
    }
    throw new Error(`Could not find Agent Home page target. Browser stderr: ${browserStderr}`);
  })();
  devtools = await connectWebSocket(pageTarget.webSocketDebuggerUrl);
  await devtools.send("Runtime.enable");
  await devtools.send("Page.enable");
  await delay(800);
  const configuredResult = await evaluateWithRetry(devtools, {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      new Promise((resolve) => {
        localStorage.setItem("novelsmith-api-settings", JSON.stringify({
          apiUrl: ${JSON.stringify(browserProviderApiUrl)},
          apiKey: "sk-phase3-browser-key",
          modelId: "smoke-model",
          modelName: "Phase3 Browser Smoke Model",
          provider: "openai-compatible",
          temperature: 0.1,
          profiles: [{
            id: "phase3-browser-profile",
            name: "Phase3 Browser Smoke Model",
            apiUrl: ${JSON.stringify(browserProviderApiUrl)},
            apiKey: "sk-phase3-browser-key",
            modelId: "smoke-model",
            modelName: "Phase3 Browser Smoke Model",
            provider: "openai-compatible"
          }],
          activeProfileId: "phase3-browser-profile"
        }));
        localStorage.removeItem("zhimeng-agent-threads");
        localStorage.removeItem("zhimeng-agent-thread-spaces");
        localStorage.removeItem("zhimeng-workspace-root-profiles");
        localStorage.removeItem("zhimeng-workspace-scan-indexes");
        localStorage.removeItem("zhimeng-workbench-layout");
        resolve({ ok: true });
      })
    `,
  });
  assert(configuredResult.result?.value?.ok, "Failed to seed browser Provider config");
  await devtools.send("Page.reload", { ignoreCache: true });
  await delay(1000);
  const workflowResult = await evaluateWithRetry(devtools, {
    awaitPromise: true,
    returnByValue: true,
    expression: `
      new Promise((resolve) => {
        const marker = ${JSON.stringify(PHASE3_MARKER)};
        const targetRoot = ${JSON.stringify(PHASE3_ROOT)};
        const setNativeValue = (element, value) => {
          const proto = Object.getPrototypeOf(element);
          const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
          descriptor?.set?.call(element, value);
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));
        };
        const click = (selector) => document.querySelector(selector)?.click();
        const startedAt = Date.now();
        let enteredProject = false;
        let openedFiles = false;
        let boundRoot = false;
        let scanned = false;
        let expandedIndex = false;
        let selected = false;
        let previewed = false;
        let previewMarkerRendered = false;
        let attached = false;
        let diffed = false;
        let openedDiffReview = false;
        let accepted = false;
        let approved = false;
        let openedApprovals = false;
        let openedApprovalDetail = false;
        let executedApproval = false;
        let returnedToChat = false;
        let sent = false;
        const tick = () => {
          const bodyText = document.body.innerText || "";
          const threadStorageText = localStorage.getItem("zhimeng-agent-threads") || "";
          const home = document.querySelector('[data-testid="agent-home-focused"]');
          const composer = document.querySelector('[data-testid="agent-thread-composer"]');
          const send = document.querySelector('[data-testid="agent-send-button"]');
          const modeSwitch = document.querySelector('[data-testid="agent-home-header-mode-switch"]');
          const side = document.querySelector('[data-testid="agent-home-side-tabs"]');
          const filesTab = document.querySelector('[data-testid="agent-home-side-tab-files"]');
          const rootInput = document.querySelector('[data-testid="home-workspace-root-input"]');
          const rootSave = document.querySelector('[data-testid="home-workspace-root-save"]');
          const rootScan = document.querySelector('[data-testid="home-workspace-root-scan"]');
          const indexedRows = Array.from(document.querySelectorAll('[data-testid^="home-indexed-path-"]'));
          const indexRowsByText = Array.from(document.querySelectorAll("button")).filter((row) => {
            const text = row.innerText || "";
            return text.includes("phase3-browser-target.md") || text.includes("docs/phase3-browser-note.md") || text.includes("目录 · src");
          });
          const indexRows = indexedRows.length ? indexedRows : indexRowsByText;
          const targetRow = indexRows.find((row) => (row.innerText || "").includes("phase3-browser-target.md")) || indexRows.find((row) => !(row.innerText || "").includes("目录"));
          const preview = document.querySelector('[data-testid="home-index-preview-file"]');
          const attach = document.querySelector('[data-testid="home-index-attach-file"]');
          const previewDiff = document.querySelector('[data-testid="home-index-preview-diff"]');
          const acceptDiff = document.querySelector('[data-testid="home-diff-accept-all"]') || document.querySelector('[data-testid="workbench-side-diff-accept-all"]');
          const createApproval = document.querySelector('[data-testid="home-diff-create-approval"]') || document.querySelector('[data-testid="workbench-side-diff-create-write-approval"]');
          const approvalsTab = document.querySelector('[data-testid="agent-home-side-tab-approvals"]');
          const homeApprovalRows = Array.from(document.querySelectorAll('[data-testid^="home-approval-row-"]'));
          const targetApprovalRow = homeApprovalRows.find((row) => {
            const text = row.innerText || "";
            return text.includes("write_file") || text.includes("phase3-browser-target.md");
          });
          const approvalExecute = document.querySelector('[data-testid="editor-approval-execute-button"]') || document.querySelector('[data-testid="bottom-approval-execute-button"]');
          const approvalDecisionResult = document.querySelector('[data-testid="approval-decision-result"]');
          const returnChat = document.querySelector('[data-testid="workbench-sidebar-agent-home"]') || document.querySelector('[data-testid="agent-home-side-return-chat"]');
          const modeText = modeSwitch?.innerText || "";
          if (!home && !openedApprovalDetail) {
            if (Date.now() - startedAt > 20000) resolve({ ok: false, reason: "home not ready", bodyText });
            else setTimeout(tick, 120);
            return;
          }
          if (!openedApprovalDetail && (!composer || !send || !modeSwitch)) {
            if (Date.now() - startedAt > 20000) resolve({ ok: false, reason: "home controls not ready", bodyText });
            else setTimeout(tick, 120);
            return;
          }
          if (!enteredProject && !modeText.includes("项目模式")) {
            modeSwitch.click();
            enteredProject = true;
            setTimeout(tick, 220);
            return;
          }
          if (!openedFiles && side?.getAttribute("data-panel-state") === "open" && rootInput) {
            openedFiles = true;
          }
          if (!openedFiles && filesTab && side?.getAttribute("data-panel-state") !== "open") {
            filesTab.click();
            openedFiles = true;
            setTimeout(tick, 160);
            return;
          }
          if (!openedFiles && filesTab && side?.getAttribute("data-panel-state") === "open" && !rootInput) {
            filesTab.click();
            openedFiles = true;
            setTimeout(tick, 160);
            return;
          }
          if (!boundRoot && rootInput && rootSave) {
            setNativeValue(rootInput, targetRoot);
            rootSave.click();
            boundRoot = true;
            setTimeout(tick, 260);
            return;
          }
          const profiles = JSON.parse(localStorage.getItem("zhimeng-workspace-root-profiles") || "[]");
          const savedProfile = Array.isArray(profiles) ? profiles.find((item) => item && item.rootPath === targetRoot) : null;
          if (!scanned && savedProfile && rootScan && !rootScan.disabled) {
            rootScan.click();
            scanned = true;
            setTimeout(tick, 500);
            return;
          }
          if (!expandedIndex && scanned) {
            document.querySelectorAll("details").forEach((details) => {
              if ((details.innerText || "").includes("本机路径索引")) details.open = true;
            });
            expandedIndex = true;
            setTimeout(tick, 180);
            return;
          }
          if (!selected && targetRow) {
            targetRow.click();
            selected = true;
            setTimeout(tick, 180);
            return;
          }
          if (!previewed && selected && preview && !preview.disabled) {
            preview.click();
            previewed = true;
            setTimeout(tick, 500);
            return;
          }
          if (!attached && bodyText.includes(marker) && attach && !attach.disabled) {
            previewMarkerRendered = true;
            attach.click();
            attached = true;
            setTimeout(tick, 350);
            return;
          }
          if (!diffed && attached && previewDiff && !previewDiff.disabled) {
            previewDiff.click();
            diffed = true;
            setTimeout(tick, 350);
            return;
          }
          if (!openedDiffReview && diffed) {
            const reviewDetails = Array.from(document.querySelectorAll("details"))
              .find((details) => (details.textContent || "").includes("审查动作"));
            if (reviewDetails) {
              reviewDetails.open = true;
              openedDiffReview = true;
              setTimeout(tick, 180);
              return;
            }
          }
          if (!accepted && diffed && acceptDiff && !acceptDiff.disabled) {
            acceptDiff.click();
            accepted = true;
            setTimeout(tick, 280);
            return;
          }
          if (!approved && accepted && createApproval && !createApproval.disabled) {
            createApproval.click();
            approved = true;
            setTimeout(tick, 700);
            return;
          }
          if (!openedApprovals && approved && approvalsTab && bodyText.includes("write_file 审批")) {
            approvalsTab.click();
            openedApprovals = true;
            setTimeout(tick, 900);
            return;
          }
          if (!openedApprovalDetail && openedApprovals && targetApprovalRow) {
            targetApprovalRow.click();
            openedApprovalDetail = true;
            setTimeout(tick, 900);
            return;
          }
          if (!executedApproval && openedApprovalDetail && approvalExecute && !approvalExecute.disabled) {
            approvalExecute.click();
            executedApproval = true;
            setTimeout(tick, 1200);
            return;
          }
          if (
            executedApproval
            && !returnedToChat
            && (
              bodyText.includes("写入后 read_file 复核完成")
              || threadStorageText.includes("写入后文件复核")
              || threadStorageText.includes("write_file approval verify")
            )
          ) {
            if (returnChat) {
              returnChat.click();
              returnedToChat = true;
              setTimeout(tick, 900);
              return;
            }
            returnedToChat = true;
          }
          if (!sent && returnedToChat && composer && send && bodyText.includes("写入后文件复核")) {
            setNativeValue(composer, "请基于刚刚挂入上下文的 Phase3 文件，总结它证明了什么。");
            send.click();
            sent = true;
            setTimeout(tick, 800);
            return;
          }
          if (sent && bodyText.includes("浏览器模型配置冒烟成功")) {
            const threads = localStorage.getItem("zhimeng-agent-threads") || "";
            resolve({
              ok: true,
              savedProfile,
              indexedCount: indexRows.length,
              persistedIndexedCount: (() => {
                try {
                  const indexes = JSON.parse(localStorage.getItem("zhimeng-workspace-scan-indexes") || "[]");
                  const matched = Array.isArray(indexes) ? indexes.find((item) => item && item.rootPath === targetRoot) : null;
                  return Array.isArray(matched?.items) ? matched.items.length : 0;
                } catch {
                  return 0;
                }
              })(),
              hasPreviewMarkerRendered: previewMarkerRendered,
              hasMarkerInDom: bodyText.includes(marker),
              hasMarkerInThreadStorage: threads.includes(marker),
              hasReadFileSourceInThreadStorage: threads.includes("Gateway read_file 预览") || threads.includes("网关 read_file") || threads.includes("read_file 预览"),
              hasPersistenceBoundaryInThreadStorage: threads.includes("完整正文未持久保存"),
              hasDiffEventInThreadStorage: threads.includes("生成 Diff 草案"),
              hasApprovalEventInThreadStorage: threads.includes("write_file 审批"),
              hasApprovalExecutedInThreadStorage: threads.includes("执行 write_file 审批") || threads.includes("write_file 审批执行结果"),
              hasWriteVerificationMessageInThreadStorage: threads.includes("写入后文件复核"),
              hasWriteVerificationContextInThreadStorage: threads.includes("write_file approval verify") || threads.includes("写入后复核"),
              hasExecutedMarkerInThreadStorage: threads.includes("Phase3 write_file executed marker"),
              hasApprovalCopy: bodyText.includes("write_file 审批"),
              hasApprovalDecisionResult: Boolean(approvalDecisionResult) || threads.includes("执行 write_file 审批") || threads.includes("Phase3 mock executed write_file approval"),
              hasWriteVerificationCopy: bodyText.includes("写入后文件复核") || threads.includes("写入后文件复核"),
              bodyText: bodyText.slice(0, 3000)
            });
            return;
          }
          if (Date.now() - startedAt > 70000) {
            resolve({
              ok: false,
              reason: "project workflow timed out",
              enteredProject,
              openedFiles,
              boundRoot,
              scanned,
              expandedIndex,
              selected,
              previewed,
              previewMarkerRendered,
              attached,
              diffed,
              openedDiffReview,
              accepted,
              approved,
              openedApprovals,
              openedApprovalDetail,
              executedApproval,
              returnedToChat,
              sent,
              scanDisabled: rootScan?.disabled,
              previewDisabled: preview?.disabled,
              attachDisabled: attach?.disabled,
              previewDiffDisabled: previewDiff?.disabled,
              acceptDiffDisabled: acceptDiff?.disabled,
              createApprovalDisabled: createApproval?.disabled,
              approvalExecuteDisabled: approvalExecute?.disabled,
              homeApprovalRowCount: homeApprovalRows.length,
              indexedCount: indexRows.length,
              bodyText: bodyText.slice(0, 6000),
              rootProfiles: localStorage.getItem("zhimeng-workspace-root-profiles"),
              scanIndexes: localStorage.getItem("zhimeng-workspace-scan-indexes"),
              threads: localStorage.getItem("zhimeng-agent-threads")
            });
            return;
          }
          setTimeout(tick, 160);
        };
        tick();
      })
    `,
  }, 6);
  assert(workflowResult.result?.value, `Phase 3 project browser workflow returned no value: ${JSON.stringify(workflowResult).slice(0, 4000)}`);
  const workflow = workflowResult.result.value;
  assert(workflow.ok, `Phase 3 project browser workflow failed: ${JSON.stringify({ workflow, workflowResult }).slice(0, 4000)}`);
  assert(workflow.savedProfile?.rootPath === PHASE3_ROOT, `Project root did not persist: ${JSON.stringify(workflow)}`);
  assert(workflow.indexedCount >= 1 || workflow.persistedIndexedCount >= 1, `workspace_scan index did not render or persist: ${JSON.stringify(workflow)}`);
  assert(workflow.hasPreviewMarkerRendered === true, `read_file preview marker did not render before attachment: ${JSON.stringify(workflow).slice(0, 2000)}`);
  assert(workflow.hasMarkerInThreadStorage === true, `read_file preview marker did not persist in thread context: ${JSON.stringify(workflow).slice(0, 2000)}`);
  assert(workflow.hasReadFileSourceInThreadStorage === true, `read_file preview source did not persist in thread context: ${JSON.stringify(workflow).slice(0, 2000)}`);
  assert(workflow.hasPersistenceBoundaryInThreadStorage === true, `preview persistence boundary did not persist in thread context: ${JSON.stringify(workflow).slice(0, 2000)}`);
  assert(workflow.hasDiffEventInThreadStorage === true, `Diff draft event did not persist on the project thread: ${JSON.stringify(workflow).slice(0, 2000)}`);
  assert(workflow.hasApprovalEventInThreadStorage === true, `write_file approval event did not persist on the project thread: ${JSON.stringify(workflow).slice(0, 2000)}`);
  assert(workflow.hasApprovalExecutedInThreadStorage === true, `approval_decide execution event did not persist on the project thread: ${JSON.stringify(workflow).slice(0, 2000)}`);
  assert(workflow.hasWriteVerificationMessageInThreadStorage === true, `write_file post-execution read_file verification message did not persist on the project thread: ${JSON.stringify(workflow).slice(0, 2000)}`);
  assert(workflow.hasWriteVerificationContextInThreadStorage === true, `write_file post-execution read_file verification context did not persist on the project thread: ${JSON.stringify(workflow).slice(0, 2000)}`);
  assert(workflow.hasApprovalCopy === true, `write_file approval state was not visible in the browser workflow: ${JSON.stringify(workflow).slice(0, 2000)}`);
  assert(workflow.hasApprovalDecisionResult === true, `approval_decide execution result was not visible or persisted: ${JSON.stringify(workflow).slice(0, 2000)}`);
  assert(workflow.hasWriteVerificationCopy === true, `write_file post-execution verification copy was not visible or persisted: ${JSON.stringify(workflow).slice(0, 2000)}`);
  const lastChat = await waitForJson(`http://127.0.0.1:${mockProviderPort}/__last-chat`, 15000);
  assert(lastChat.model === "smoke-model", `Provider should receive saved smoke-model: ${JSON.stringify(lastChat)}`);
  assert(lastChat.authorization === "[present]", `Provider should receive Authorization header: ${JSON.stringify(lastChat)}`);
  assert(String(lastChat.text || "").includes(PHASE3_MARKER), `Provider request must include read_file preview marker in text: ${JSON.stringify(lastChat).slice(0, 4000)}`);
  assert(String(lastChat.text || "").includes("read_file"), `Provider request must keep read_file context wording: ${JSON.stringify(lastChat).slice(0, 4000)}`);
  assert(String(lastChat.text || "").includes(PHASE3_INDEX_PATH), `Provider request must include indexed file path: ${JSON.stringify(lastChat).slice(0, 4000)}`);
  const gatewayRequests = await waitForJson(`http://${GATEWAY_HOST}:${GATEWAY_PORT}/__requests`, 5000);
  const actions = Array.isArray(gatewayRequests.requests) ? gatewayRequests.requests.map((item) => item.action) : [];
  assert(actions.includes("workspace_scan"), `Gateway should receive workspace_scan: ${JSON.stringify(gatewayRequests)}`);
  assert(actions.includes("read_file"), `Gateway should receive read_file: ${JSON.stringify(gatewayRequests)}`);
  assert(actions.includes("write_file"), `Gateway should receive write_file approval draft after Diff review: ${JSON.stringify(gatewayRequests)}`);
  assert(actions.includes("approval_status"), `Gateway should receive approval_status before approval execution: ${JSON.stringify(gatewayRequests)}`);
  assert(actions.includes("approval_decide"), `Gateway should receive approval_decide for write_file execution: ${JSON.stringify(gatewayRequests)}`);
  assert(actions.includes("context_pack"), `Gateway should receive context_pack before Provider send: ${JSON.stringify(gatewayRequests)}`);
  const writeFileRequest = Array.isArray(gatewayRequests.requests) ? gatewayRequests.requests.find((item) => item.action === "write_file") : null;
  assert(writeFileRequest && writeFileRequest.execute === false, `write_file should be submitted as an approval draft without execute=true: ${JSON.stringify(writeFileRequest)}`);
  const approvalDecideRequest = Array.isArray(gatewayRequests.requests) ? gatewayRequests.requests.find((item) => item.action === "approval_decide") : null;
  assert(approvalDecideRequest && approvalDecideRequest.execute === true, `approval_decide should execute the queued write_file with request execute=true: ${JSON.stringify(approvalDecideRequest)}`);
  assert(String(approvalDecideRequest?.payload?.decision || "") === "execute", `approval_decide should carry decision=execute: ${JSON.stringify(approvalDecideRequest)}`);
  const readFileRequests = Array.isArray(gatewayRequests.requests) ? gatewayRequests.requests.filter((item) => item.action === "read_file") : [];
  assert(readFileRequests.length >= 2, `Gateway should receive read_file before attachment and after write_file execution: ${JSON.stringify(gatewayRequests)}`);
  const verifyReadFileRequest = readFileRequests.find((item) => String(item.payload?.source || "") === "write_file_approval_verify");
  assert(verifyReadFileRequest && verifyReadFileRequest.execute === true, `write_file execution should trigger read_file verification with execute=true: ${JSON.stringify(readFileRequests)}`);
  const latestReadFileRequest = readFileRequests.at(-1);
  assert(String(latestReadFileRequest?.payload?.source || "") === "write_file_approval_verify", `latest read_file should be the write-after-approval verification pass: ${JSON.stringify(readFileRequests)}`);
  const writeFilePath = String(writeFileRequest?.payload?.path || "").replace(/\\/g, "/");
  assert(writeFilePath.endsWith(PHASE3_INDEX_PATH), `write_file approval should target the indexed file path: ${JSON.stringify(writeFileRequest)}`);
  assert(String(writeFileRequest?.payload?.content || "").includes(PHASE3_MARKER), `write_file approval content should preserve the read_file preview evidence: ${JSON.stringify(writeFileRequest).slice(0, 3000)}`);
  assert(String(writeFileRequest?.payload?.source || "").includes("changes_diff"), `write_file approval should be sourced from Changes / Diff: ${JSON.stringify(writeFileRequest)}`);
  console.log("phase3-project-browser ok");
} finally {
  await closeBrowserByDevtools(devtools);
  devtools?.close();
  await stopBrowserProcess(browserProcess);
  await stopBrowserProcess(mockProviderProcess);
  await new Promise((resolveClose) => staticServer.close(resolveClose));
  await new Promise((resolveClose) => gatewayServer.close(resolveClose));
  await cleanupBrowserDataDir(browserDataDir);
}

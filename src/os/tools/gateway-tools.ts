/**
 * 织梦工具执行层 — 对接 Gateway 的真实工具实现
 *
 * 之前 executor-bridge.ts 定义了 59 种动作但没有一个能执行。
 * 这里只实现最核心的 5 个，其他按需添加。
 */

const GATEWAY_URL = "http://127.0.0.1:8765/bridge";

export interface GatewayToolResult {
  action: string;
  status: string;
  text: string;
  json?: Record<string, unknown>;
}

async function bridge(action: string, payload: Record<string, unknown> = {}): Promise<string> {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, purpose: `织梦工具层 ${action}`, payload }),
  });
  if (!res.ok) throw new Error(`Gateway ${res.status}: ${res.statusText}`);
  return await res.text();
}

async function bridgeStructured(action: string, payload: Record<string, unknown> = {}): Promise<GatewayToolResult> {
  const text = await bridge(action, payload);
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    return { action, status: String(json.status || "ok"), text: JSON.stringify(json, null, 2), json };
  } catch {
    return { action, status: "ok", text };
  }
}

// ─── 文件操作 ─────────────────────────────────────────────

export async function readFile(path: string): Promise<string> {
  return bridge("read_file", { path });
}

export async function readFileResult(path: string): Promise<GatewayToolResult> {
  return bridgeStructured("read_file", { path });
}

export async function writeFile(path: string, content: string): Promise<string> {
  return bridge("write_file", { path, content });
}

export async function writeFileResult(path: string, content: string): Promise<GatewayToolResult> {
  return bridgeStructured("write_file", { path, content });
}

export async function listFiles(dir: string): Promise<string> {
  return bridge("workspace_scan", { path: dir });
}

export async function listFilesResult(dir: string): Promise<GatewayToolResult> {
  return bridgeStructured("workspace_scan", { path: dir });
}

// ─── 终端 ─────────────────────────────────────────────────

export async function runCommand(command: string, cwd?: string): Promise<string> {
  return bridge("run_command", { command, cwd: cwd || "." });
}

export async function runCommandResult(command: string, cwd?: string): Promise<GatewayToolResult> {
  return bridgeStructured("run_command", { command, cwd: cwd || "." });
}

// ─── 网络 ─────────────────────────────────────────────────

export async function webFetch(url: string): Promise<string> {
  return bridge("web_fetch", { url });
}

export async function webFetchResult(url: string): Promise<GatewayToolResult> {
  return bridgeStructured("web_fetch", { url });
}

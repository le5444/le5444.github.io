import http from "node:http";

const port = Number(process.env.PORT || process.argv[2] || 5191);
const host = "127.0.0.1";
let lastChatRequest = null;

function summarizeChatRequest(body, req) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const contentParts = messages.flatMap((message) => Array.isArray(message.content) ? message.content : []);
  const text = messages
    .map((message) => {
      if (typeof message.content === "string") return message.content;
      if (Array.isArray(message.content)) {
        return message.content
          .filter((part) => part && part.type === "text")
          .map((part) => part.text || "")
          .join("\n");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 12000);
  return {
    at: new Date().toISOString(),
    method: req.method,
    url: req.url,
    authorization: req.headers.authorization ? "[present]" : "",
    model: body.model || "",
    stream: body.stream,
    messageCount: messages.length,
    textPartCount: contentParts.filter((part) => part && part.type === "text").length,
    imagePartCount: contentParts.filter((part) => part && part.type === "image_url").length,
    imageUrls: contentParts
      .filter((part) => part && part.type === "image_url")
      .map((part) => part.image_url?.url || "")
      .filter(Boolean)
      .map((url) => `${url.slice(0, 80)}${url.length > 80 ? "..." : ""}`),
    text,
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === "GET" && req.url === "/v1/models") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      object: "list",
      data: [
        { id: "smoke-model", object: "model", owned_by: "zhimeng-smoke" },
      ],
    }));
    return;
  }
  if (req.method === "GET" && req.url === "/__last-chat") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(lastChatRequest || { status: "empty" }));
    return;
  }
  if (req.method === "POST" && req.url === "/v1/chat/completions") {
    const body = await readJson(req);
    lastChatRequest = summarizeChatRequest(body, req);
    if (body.stream === false) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        choices: [
          { message: { content: "浏览器模型配置冒烟成功。" } },
        ],
      }));
      return;
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write('data: {"choices":[{"delta":{"content":"浏览器模型"}}]}\n\n');
    res.write('data: {"choices":[{"delta":{"content":"配置冒烟成功。"}}]}\n\n');
    res.end("data: [DONE]\n\n");
    return;
  }
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: { message: "not found" } }));
});

server.listen(port, host, () => {
  console.log(`smoke-openai-compatible-server listening on http://${host}:${port}/v1`);
});

process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));

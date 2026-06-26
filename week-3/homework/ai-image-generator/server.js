// ========================================
// fal.ai Image Generation Proxy Server
// Node.js built-ins only (http, https, fs, path)
// ========================================
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3001;
const INDEX_HTML = path.join(__dirname, "index.html");
const POLLINATIONS_HOST = "image.pollinations.ai";

// ----------------------------------------
// CORS headers applied to every response
// ----------------------------------------
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, payload) {
  setCors(res);
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

// ----------------------------------------
// Read full request body
// ----------------------------------------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      // basic guard against oversized payloads (~1MB)
      if (data.length > 1e6) {
        reject(new Error("요청 본문이 너무 큽니다."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// ----------------------------------------
// Proxy request to Pollinations.ai (free, no API key)
// GET https://image.pollinations.ai/prompt/{prompt}?width=1024&height=1024&nologo=true
// Returns the image directly as binary
// ----------------------------------------
function callPollinations(prompt) {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(prompt);
    const path = `/prompt/${encoded}?width=1024&height=1024&nologo=true&model=flux`;
    const options = {
      hostname: POLLINATIONS_HOST,
      path,
      method: "GET",
      headers: { "User-Agent": "ai-image-generator/1.0" },
    };

    const req = https.request(options, (res) => {
      // Pollinations may redirect — follow redirect
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return callPollinations(prompt).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        console.log(`[pollinations] status: ${res.statusCode}, bytes: ${buffer.length}`);
        resolve({ statusCode: res.statusCode, buffer, contentType: res.headers["content-type"] || "image/jpeg" });
      });
    });

    req.on("error", reject);
    req.end();
  });
}

// ----------------------------------------
// Route handlers
// ----------------------------------------
async function handleGenerate(req, res) {
  let raw;
  try {
    raw = await readBody(req);
  } catch (err) {
    return sendJson(res, 413, { error: err.message });
  }

  let parsed;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch (_) {
    return sendJson(res, 400, { error: "잘못된 JSON 형식입니다." });
  }

  const { prompt } = parsed;

  if (!prompt) return sendJson(res, 400, { error: "프롬프트가 필요합니다." });

  try {
    const result = await callPollinations(prompt);

    if (result.statusCode !== 200) {
      return sendJson(res, 502, { error: `이미지 생성 실패 (${result.statusCode})` });
    }

    // Return image as base64 data URL so client can display directly
    const base64 = result.buffer.toString("base64");
    const dataUrl = `data:${result.contentType};base64,${base64}`;
    sendJson(res, 200, { images: [{ url: dataUrl }] });
  } catch (err) {
    sendJson(res, 502, { error: `이미지 생성 실패: ${err.message}` });
  }
}

function handleIndex(res) {
  fs.readFile(INDEX_HTML, (err, content) => {
    if (err) {
      return sendJson(res, 500, { error: "index.html 을 읽을 수 없습니다." });
    }
    setCors(res);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(content);
  });
}

// ----------------------------------------
// Server
// ----------------------------------------
const server = http.createServer((req, res) => {
  // Preflight
  if (req.method === "OPTIONS") {
    setCors(res);
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    return handleIndex(res);
  }

  if (req.method === "POST" && req.url === "/api/generate") {
    return handleGenerate(req, res);
  }

  sendJson(res, 404, { error: "Not Found" });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = server;

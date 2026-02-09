import express from "express";
import axios from "axios";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();
app.use(express.json());

// 👇 Your Ollama nodes
import NODES from "./config/config.json" assert { type: "json" };

let activeNodes = [];
let rrIndex = 0;

// Health check
async function checkNodes() {
  const checks = await Promise.allSettled(
    NODES.map(async (url) => {
      await axios.get(`${url}/api/tags`, { timeout: 2000 });
      return url;
    })
  );

  activeNodes = checks
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);

  if (activeNodes.length === 0) {
    console.error("❌ No Ollama nodes available");
  } else {
    console.log("✅ Active Ollama nodes:", activeNodes);
  }
}

// Run health check every 5 seconds
setInterval(checkNodes, 5000);
checkNodes();

// Proxy middleware
app.use((req, res, next) => {
  if (activeNodes.length === 0) {
    return res.status(503).json({ error: "No Ollama nodes available" });
  }

  // Round-robin selection
  const target = activeNodes[rrIndex % activeNodes.length];
  rrIndex++;

  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: (path) => path
  })(req, res, next);
});

// Proxy port
app.listen(11435, () => {
  console.log("🟢 Ollama proxy running on http://localhost:11435");
});

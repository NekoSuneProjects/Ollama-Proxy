import express from "express";
import axios from "axios";
import { createProxyMiddleware } from "http-proxy-middleware";
import NODES from "./config/config.json" assert { type: "json" };

const app = express();
app.use(express.json());

let activeNodes = [];
let rrIndex = 0;

/* ------------------ HEALTH CHECK ------------------ */
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

setInterval(checkNodes, 5000);
checkNodes();

/* ------------------ OLLAMA API PROXY ------------------ */
app.use("/api", (req, res, next) => {
  if (activeNodes.length === 0) {
    return res.status(503).json({ error: "No Ollama nodes available" });
  }

  const target = activeNodes[rrIndex % activeNodes.length];
  rrIndex++;

  return createProxyMiddleware({
    target,
    changeOrigin: true,
    ws: true,
    proxyTimeout: 0,
    timeout: 0
  })(req, res, next);
});

/* ------------------ START ------------------ */
app.listen(11434, () => {
  console.log("🟢 Ollama proxy running on http://localhost:11434");
});

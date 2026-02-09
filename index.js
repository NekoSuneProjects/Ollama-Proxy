import express from "express";
import axios from "axios";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();
app.use(express.json());

// 👇 Ollama nodes
import NODES from "./config/config.json" assert { type: "json" };

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

/* ------------------ ADMIN: PULL MODEL ON ALL NODES ------------------ */
app.post("/api/pull", async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Missing model name" });
  }

  if (activeNodes.length === 0) {
    return res.status(503).json({ error: "No active Ollama nodes" });
  }

  console.log(`📦 Pulling model "${name}" on all active nodes...`);

  const results = await Promise.allSettled(
    activeNodes.map(async (node) => {
      const response = await axios.post(
        `${node}/api/pull`,
        { name },
        { timeout: 0 } // pulls can take a long time
      );

      return {
        node,
        status: "ok",
        response: response.data
      };
    })
  );

  const summary = results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      node: activeNodes[i],
      status: "error",
      error: r.reason.message
    };
  });

  res.json({
    model: name,
    nodes: summary
  });
});

/* ------------------ NORMAL PROXY ------------------ */
app.use((req, res, next) => {
  if (activeNodes.length === 0) {
    return res.status(503).json({ error: "No Ollama nodes available" });
  }

  const target = activeNodes[rrIndex % activeNodes.length];
  rrIndex++;

  return createProxyMiddleware({
    target,
    changeOrigin: true
  })(req, res, next);
});

/* ------------------ START ------------------ */
app.listen(11435, () => {
  console.log("🟢 Ollama proxy running on http://localhost:11435");
});

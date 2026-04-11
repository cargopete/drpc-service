import { loadConfig } from "./config.js";
import { IndexerAgent } from "./agent.js";

const configPath = process.env.AGENT_CONFIG ?? "agent.config.json";

let config;
try {
  config = loadConfig(configPath);
} catch (err) {
  console.error(`[agent] failed to load config from ${configPath}:`, err);
  process.exit(1);
}

const agent = new IndexerAgent(config);
agent.start().catch((err) => {
  console.error("[agent] fatal:", err);
  process.exit(1);
});

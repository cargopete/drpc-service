import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { ChildProcess } from "child_process";
import { spawnProcess, waitForPort, killProcess } from "./process.js";

const ROOT = path.resolve(import.meta.dirname, "../../../");
const CONTRACTS = path.join(ROOT, "contracts");
const TMP = path.join(ROOT, "e2e/tmp");

let anvil: ChildProcess;
let service: ChildProcess;
let gateway: ChildProcess;

export async function setup() {
  fs.mkdirSync(TMP, { recursive: true });

  // 1. Start Anvil
  anvil = spawnProcess(
    "anvil",
    ["--port", "8545", "--chain-id", "31337", "--accounts", "5"],
    { cwd: ROOT }
  );
  await waitForPort(8545);

  // 2. Run Foundry setup script
  execFileSync(
    "forge",
    [
      "script",
      "script/SetupE2E.s.sol",
      "--rpc-url",
      "http://127.0.0.1:8545",
      "--broadcast",
      "--skip-simulation",
    ],
    { cwd: CONTRACTS, stdio: "inherit" }
  );

  // 3. Read fixture
  const fixture = JSON.parse(
    fs.readFileSync(path.join(CONTRACTS, "out/e2e-fixture.json"), "utf8")
  );
  process.env.E2E_FIXTURE = JSON.stringify(fixture);

  // 4. Write service configs
  const serviceCfg = `
[server]
host = "127.0.0.1"
port = 7700

[indexer]
service_provider_address = "${fixture.providerAddress}"
operator_private_key = "${fixture.providerKey}"

[tap]
data_service_address = "${fixture.rpcDataService}"
authorized_senders = ["${fixture.gatewaySignerAddress}"]
eip712_domain_name = "TAP"
eip712_chain_id = 31337
eip712_verifying_contract = "${fixture.graphTallyCollector}"
max_receipt_age_ns = 300000000000

[chains]
supported = [31337]

[chains.backends]
"31337" = "http://127.0.0.1:8545"
`;

  const gatewayCfg = `
[gateway]
host = "127.0.0.1"
port = 8080

[tap]
signer_private_key = "${fixture.gatewaySignerKey}"
data_service_address = "${fixture.rpcDataService}"
base_price_per_cu = 4000000000000
eip712_domain_name = "TAP"
eip712_chain_id = 31337
eip712_verifying_contract = "${fixture.graphTallyCollector}"

[qos]
probe_interval_secs = 3600
concurrent_k = 1

[[providers]]
address = "${fixture.providerAddress}"
endpoint = "http://127.0.0.1:7700"
chains = [31337]
capabilities = ["standard"]
`;

  fs.writeFileSync(path.join(TMP, "service.toml"), serviceCfg.trim());
  fs.writeFileSync(path.join(TMP, "gateway.toml"), gatewayCfg.trim());

  // 5. Build Rust binaries
  execFileSync("cargo", ["build", "--bins"], { cwd: ROOT, stdio: "inherit" });

  // 6. Start drpc-service
  service = spawnProcess(
    path.join(ROOT, "target/debug/drpc-service"),
    [],
    {
      cwd: ROOT,
      env: {
        DRPC_CONFIG: path.join(TMP, "service.toml"),
        RUST_LOG: "info",
      },
    }
  );
  await waitForPort(7700);

  // 7. Start drpc-gateway
  gateway = spawnProcess(
    path.join(ROOT, "target/debug/drpc-gateway"),
    [],
    {
      cwd: ROOT,
      env: {
        DRPC_GATEWAY_CONFIG: path.join(TMP, "gateway.toml"),
        RUST_LOG: "info",
      },
    }
  );
  await waitForPort(8080);
}

export async function teardown() {
  if (gateway) await killProcess(gateway);
  if (service) await killProcess(service);
  if (anvil) await killProcess(anvil);
}

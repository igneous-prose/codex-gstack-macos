import { readOptionValue } from "./argv.js";
import { getDefaultDaemonPort, makeDaemonNonce } from "./config.js";
import { runDaemon } from "./daemon.js";

const args = process.argv.slice(2);
const targetRepo = readOptionValue(args, "--repo") ?? process.cwd();
const portOption = readOptionValue(args, "--port");
const port = portOption ? Number.parseInt(portOption, 10) : getDefaultDaemonPort(targetRepo);
const nonce = readOptionValue(args, "--nonce") ?? makeDaemonNonce();
const repoHash = readOptionValue(args, "--repo-hash") ?? "";

await runDaemon({
  targetRepo,
  metadata: {
    repoHash,
    port,
    nonce
  }
});

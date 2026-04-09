import { getDefaultDaemonPort, makeDaemonNonce } from "./config.js";
import { runDaemon } from "./daemon.js";

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

const args = process.argv.slice(2);
const targetRepo = readOption(args, "--repo") ?? process.cwd();
const portOption = readOption(args, "--port");
const port = portOption ? Number.parseInt(portOption, 10) : getDefaultDaemonPort(targetRepo);
const nonce = readOption(args, "--nonce") ?? makeDaemonNonce();
const repoHash = readOption(args, "--repo-hash") ?? "";

await runDaemon({
  targetRepo,
  metadata: {
    repoHash,
    port,
    nonce
  }
});

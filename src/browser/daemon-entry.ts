import { DEFAULT_DAEMON_PORT, makeToken, runDaemon } from "./daemon.js";

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

const args = process.argv.slice(2);
const targetRepo = readOption(args, "--repo") ?? process.cwd();
const port = Number.parseInt(readOption(args, "--port") ?? `${DEFAULT_DAEMON_PORT}`, 10);
const token = readOption(args, "--token") ?? makeToken();

await runDaemon({ targetRepo, port, token });


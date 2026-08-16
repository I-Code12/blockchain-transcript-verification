import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dataPath = resolve(here, "../data");
await mkdir(dataPath, { recursive: true });

// Ganache's optional native WebSocket accelerator does not yet target every
// Node.js build. Silence its harmless fallback notice; the JavaScript provider
// remains fully functional for this local academic network.
const originalLog = console.log; const originalWarn = console.warn; const originalError = console.error;
console.log = console.warn = console.error = () => {};
let ganache;
try { ganache = (await import("ganache")).default; }
finally { console.log = originalLog; console.warn = originalWarn; console.error = originalError; }

const server = ganache.server({
  chain: { chainId: 1337, networkId: 1337 },
  database: { dbPath: dataPath },
  wallet: {
    mnemonic: "test test test test test test test test test test test junk",
    totalAccounts: 5,
    defaultBalance: 1000,
  },
  miner: { instamine: "eager" },
  logging: { quiet: true },
});

await server.listen(8545, "127.0.0.1");
console.log("NexusVerify Ethereum node ready at http://127.0.0.1:8545 (chain 1337)");

const stop = async () => { await server.close(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

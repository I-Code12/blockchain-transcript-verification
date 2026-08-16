import solc from "solc";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(resolve(root, "contracts/TranscriptRegistry.sol"), "utf8");
const input = {
  language: "Solidity",
  sources: { "TranscriptRegistry.sol": { content: source } },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter((entry) => entry.severity === "error");
if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));
const contract = output.contracts["TranscriptRegistry.sol"].TranscriptRegistry;
const artifact = { contractName: "TranscriptRegistry", abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}`, compiler: solc.version() };
await mkdir(resolve(root, "artifacts"), { recursive: true });
await writeFile(resolve(root, "artifacts/TranscriptRegistry.json"), JSON.stringify(artifact, null, 2));
console.log(`Compiled TranscriptRegistry with ${solc.version()}`);

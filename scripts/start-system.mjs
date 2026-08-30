import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const children = [];
const commandShell = process.env.ComSpec || "cmd.exe";
const localConfigPath = resolve(root, ".nexusverify.local.env");
const registrarAccessPath = resolve(root, "REGISTRAR_ACCESS.txt");
const parseEnvironment = (value) => Object.fromEntries(value.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith("#")&&line.includes("=")).map(line=>{const at=line.indexOf("=");return [line.slice(0,at),line.slice(at+1)];}));
if (!existsSync(localConfigPath)) {
  const initial = [
    "NODE_ENV=development",
    "HOST=127.0.0.1",
    "PORT=4000",
    "PUBLIC_APP_URL=http://localhost:3000",
    "FRONTEND_URL=http://localhost:3000",
    "FRONTEND_URLS=http://localhost:3000",
    "BLOCKCHAIN_DEPLOYMENT=local",
    "BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545",
    "BLOCKCHAIN_NETWORK_NAME=NexusVerify Local Ethereum",
    "BLOCK_EXPLORER_URL=",
    `ADMIN_API_KEY=${randomBytes(24).toString("base64url")}`,
    `TRANSCRIPT_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`,
    "SEED_DEMO_DATA=true",
    "NEXUSVERIFY_STANDALONE=true",
    "VITE_API_URL=http://127.0.0.1:4000",
    "VITE_PUBLIC_MODE=false",
  ].join("\r\n");
  writeFileSync(localConfigPath, `${initial}\r\n`, { encoding:"utf8", mode:0o600 });
}
const localEnvironment = parseEnvironment(readFileSync(localConfigPath, "utf8"));
const childEnvironment = { ...process.env, ...localEnvironment };
writeFileSync(registrarAccessPath, [
  "NEXUSVERIFY - ACCRA TECHNICAL UNIVERSITY",
  "LOCAL DEMONSTRATION REGISTRAR ACCESS",
  "",
  `Registrar access key: ${localEnvironment.ADMIN_API_KEY}`,
  "",
  "Use this key only on the Registrar access screen of the local demonstration.",
  "It is not a transcript-results access code.",
  "",
  "To share private transcript results:",
  "1. Open Transcript records as the registrar.",
  "2. Select Share beside the relevant credential.",
  "3. Send the complete secure link to the authorised recipient.",
  "4. The temporary results code is contained in that link and expires automatically.",
].join("\r\n"), "utf8");
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const online = async (url, rpc=false) => { try { const response=await fetch(url,rpc?{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_chainId",params:[]})}:{}); return response.ok; } catch { return false; } };
const npmProcess = (cwd,script) => spawn(commandShell,["/d","/s","/c",`npm.cmd run ${script}`],{cwd,stdio:"inherit",shell:false,env:childEnvironment});
const start = (name,cwd,script) => { console.log(`Starting ${name}…`); const child=npmProcess(cwd,script);children.push(child);return child; };
const run = (cwd,script) => new Promise((resolveRun,reject) => { const child=npmProcess(cwd,script);child.on("exit",code=>code===0?resolveRun():reject(new Error(`${script} failed with code ${code}`))); });
const waitFor = async (label,url,rpc=false) => { for(let attempt=0;attempt<60;attempt++){if(await online(url,rpc))return;await sleep(500);}throw new Error(`${label} did not become ready`); };

const blockchain=resolve(root,"blockchain"); const backend=resolve(root,"backend"); const frontend=resolve(root,"frontend");
if(!await online("http://127.0.0.1:8545",true))start("persistent Ethereum node",blockchain,"node");
await waitFor("Ethereum node","http://127.0.0.1:8545",true);
await run(blockchain,"compile"); await run(blockchain,"deploy");
if(!await online("http://127.0.0.1:4000/health"))start("blockchain API",backend,"start");
await waitFor("Blockchain API","http://127.0.0.1:4000/health");
if(!await online("http://localhost:3000"))start("NexusVerify website",frontend,"dev");
await waitFor("NexusVerify website","http://localhost:3000");

console.log("\nNexusVerify is ready: http://localhost:3000");
console.log(`Registrar access instructions: ${registrarAccessPath}`);
console.log("Keep this window open. Press Ctrl+C to stop the system.\n");
spawn("explorer.exe",["http://localhost:3000"],{detached:true,stdio:"ignore"}).unref();
const stop=()=>{for(const child of children)child.kill("SIGTERM");process.exit(0);};
process.on("SIGINT",stop); process.on("SIGTERM",stop);
setInterval(()=>{},2_147_483_647);

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const children = [];
const commandShell = process.env.ComSpec || "cmd.exe";
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const online = async (url, rpc=false) => { try { const response=await fetch(url,rpc?{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_chainId",params:[]})}:{}); return response.ok; } catch { return false; } };
const npmProcess = (cwd,script) => spawn(commandShell,["/d","/s","/c",`npm.cmd run ${script}`],{cwd,stdio:"inherit",shell:false});
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
console.log("Keep this window open. Press Ctrl+C to stop the system.\n");
spawn("explorer.exe",["http://localhost:3000"],{detached:true,stdio:"ignore"}).unref();
const stop=()=>{for(const child of children)child.kill("SIGTERM");process.exit(0);};
process.on("SIGINT",stop); process.on("SIGTERM",stop);
setInterval(()=>{},2_147_483_647);

import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { createCertificate } from "./certificate.js";
import { addAudit, bindContract, countTranscripts, findTranscript, incrementChecks, insertTranscript, listAudit, listTranscripts, markRevoked, nextCredentialId } from "./database.js";
import { chainStatus, connectChain, issueOnChain, revokeOnChain, signProofPayload, verifyOnChain } from "./chain.js";

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || "127.0.0.1";
const allowedOrigins = new Set((process.env.FRONTEND_URLS || process.env.FRONTEND_URL || "http://localhost:3000").split(",").map(value=>value.trim().replace(/\/$/, "")).filter(Boolean));
const verificationBaseUrl = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
const explorerBaseUrl = (process.env.BLOCK_EXPLORER_URL || "").replace(/\/$/, "");
const adminKey = process.env.ADMIN_API_KEY?.trim() || "";
if (process.env.NODE_ENV === "production" && adminKey.length < 24) throw new Error("ADMIN_API_KEY must contain at least 24 characters in production");
const hashDocument = (content) => createHash("sha256").update(content).digest("hex");
const responseHeaders = (req) => {
  const origin = req.headers.origin?.replace(/\/$/, "");
  const corsOrigin = origin && allowedOrigins.has(origin) ? origin : [...allowedOrigins][0];
  return { "content-type": "application/json", "access-control-allow-origin": corsOrigin, "vary": "Origin", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type,x-admin-key", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-store" };
};
const reply = (req, res, status, value) => { res.writeHead(status, responseHeaders(req)); res.end(status === 204 ? "" : JSON.stringify(value)); };
const binary = (req, res, contentType, filename, value) => { res.writeHead(200, { ...responseHeaders(req), "content-type": contentType, "content-disposition": `attachment; filename="${filename}"`, "content-length": value.length }); res.end(value); };
const isAdmin = (req) => {
  if (!adminKey) return true;
  const candidate = String(req.headers["x-admin-key"] || "");
  if (candidate.length !== adminKey.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(adminKey));
};
const parseBody = (req) => new Promise((resolve, reject) => { let value=""; req.on("data", chunk => { value += chunk; if (value.length > 15_000_000) reject(new Error("Document is too large")); }); req.on("end", () => { try { resolve(value ? JSON.parse(value) : {}); } catch (error) { reject(error); } }); });
const verificationUrlFor = (row) => `${verificationBaseUrl}/?verify=${encodeURIComponent(row.id)}&hash=${encodeURIComponent(row.document_hash)}`;
const present = async (row, qr=false) => {
  const value = { id:row.id,name:row.student_name,matric:row.matric_number,degree:row.programme,award:row.award,date:new Date(row.issued_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}),hash:row.document_hash,tx:row.transaction_hash,block:Number(row.block_number),status:row.status,checks:Number(row.checks),contract:row.contract_address,chainId:Number(row.chain_id),gasUsed:row.gas_used,explorerUrl:explorerBaseUrl?`${explorerBaseUrl}/tx/${row.transaction_hash}`:undefined,revocationTx:row.revocation_tx??undefined,revocationBlock:row.revocation_block??undefined };
  if (qr) value.qrDataUrl = await QRCode.toDataURL(verificationUrlFor(row), { width: 220, margin: 1, color: { dark: "#17243a", light: "#ffffff" } });
  return value;
};

async function signedProof(row) {
  const network = await chainStatus();
  const chain = await verifyOnChain(row.id, row.document_hash);
  const payload = { version:"1.0",issuer:"Accra Technical University",credentialId:row.id,graduateName:row.student_name,matricNumber:row.matric_number,programme:row.programme,award:row.award,documentHash:row.document_hash,status:chain.revoked?"Revoked":chain.authentic?"Active":"Invalid",issuedAt:row.issued_at,transactionHash:row.transaction_hash,blockNumber:Number(row.block_number),contractAddress:row.contract_address,chainId:Number(row.chain_id),network:network.network,verificationUrl:verificationUrlFor(row),explorerTransactionUrl:network.explorerBaseUrl?`${network.explorerBaseUrl}/tx/${row.transaction_hash}`:undefined,verifiedAt:new Date().toISOString() };
  return signProofPayload(payload);
}

async function issueRecord(input, fixedId) {
  const id = fixedId || nextCredentialId();
  const bytes = input.documentBase64 ? Buffer.from(input.documentBase64, "base64") : Buffer.from(input.documentText || JSON.stringify(input));
  const documentHash = hashDocument(bytes);
  const proof = await issueOnChain(id, documentHash);
  const network = await chainStatus();
  const item = { id,studentName:input.studentName.trim(),matricNumber:input.matricNumber.trim().toUpperCase(),programme:input.programme,award:input.award,documentHash,...proof,contractAddress:network.contractAddress,chainId:network.chainId,issuedAt:new Date().toISOString() };
  insertTranscript(item); addAudit("Transcript issued", id, `${item.studentName} · Registrar Office`, proof);
  return present(findTranscript(id), true);
}

async function seed() {
  if (countTranscripts()) return;
  const samples = [
    ["NXV-2026-00482","Amara Okafor","ATU/CS/2021/0842","BTech Computer Science","First Class Honours"],
    ["NXV-2026-00479","Daniel Mensah","ATU/EE/2021/0317","BTech Electrical Engineering","Second Class Upper"],
    ["NXV-2026-00465","Sofia Adeyemi","ATU/BA/2020/0155","BTech Business Administration","Second Class Upper"],
  ];
  for (const [id,studentName,matricNumber,programme,award] of samples) await issueRecord({ studentName,matricNumber,programme,award,documentText:`Official transcript proof for ${id}` }, id);
}

await connectChain();
const initialNetwork = await chainStatus();
bindContract(initialNetwork.contractAddress);
if (process.env.NODE_ENV !== "production" || process.env.SEED_DEMO_DATA === "true") await seed();

createServer(async (req,res) => {
  try {
    const send = (status,value) => reply(req,res,status,value);
    const sendBinary = (contentType,filename,value) => binary(req,res,contentType,filename,value);
    const requireAdmin = () => { if (isAdmin(req)) return false; send(401,{message:"Registrar access key required"}); return true; };
    if (req.method === "OPTIONS") return send(204,{});
    if (req.method === "GET" && req.url === "/health") return send(200,{status:"ok",service:"nexusverify-api",...(await chainStatus()),database:"SQLite persistent",adminProtected:Boolean(adminKey)});
    if (req.method === "GET" && req.url === "/api/transcripts") { if (requireAdmin()) return; return send(200,{records:await Promise.all(listTranscripts().map(row=>present(row)))}); }
    if (req.method === "GET" && req.url === "/api/audit") { if (requireAdmin()) return; return send(200,{events:listAudit()}); }
    if (req.method === "GET" && req.url?.startsWith("/api/proof/")) {
      const id=decodeURIComponent(req.url.split("/").pop()); const row=findTranscript(id); if(!row)return send(404,{message:"Credential not found"});
      const proof=await signedProof(row); addAudit("Signed proof downloaded",row.id,`${row.student_name} - technical JSON`); return send(200,proof);
    }
    if (req.method === "GET" && req.url?.startsWith("/api/certificate/")) {
      const id=decodeURIComponent(req.url.split("/").pop()); const row=findTranscript(id); if(!row)return send(404,{message:"Credential not found"});
      const proof=await signedProof(row); const pdf=await createCertificate(proof); addAudit("Certificate downloaded",row.id,`${row.student_name} - signed PDF`); return sendBinary("application/pdf",`${row.id}-verification-certificate.pdf`,pdf);
    }
    if (req.method === "GET" && req.url?.startsWith("/api/verify/")) {
      const value=decodeURIComponent(req.url.split("/").pop()); const row=findTranscript(value);
      if (!row) { addAudit("Verification failed",null,`Unknown credential: ${value}`); return send(404,{verified:false,message:"Credential not found"}); }
      const chain=await verifyOnChain(row.id,row.document_hash); incrementChecks(row.id); addAudit(chain.authentic?"Transcript verified":"Verification warning",row.id,`${row.student_name} · Public verifier`);
      return send(200,{verified:chain.authentic,revoked:chain.revoked,chain,record:await present(findTranscript(row.id),true)});
    }
    if (req.method === "POST" && req.url === "/api/transcripts") {
      if (requireAdmin()) return;
      const input=await parseBody(req); if(!input.studentName?.trim()||!input.matricNumber?.trim()||!input.programme||!input.award) return send(400,{message:"Graduate name, matriculation number, programme and award are required"});
      return send(201,await issueRecord(input));
    }
    if (req.method === "POST" && req.url?.endsWith("/revoke")) {
      if (requireAdmin()) return;
      const id=decodeURIComponent(req.url.split("/").at(-2)); const row=findTranscript(id); if(!row)return send(404,{message:"Credential not found"}); if(row.status==="Revoked")return send(409,{message:"Credential is already revoked"});
      const proof=await revokeOnChain(id); markRevoked(id,proof); addAudit("Credential revoked",id,`${row.student_name} · Registrar Office`,proof); return send(200,await present(findTranscript(id),true));
    }
    return send(404,{message:"Route not found"});
  } catch (error) { console.error(error); return reply(req,res,500,{message:error.shortMessage||error.message||"Unexpected error"}); }
}).listen(port,host,()=>console.log(`NexusVerify blockchain API ready at http://${host}:${port}`));

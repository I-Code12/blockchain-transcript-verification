import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import { createCertificate } from "./certificate.js";
import { addAudit, approveAccessRequest, bindContract, countTranscripts, createAccessRequest, createTranscriptShare, databaseEngine, denyAccessRequest, findAccessRequestByToken, findTranscript, getTranscriptDocument, hasTranscriptDocument, incrementChecks, insertTranscript, listAccessRequests, listAudit, listTranscripts, markRevoked, nextCredentialId, saveTranscriptDocument, useTranscriptShare } from "./database.js";
import { chainStatus, connectChain, issueOnChain, revokeOnChain, signProofPayload, verifyOnChain } from "./chain.js";
import { decryptTranscript, encryptTranscript, generateShareCode, hashShareCode, isPdf, sanitizeResults } from "./privacy.js";

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || "127.0.0.1";
const allowedOrigins = new Set((process.env.FRONTEND_URLS || process.env.FRONTEND_URL || "http://localhost:3000").split(",").map(value=>value.trim().replace(/\/$/, "")).filter(Boolean));
const verificationBaseUrl = (process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
const explorerBaseUrl = (process.env.BLOCK_EXPLORER_URL || "").replace(/\/$/, "");
const adminKey = process.env.ADMIN_API_KEY?.trim() || "";
const protectedAccessAttempts = new Map();
const protectedAccessWindowMs = 10 * 60_000;
const protectedAccessLimit = 10;
const accessRequestSubmissions = new Map();
const accessRequestWindowMs = 60 * 60_000;
const accessRequestLimit = 5;
if (process.env.NODE_ENV === "production" && adminKey.length < 24) throw new Error("ADMIN_API_KEY must contain at least 24 characters in production");
const hashDocument = (content) => createHash("sha256").update(content).digest("hex");
const responseHeaders = (req) => {
  const origin = req.headers.origin?.replace(/\/$/, "");
  const corsOrigin = origin && allowedOrigins.has(origin) ? origin : [...allowedOrigins][0];
  return { "content-type": "application/json", "access-control-allow-origin": corsOrigin, "vary": "Origin", "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type,x-admin-key,x-transcript-access,x-request-token", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-store" };
};
const reply = (req, res, status, value) => { res.writeHead(status, responseHeaders(req)); res.end(status === 204 ? "" : JSON.stringify(value)); };
const binary = (req, res, contentType, filename, value, disposition="attachment") => { res.writeHead(200, { ...responseHeaders(req), "content-type": contentType, "content-disposition": `${disposition}; filename="${filename}"`, "content-length": value.length }); res.end(value); };
const isAdmin = (req) => {
  if (!adminKey) return true;
  const candidate = String(req.headers["x-admin-key"] || "");
  if (candidate.length !== adminKey.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(adminKey));
};
const parseBody = (req) => new Promise((resolve, reject) => { let value=""; req.on("data", chunk => { value += chunk; if (value.length > 15_000_000) reject(new Error("Document is too large")); }); req.on("end", () => { try { resolve(value ? JSON.parse(value) : {}); } catch (error) { reject(error); } }); });
const protectedAccessKey = (req, transcriptId) => `${String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim()}:${transcriptId}`;
const isProtectedAccessLimited = (req, transcriptId) => {
  const key = protectedAccessKey(req, transcriptId); const now = Date.now(); const state = protectedAccessAttempts.get(key);
  if (!state || now - state.startedAt >= protectedAccessWindowMs) { protectedAccessAttempts.set(key,{startedAt:now,failures:0}); return false; }
  return state.failures >= protectedAccessLimit;
};
const recordProtectedAccessFailure = (req, transcriptId) => {
  const key=protectedAccessKey(req,transcriptId); const now=Date.now(); const state=protectedAccessAttempts.get(key);
  protectedAccessAttempts.set(key,!state||now-state.startedAt>=protectedAccessWindowMs?{startedAt:now,failures:1}:{...state,failures:state.failures+1});
};
const clearProtectedAccessFailures = (req, transcriptId) => protectedAccessAttempts.delete(protectedAccessKey(req,transcriptId));
const recordAccessRequestSubmission = (req, transcriptId) => {
  const key=protectedAccessKey(req,transcriptId); const now=Date.now(); const state=accessRequestSubmissions.get(key);
  if(!state||now-state.startedAt>=accessRequestWindowMs){accessRequestSubmissions.set(key,{startedAt:now,count:1});return true;}
  if(state.count>=accessRequestLimit)return false;
  accessRequestSubmissions.set(key,{...state,count:state.count+1});return true;
};
const cleanText = (value, maximum) => String(value || "").replace(/\s+/g," ").trim().slice(0,maximum);
const verificationUrlFor = (row) => `${verificationBaseUrl}/?verify=${encodeURIComponent(row.id)}&hash=${encodeURIComponent(row.document_hash)}`;
const present = async (row, qr=false) => {
  const value = { id:row.id,name:row.student_name,matric:row.matric_number,degree:row.programme,award:row.award,date:new Date(row.issued_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}),hash:row.document_hash,tx:row.transaction_hash,block:Number(row.block_number),status:row.status,checks:Number(row.checks),contract:row.contract_address,chainId:Number(row.chain_id),gasUsed:row.gas_used,explorerUrl:explorerBaseUrl?`${explorerBaseUrl}/tx/${row.transaction_hash}`:undefined,revocationTx:row.revocation_tx??undefined,revocationBlock:row.revocation_block??undefined,resultsAvailable:await hasTranscriptDocument(row.id) };
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
  const id = fixedId || await nextCredentialId();
  const bytes = input.documentBase64 ? Buffer.from(input.documentBase64, "base64") : Buffer.from(input.documentText || JSON.stringify(input));
  if (bytes.length > 10_000_000) throw new Error("Transcript PDF must be 10 MB or smaller");
  if (input.documentBase64 && !isPdf(bytes)) throw new Error("Only a valid PDF transcript can be stored");
  const results = sanitizeResults(input.results);
  if (results.courses.length && !input.documentBase64) throw new Error("Upload the approved PDF before adding transcript results");
  const protectedDocument = input.documentBase64 ? encryptTranscript(bytes) : null;
  const protectedResults = input.documentBase64 ? encryptTranscript(Buffer.from(JSON.stringify(results))) : null;
  const documentHash = hashDocument(bytes);
  const proof = await issueOnChain(id, documentHash);
  const network = await chainStatus();
  const item = { id,studentName:input.studentName.trim(),matricNumber:input.matricNumber.trim().toUpperCase(),programme:input.programme,award:input.award,documentHash,...proof,contractAddress:network.contractAddress,chainId:network.chainId,issuedAt:new Date().toISOString() };
  await insertTranscript(item);
  if (protectedDocument&&protectedResults) await saveTranscriptDocument({ transcriptId:id,...protectedDocument,contentType:"application/pdf",originalName:String(input.documentName||`${id}-transcript.pdf`).replace(/[^a-z0-9_. -]/gi,"_").slice(0,120),sizeBytes:bytes.length,resultsCiphertext:protectedResults.ciphertext,resultsIv:protectedResults.iv,resultsAuthTag:protectedResults.authTag });
  await addAudit("Transcript issued", id, `${item.studentName} · Registrar Office`, proof);
  if (protectedDocument) await addAudit("Protected transcript stored",id,`${results.courses.length} course results · AES-256-GCM encrypted`);
  return present(await findTranscript(id), true);
}

async function seed() {
  if (await countTranscripts()) return;
  const samples = [
    ["NXV-2026-00482","Amara Okafor","ATU/CS/2021/0842","BTech Computer Science","First Class Honours"],
    ["NXV-2026-00479","Daniel Mensah","ATU/EE/2021/0317","BTech Electrical Engineering","Second Class Upper"],
    ["NXV-2026-00465","Sofia Adeyemi","ATU/BA/2020/0155","BTech Business Administration","Second Class Upper"],
  ];
  for (const [id,studentName,matricNumber,programme,award] of samples) await issueRecord({ studentName,matricNumber,programme,award,documentText:`Official transcript proof for ${id}` }, id);
}

await connectChain();
const initialNetwork = await chainStatus();
await bindContract(initialNetwork.contractAddress);
if (process.env.NODE_ENV !== "production" || process.env.SEED_DEMO_DATA === "true") await seed();

createServer(async (req,res) => {
  try {
    const send = (status,value) => reply(req,res,status,value);
    const sendBinary = (contentType,filename,value,disposition) => binary(req,res,contentType,filename,value,disposition);
    const requireAdmin = () => { if (isAdmin(req)) return false; send(401,{message:"Registrar access key required"}); return true; };
    const requestUrl = new URL(req.url || "/", "http://localhost");
    if (req.method === "OPTIONS") return send(204,{});
    if (req.method === "GET" && req.url === "/health") return send(200,{status:"ok",service:"nexusverify-api",...(await chainStatus()),database:databaseEngine,adminProtected:Boolean(adminKey)});
    if (req.method === "GET" && req.url === "/api/transcripts") { if (requireAdmin()) return; return send(200,{records:await Promise.all((await listTranscripts()).map(row=>present(row)))}); }
    if (req.method === "GET" && req.url === "/api/audit") { if (requireAdmin()) return; return send(200,{events:await listAudit()}); }
    if (req.method === "GET" && requestUrl.pathname === "/api/access-requests") {
      if (requireAdmin()) return;
      return send(200,{requests:await listAccessRequests()});
    }
    if (req.method === "GET" && requestUrl.pathname === "/api/access-requests/status") {
      const token=String(req.headers["x-request-token"]||"").trim();
      if(token.length<20)return send(401,{message:"A valid private request link is required"});
      const accessRequest=await findAccessRequestByToken(hashShareCode(token));
      if(!accessRequest)return send(404,{message:"Access request not found"});
      const status=accessRequest.status==="Approved"&&accessRequest.access_expires_at&&accessRequest.access_expires_at<=new Date().toISOString()?"Expired":accessRequest.status;
      return send(200,{requestId:Number(accessRequest.id),credentialId:accessRequest.transcript_id,status,requesterName:accessRequest.requester_name,organization:accessRequest.organization,purpose:accessRequest.purpose,createdAt:accessRequest.created_at,expiresAt:accessRequest.expires_at,accessExpiresAt:accessRequest.access_expires_at});
    }
    const requestDecisionMatch=requestUrl.pathname.match(/^\/api\/access-requests\/(\d+)\/(approve|deny)$/);
    if(requestDecisionMatch&&req.method==="POST"){
      if(requireAdmin())return;
      const requestId=Number(requestDecisionMatch[1]); const action=requestDecisionMatch[2];
      if(action==="approve"){
        const input=await parseBody(req); const minutes=Math.max(5,Math.min(1440,Number(input.minutes)||60)); const accessExpiresAt=new Date(Date.now()+minutes*60_000).toISOString();
        const updated=await approveAccessRequest(requestId,accessExpiresAt);
        await addAudit("Transcript access approved",updated.transcript_id,`Request #${requestId} - access expires ${new Date(accessExpiresAt).toLocaleString("en-GB")}`);
        return send(200,{requestId,status:updated.status,credentialId:updated.transcript_id,accessExpiresAt});
      }
      const updated=await denyAccessRequest(requestId); if(!updated)return send(404,{message:"Pending access request not found"});
      await addAudit("Transcript access denied",updated.transcript_id,`Request #${requestId}`);
      return send(200,{requestId,status:updated.status,credentialId:updated.transcript_id});
    }
    if (req.method === "GET" && req.url?.startsWith("/api/proof/")) {
      const id=decodeURIComponent(req.url.split("/").pop()); const row=await findTranscript(id); if(!row)return send(404,{message:"Credential not found"});
      const proof=await signedProof(row); await addAudit("Signed proof downloaded",row.id,`${row.student_name} - technical JSON`); return send(200,proof);
    }
    if (req.method === "GET" && req.url?.startsWith("/api/certificate/")) {
      const id=decodeURIComponent(req.url.split("/").pop()); const row=await findTranscript(id); if(!row)return send(404,{message:"Credential not found"});
      const proof=await signedProof(row); const pdf=await createCertificate(proof); await addAudit("Certificate downloaded",row.id,`${row.student_name} - signed PDF`); return sendBinary("application/pdf",`${row.id}-verification-certificate.pdf`,pdf);
    }
    if (req.method === "GET" && req.url?.startsWith("/api/verify/")) {
      const value=decodeURIComponent(req.url.split("/").pop()); const row=await findTranscript(value);
      if (!row) { await addAudit("Verification failed",null,`Unknown credential: ${value}`); return send(404,{verified:false,message:"Credential not found"}); }
      const chain=await verifyOnChain(row.id,row.document_hash); await incrementChecks(row.id); await addAudit(chain.authentic?"Transcript verified":"Verification warning",row.id,`${row.student_name} · Public verifier`);
      return send(200,{verified:chain.authentic,revoked:chain.revoked,chain,record:await present(await findTranscript(row.id),true)});
    }
    const protectedMatch = requestUrl.pathname.match(/^\/api\/transcripts\/([^/]+)\/(share|results|document)$/);
    if (protectedMatch) {
      const id=decodeURIComponent(protectedMatch[1]); const action=protectedMatch[2];
      if(req.method==="POST"&&action==="share"&&requireAdmin())return;
      const row=await findTranscript(id);
      if(!row)return send(404,{message:"Credential not found"});
      const document=await getTranscriptDocument(row.id); if(!document)return send(404,{message:"No protected transcript is stored for this credential"});
      if(req.method==="POST"&&action==="share"){
        const input=await parseBody(req); const minutes=Math.max(5,Math.min(1440,Number(input.minutes)||30));
        const code=generateShareCode(); const expiresAt=new Date(Date.now()+minutes*60_000).toISOString();
        await createTranscriptShare(row.id,hashShareCode(code),expiresAt); const accessUrl=`${verificationBaseUrl}/?verify=${encodeURIComponent(row.id)}#access=${encodeURIComponent(code)}`;
        await addAudit("Protected transcript shared",row.id,`Access expires ${new Date(expiresAt).toLocaleString("en-GB")}`);
        return send(201,{credentialId:row.id,accessCode:code,accessUrl,expiresAt});
      }
      if(req.method==="GET"&&(action==="results"||action==="document")){
        if(isProtectedAccessLimited(req,row.id)){await addAudit("Protected transcript access rate-limited",row.id,"Too many invalid access attempts");return send(429,{message:"Too many invalid access attempts. Try again in 10 minutes"});}
        const code=String(req.headers["x-transcript-access"]||""); const share=code.length>=20?await useTranscriptShare(row.id,hashShareCode(code)):null;
        if(!share){recordProtectedAccessFailure(req,row.id);await addAudit("Protected transcript access denied",row.id,"Missing, invalid or expired share code");return send(401,{message:"A valid, unexpired transcript access code is required"});}
        clearProtectedAccessFailures(req,row.id);
        if(action==="results"){
          await addAudit("Protected results viewed",row.id,"Authorised temporary access");
          const results=JSON.parse(decryptTranscript({ciphertext:document.results_ciphertext,iv:document.results_iv,auth_tag:document.results_auth_tag}).toString("utf8"));
          return send(200,{credentialId:row.id,name:row.student_name,matric:row.matric_number,programme:row.programme,award:row.award,status:row.status,documentHash:row.document_hash,results,expiresAt:share.expires_at,documentAvailable:true});
        }
        const pdf=decryptTranscript(document); await addAudit("Protected transcript PDF viewed",row.id,"Authorised temporary access");
        return sendBinary("application/pdf",document.original_name,pdf,"inline");
      }
    }
    const accessRequestMatch=requestUrl.pathname.match(/^\/api\/transcripts\/([^/]+)\/access-requests$/);
    if(accessRequestMatch&&req.method==="POST"){
      const id=decodeURIComponent(accessRequestMatch[1]); const row=await findTranscript(id);
      if(!row)return send(404,{message:"Credential not found"});
      if(!await hasTranscriptDocument(row.id))return send(404,{message:"No protected transcript is stored for this credential"});
      if(!recordAccessRequestSubmission(req,row.id))return send(429,{message:"Too many access requests. Try again later"});
      const input=await parseBody(req); const requesterName=cleanText(input.requesterName,80); const organization=cleanText(input.organization,120); const purpose=cleanText(input.purpose,500);
      if(requesterName.length<2||organization.length<2||purpose.length<10)return send(400,{message:"Requester name, organisation and a clear reason are required"});
      const token=generateShareCode(); const expiresAt=new Date(Date.now()+24*60*60_000).toISOString();
      const accessRequest=await createAccessRequest({transcriptId:row.id,tokenHash:hashShareCode(token),requesterName,organization,purpose,expiresAt});
      const requestUrl=`${verificationBaseUrl}/?verify=${encodeURIComponent(row.id)}#request=${encodeURIComponent(token)}`;
      await addAudit("Transcript access requested",row.id,`${organization} - request #${accessRequest.id}`);
      return send(201,{requestId:Number(accessRequest.id),credentialId:row.id,status:"Pending",requestToken:token,requestUrl,createdAt:accessRequest.created_at,expiresAt});
    }
    if (req.method === "POST" && req.url === "/api/transcripts") {
      if (requireAdmin()) return;
      const input=await parseBody(req); if(!input.studentName?.trim()||!input.matricNumber?.trim()||!input.programme||!input.award) return send(400,{message:"Graduate name, matriculation number, programme and award are required"});
      return send(201,await issueRecord(input));
    }
    if (req.method === "POST" && req.url?.endsWith("/revoke")) {
      if (requireAdmin()) return;
      const id=decodeURIComponent(req.url.split("/").at(-2)); const row=await findTranscript(id); if(!row)return send(404,{message:"Credential not found"}); if(row.status==="Revoked")return send(409,{message:"Credential is already revoked"});
      const proof=await revokeOnChain(id); await markRevoked(id,proof); await addAudit("Credential revoked",id,`${row.student_name} · Registrar Office`,proof); return send(200,await present(await findTranscript(id),true));
    }
    return send(404,{message:"Route not found"});
  } catch (error) { console.error(error); return reply(req,res,500,{message:error.shortMessage||error.message||"Unexpected error"}); }
}).listen(port,host,()=>console.log(`NexusVerify blockchain API ready at http://${host}:${port}`));

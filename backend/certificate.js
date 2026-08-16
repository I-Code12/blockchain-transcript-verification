import PDFDocument from "pdfkit";
import QRCode from "qrcode";

const BLUE = "#3B6EA8";
const NAVY = "#17243A";
const PALE = "#EDF3FB";
const MUTED = "#66758E";
const GREEN = "#287A5A";
const RED = "#A34848";

export async function createCertificate(signedProof) {
  const { payload, proofHash, signature, registrarAddress } = signedProof;
  const verificationUrl = payload.verificationUrl;
  const qr = await QRCode.toBuffer(verificationUrl, { width: 500, margin: 1, color: { dark: NAVY, light: "#FFFFFF" } });
  const doc = new PDFDocument({ size: "A4", margin: 0, info: { Title: `${payload.credentialId} Blockchain Verification Certificate`, Author: "Accra Technical University - NexusVerify", Subject: "Blockchain transcript verification proof", Keywords: "blockchain transcript verification Accra Technical University" } });
  const chunks = [];
  doc.on("data", chunk => chunks.push(chunk));
  const complete = new Promise((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });

  doc.rect(0, 0, 595.28, 842).fill("#F8FAFD");
  doc.rect(0, 0, 595.28, 128).fill(NAVY);
  doc.rect(0, 124, 595.28, 4).fill(BLUE);
  doc.roundedRect(42, 36, 52, 52, 12).fill(BLUE);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(28).text("N", 58, 48);
  doc.fontSize(10).fillColor("#AFC3E2").text("ACCRA TECHNICAL UNIVERSITY", 112, 38, { characterSpacing: 1.3 });
  doc.font("Helvetica-Bold").fontSize(24).fillColor("#FFFFFF").text("Blockchain Verification Certificate", 112, 57);
  doc.font("Helvetica").fontSize(9).fillColor("#C7D3E6").text("NexusVerify Academic Trust Network", 112, 89);

  const statusColor = payload.status === "Active" ? GREEN : RED;
  doc.roundedRect(42, 153, 511, 52, 10).fill(PALE);
  doc.circle(68, 179, 15).fill(statusColor);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(14).text(payload.status === "Active" ? "V" : "!", 59, 174, { width: 18, align: "center" });
  doc.fillColor(statusColor).fontSize(9).text(payload.status === "Active" ? "AUTHENTIC ON-CHAIN CREDENTIAL" : "REVOKED ON-CHAIN CREDENTIAL", 94, 164, { characterSpacing: 1 });
  doc.fillColor(NAVY).fontSize(13).text(payload.status === "Active" ? "Smart contract verification successful" : "Smart contract confirms this credential is revoked", 94, 180);

  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(8).text("GRADUATE", 42, 230, { characterSpacing: 1 });
  doc.fillColor(NAVY).fontSize(22).text(payload.graduateName, 42, 244, { width: 355 });
  doc.fillColor(MUTED).font("Helvetica").fontSize(10).text(payload.matricNumber, 42, 273);
  doc.image(qr, 427, 222, { fit: [126, 126] });
  doc.fillColor(MUTED).fontSize(7).text("SCAN TO VERIFY LIVE STATUS", 427, 351, { width: 126, align: "center" });

  doc.roundedRect(42, 302, 355, 101, 8).fill("#FFFFFF").strokeColor("#DFE6F0").stroke();
  field(doc, "QUALIFICATION", payload.programme, 58, 319, 160);
  field(doc, "CLASSIFICATION", payload.award, 220, 319, 155);
  field(doc, "ISSUING INSTITUTION", payload.issuer, 58, 361, 220);
  field(doc, "ISSUED", payload.issuedAt.slice(0, 10), 285, 361, 90);

  sectionTitle(doc, "BLOCKCHAIN EVIDENCE", 42, 432);
  proofLine(doc, "Credential ID", payload.credentialId, 42, 454);
  proofLine(doc, "SHA-256 document hash", payload.documentHash, 42, 484, true);
  proofLine(doc, "Issuance transaction", payload.transactionHash, 42, 526, true);
  proofLine(doc, "Smart contract", payload.contractAddress, 42, 568, true);
  proofLine(doc, "Network", `${payload.network} - Chain ID ${payload.chainId} - Block ${payload.blockNumber}`, 42, 610);

  sectionTitle(doc, "REGISTRAR SIGNATURE SEAL", 42, 650);
  doc.roundedRect(42, 669, 511, 88, 8).fill("#FFFFFF").strokeColor("#DFE6F0").stroke();
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(7).text("PROOF HASH", 56, 683, { characterSpacing: .8 });
  doc.fillColor(NAVY).font("Courier").fontSize(7).text(proofHash, 56, 695, { width: 480 });
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(7).text("ETHEREUM SIGNATURE", 56, 716, { characterSpacing: .8 });
  doc.fillColor(NAVY).font("Courier").fontSize(6.5).text(signature, 56, 728, { width: 480 });
  doc.fillColor(MUTED).font("Helvetica").fontSize(7).text(`Registrar: ${registrarAddress}`, 56, 747, { width: 480 });

  doc.moveTo(42, 783).lineTo(553, 783).strokeColor("#DDE4EE").stroke();
  doc.fillColor(MUTED).font("Helvetica").fontSize(7.5).text("Integrity notice: this certificate is a portable receipt. Current authenticity is determined by the TranscriptRegistry smart contract. Scan the QR code to check live status.", 42, 795, { width: 511, align: "center", lineGap: 2 });
  doc.end();
  return complete;
}

function field(doc, label, value, x, y, width) { doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(7).text(label, x, y, { width, characterSpacing: .7 }); doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(9).text(value, x, y + 12, { width, ellipsis: true }); }
function sectionTitle(doc, title, x, y) { doc.fillColor(BLUE).font("Helvetica-Bold").fontSize(8).text(title, x, y, { characterSpacing: 1.2 }); doc.moveTo(x + 166, y + 4).lineTo(553, y + 4).strokeColor("#D6DFEC").stroke(); }
function proofLine(doc, label, value, x, y, mono=false) { doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(7).text(label.toUpperCase(), x, y, { width: 135, characterSpacing: .6 }); doc.fillColor(NAVY).font(mono ? "Courier" : "Helvetica-Bold").fontSize(mono ? 7 : 8).text(value, x + 140, y - 1, { width: 371, lineBreak: false, ellipsis: true }); }

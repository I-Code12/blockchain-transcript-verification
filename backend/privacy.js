import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const MAX_RESULTS = 80;
const text = (value, max) => String(value ?? "").trim().slice(0, max);

export function encryptionKey(value = process.env.TRANSCRIPT_ENCRYPTION_KEY) {
  const raw = String(value || "").trim();
  const decoded = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (decoded.length !== 32) throw new Error("TRANSCRIPT_ENCRYPTION_KEY must be a 32-byte hex or base64 secret");
  return decoded;
}

export function encryptTranscript(value, keyValue) {
  const key = encryptionKey(keyValue);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag() };
}

export function decryptTranscript(record, keyValue) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(keyValue), Buffer.from(record.iv));
  decipher.setAuthTag(Buffer.from(record.auth_tag));
  return Buffer.concat([decipher.update(Buffer.from(record.ciphertext)), decipher.final()]);
}

export function generateShareCode() {
  return randomBytes(18).toString("base64url");
}

export function hashShareCode(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

export function sanitizeResults(input = {}) {
  const rows = Array.isArray(input.courses) ? input.courses.slice(0, MAX_RESULTS) : [];
  const courses = rows.map((row) => ({
    code: text(row.code, 24),
    title: text(row.title, 120),
    credits: Math.max(0, Math.min(20, Number(row.credits) || 0)),
    grade: text(row.grade, 12).toUpperCase(),
    semester: text(row.semester, 40),
  })).filter((row) => row.code && row.title && row.grade);
  const cgpaValue = Number(input.cgpa);
  return {
    cgpa: Number.isFinite(cgpaValue) ? Math.max(0, Math.min(5, cgpaValue)) : null,
    academicYear: text(input.academicYear, 30),
    courses,
  };
}

export function isPdf(value) {
  const bytes = Buffer.from(value);
  return bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
}

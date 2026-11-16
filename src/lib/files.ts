/**
 * Lesson files are stored in Firestore in chunks (Firebase Storage needs a paid plan).
 * Each chunk is a Bytes field under 1 MiB (Firestore's document limit).
 */
export const CHUNK_SIZE = 900 * 1024;
export const MAX_FILE_SIZE = 8 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".ppt", ".pptx", ".odt", ".odp"];

export function splitBytes(data: Uint8Array, size = CHUNK_SIZE): Uint8Array[] {
  const parts: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += size) parts.push(data.subarray(i, i + size));
  return parts.length ? parts : [new Uint8Array(0)];
}

export function joinBytes(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Why a file can't be uploaded (null = OK). */
export function fileProblem(name: string, size: number): string | null {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) return `סוג קובץ לא נתמך (${ext || "ללא סיומת"}). אפשר: PDF, Word, PowerPoint.`;
  if (size === 0) return "הקובץ ריק";
  if (size > MAX_FILE_SIZE) return `הקובץ גדול מדי (${formatSize(size)}). הגודל המרבי הוא ${formatSize(MAX_FILE_SIZE)}.`;
  return null;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".odp": "application/vnd.oasis.opendocument.presentation",
};
export const mimeFor = (name: string) => MIME[name.slice(name.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream";

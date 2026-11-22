import { Bytes, collection, doc, getDocs, orderBy, query, writeBatch, type WriteBatch } from "firebase/firestore";
import { db } from "./firebase";
import { fileProblem, joinBytes, mimeFor, splitBytes } from "./files";
import { UserError } from "./actions";

/**
 * Upload / download lesson files stored as chunks in Firestore.
 * `startBatch` returns a new write batch for each group of chunks.
 */
export type BatchStarter = () => { b: WriteBatch; proofId: string | null };

const CHUNKS_PER_BATCH = 3; // ~2.7 MB per write (Firestore allows 10 MB per request)

export async function uploadLessonFile(
  lessonId: string,
  file: File,
  uploadedBy: string | null,
  startBatch: BatchStarter,
  onProgress?: (done: number, total: number) => void,
): Promise<{ fileId: string; name: string; size: number }> {
  const problem = fileProblem(file.name, file.size);
  if (problem) throw new UserError(problem);
  const parts = splitBytes(new Uint8Array(await file.arrayBuffer()));
  const fileRef = doc(collection(db, "lessonFiles"));

  for (let i = 0; i < parts.length; i += CHUNKS_PER_BATCH) {
    const { b, proofId } = startBatch();
    if (i === 0) {
      b.set(fileRef, {
        lessonId,
        name: file.name.slice(0, 200),
        size: file.size,
        mimeType: mimeFor(file.name),
        chunkCount: parts.length,
        uploadedBy,
        proofId,
        createdAt: Date.now(),
      });
    }
    parts.slice(i, i + CHUNKS_PER_BATCH).forEach((part, k) => {
      const n = i + k;
      b.set(doc(db, `lessonFiles/${fileRef.id}/chunks/${n}`), { data: Bytes.fromUint8Array(part), n, lessonId, proofId });
    });
    await b.commit();
    onProgress?.(Math.min(i + CHUNKS_PER_BATCH, parts.length), parts.length);
  }
  return { fileId: fileRef.id, name: file.name.slice(0, 200), size: file.size };
}

/** Manager only (rules): rebuild the file and save it to the computer. */
export async function downloadLessonFile(fileId: string, name: string, mimeType: string) {
  const snap = await getDocs(query(collection(db, `lessonFiles/${fileId}/chunks`), orderBy("n")));
  if (snap.empty) throw new UserError("הקובץ כבר לא שמור במערכת (נשמרות 3 הגרסאות האחרונות)");
  const bytes = joinBytes(snap.docs.map((d) => (d.get("data") as Bytes).toUint8Array()));
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mimeType }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const adminBatch: BatchStarter = () => ({ b: writeBatch(db), proofId: null });

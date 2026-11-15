/**
 * Parses pasted lines of "name, email, team" (team optional) for adding many workers at once.
 * Accepts commas, semicolons or tabs, so rows pasted from Excel / Google Sheets work too.
 * Pure function: nothing is saved unless every line is valid.
 */
export type WorkerRow = { line: number; name: string; email: string; team: string | null };
export type ParseResult = { rows: WorkerRow[]; errors: string[] };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseWorkerLines(text: string, existingEmails: Iterable<string> = []): ParseResult {
  const taken = new Set([...existingEmails].map((e) => e.toLowerCase()));
  const seen = new Set<string>();
  const rows: WorkerRow[] = [];
  const errors: string[] = [];

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const parts = raw.split(/[,;\t]/).map((p) => p.trim());
    const [name = "", emailRaw = "", team = ""] = parts;
    const email = emailRaw.toLowerCase();
    if (!name) return errors.push(`שורה ${line}: חסר שם`);
    if (!EMAIL.test(email)) return errors.push(`שורה ${line}: כתובת מייל לא תקינה (${emailRaw || "ריק"})`);
    if (taken.has(email)) return errors.push(`שורה ${line}: ${email} כבר קיים/ת במערכת`);
    if (seen.has(email)) return errors.push(`שורה ${line}: ${email} מופיע/ה פעמיים ברשימה`);
    seen.add(email);
    rows.push({ line, name, email, team: team || null });
  });

  if (!rows.length && !errors.length) errors.push("לא הוזנו עובדים");
  return { rows, errors };
}

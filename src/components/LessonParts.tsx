import { useEffect, useRef, useState } from "react";
import { ALLERGENS, HAZARD_ICON, HAZARDS, SAFETY, allergenNames, missingAllergenInfo, summarizeLesson } from "@/lib/allergens";
import { ACTIVITY_KIND, ITEM_FOR_LABEL, LESSON_STATUS, LESSON_TONE, newItemId } from "@/lib/lessons";
import { ACTIVITY_KINDS, ITEM_FOR, type Lesson, type LessonActivity, type LessonItem, type LessonStatus } from "@/lib/types";

// ---------------------------------------------------------------- read-only bits

export function LessonStatusBadge({ status }: { status: LessonStatus }) {
  return <span className={`badge ${LESSON_TONE[status]}`}>{LESSON_STATUS[status]}</span>;
}

/** "⚠ מכיל מזון", allergens and hazard icons for a lesson. Shown everywhere a lesson appears. */
export function SafetyTags({ lesson, showNone }: { lesson: Pick<Lesson, "equipment" | "safety">; showNone?: boolean }) {
  const s = summarizeLesson(lesson);
  const names = allergenNames(s);
  if (!s.food && !names.length && !s.hazards.length && !s.itemsMissingAllergenInfo.length) {
    return showNone ? <span className="muted small">אין אלרגנים או חומרים מסוכנים ברשימה</span> : null;
  }
  return (
    <span className="row" style={{ gap: ".3rem" }}>
      {s.food && <span className="badge amber wrap">⚠ מכיל מזון</span>}
      {names.length > 0 && <span className="badge red wrap">אלרגנים: {names.join(", ")}</span>}
      {s.itemsMissingAllergenInfo.length > 0 && <span className="badge red wrap">חסר מידע על אלרגנים</span>}
      {s.hazards.length > 0 && (
        <span className="badge gray wrap" title={s.hazards.map((h) => HAZARDS[h]).join(", ")}>
          {s.hazards.map((h) => `${HAZARD_ICON[h]} ${HAZARDS[h]}`).join(" · ")}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- equipment editor

const emptyItem = (name = "", quantity = ""): LessonItem => ({
  id: newItemId(),
  name,
  quantity,
  for: "INSTRUCTOR",
  food: false,
  allergens: [],
  allergenOther: null,
  noKnownAllergens: false,
  hazards: [],
  toOrder: false,
  notes: null,
});

/** Parses pasted lines "item, quantity" (or tab-separated, or just the item name). */
export function parseItemLines(text: string): LessonItem[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s•\-–*o❖●]+/, "").trim())
    .filter(Boolean)
    .map((l) => {
      const [name, qty = ""] = l.split(/\t|,(?=[^,]*$)/).map((p) => p.trim());
      return emptyItem(name.slice(0, 200), qty.slice(0, 50));
    });
}

function TagPicker({
  label,
  options,
  value,
  onChange,
  icons,
}: {
  label: string;
  options: Record<string, string>;
  value: string[];
  onChange: (v: string[]) => void;
  icons?: Record<string, string>;
}) {
  // Close the list after a click anywhere outside it. Uses "click" (not "mousedown"): closing
  // on mousedown shifts the layout and the click would land on a different element.
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  return (
    <details className="tag-picker" ref={ref}>
      <summary className="small">
        {label}
        {value.length ? `: ${value.map((v) => (icons?.[v] ? `${icons[v]} ` : "") + options[v]).join(", ")}` : ": —"}
      </summary>
      <div className="tag-options">
        {Object.entries(options).map(([k, v]) => (
          <label key={k} className="check small">
            <input
              type="checkbox"
              checked={value.includes(k)}
              onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))}
            />
            {icons?.[k] ? `${icons[k]} ` : ""}
            {v}
          </label>
        ))}
      </div>
    </details>
  );
}

/**
 * The lesson's equipment list. Kept in state and sent as a hidden JSON field "equipment".
 * Re-mount (key) to reset.
 */
export function EquipmentEditor({ initial }: { initial: LessonItem[] }) {
  const [items, setItems] = useState<LessonItem[]>(initial);
  const [paste, setPaste] = useState("");
  const set = (id: string, patch: Partial<LessonItem>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  return (
    <div>
      <input type="hidden" name="equipment" value={JSON.stringify(items)} />
      {items.length === 0 && <p className="muted small">עוד אין פריטים ברשימת הציוד.</p>}
      <div className="equip-list">
        {items.map((it, idx) => (
          <div key={it.id} className={`equip-row${missingAllergenInfo(it) ? " warn" : ""}`}>
            <span className="muted small">{idx + 1}.</span>
            <input aria-label="פריט" placeholder="פריט (למשל: מי חמצן 30%)" value={it.name} maxLength={200} onChange={(e) => set(it.id, { name: e.target.value })} style={{ flex: "2 1 180px" }} />
            <input aria-label="כמות" placeholder="כמות" value={it.quantity} maxLength={50} onChange={(e) => set(it.id, { quantity: e.target.value })} style={{ flex: "0 1 90px" }} />
            <select aria-label="למי" value={it.for} onChange={(e) => set(it.id, { for: e.target.value as LessonItem["for"] })} style={{ flex: "0 1 120px" }}>
              {ITEM_FOR.map((f) => <option key={f} value={f}>{ITEM_FOR_LABEL[f]}</option>)}
            </select>
            <label className="check small"><input type="checkbox" checked={it.food} onChange={(e) => set(it.id, { food: e.target.checked })} /> מזון</label>
            <label className="check small"><input type="checkbox" checked={it.toOrder} onChange={(e) => set(it.id, { toOrder: e.target.checked })} /> צריך להזמין</label>
            <button type="button" className="btn ghost sm" aria-label="הסרת פריט" onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))}>✕</button>
            <div className="equip-tags">
              <TagPicker label="אלרגנים" options={ALLERGENS} value={it.allergens} onChange={(v) => set(it.id, { allergens: v, noKnownAllergens: v.length ? false : it.noKnownAllergens })} />
              {it.allergens.includes("OTHER") && (
                <input aria-label="אלרגן אחר" placeholder="איזה אלרגן?" value={it.allergenOther ?? ""} maxLength={100} onChange={(e) => set(it.id, { allergenOther: e.target.value })} style={{ maxWidth: 160 }} />
              )}
              {it.food && it.allergens.length === 0 && (
                <label className="check small"><input type="checkbox" checked={it.noKnownAllergens} onChange={(e) => set(it.id, { noKnownAllergens: e.target.checked })} /> ללא אלרגנים ידועים</label>
              )}
              <TagPicker label="סכנות" options={HAZARDS} icons={HAZARD_ICON} value={it.hazards} onChange={(v) => set(it.id, { hazards: v })} />
              <input aria-label="הערות לפריט" placeholder="הערות" value={it.notes ?? ""} maxLength={300} onChange={(e) => set(it.id, { notes: e.target.value || null })} style={{ flex: "1 1 140px" }} />
            </div>
            {missingAllergenInfo(it) && <div className="danger-text small" style={{ flexBasis: "100%" }}>פריט מזון: יש לסמן אלרגנים או "ללא אלרגנים ידועים"</div>}
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: ".5rem" }}>
        <button type="button" className="btn ghost sm" onClick={() => setItems((xs) => [...xs, emptyItem()])}>+ הוספת פריט</button>
      </div>
      <details style={{ marginTop: ".5rem" }}>
        <summary className="small">הדבקת רשימה (שורה לכל פריט: "פריט, כמות")</summary>
        <textarea
          aria-label="הדבקת רשימת ציוד"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={5}
          dir="auto"
          placeholder={"מי חמצן 30%, 20 מ\"ל\nסבון נוזלי\nמלח KI, חצי כפית"}
        />
        <button
          type="button"
          className="btn secondary sm"
          style={{ marginTop: ".4rem" }}
          onClick={() => {
            const added = parseItemLines(paste);
            if (added.length) setItems((xs) => [...xs, ...added]);
            setPaste("");
          }}
        >
          הוספת הפריטים לרשימה
        </button>
      </details>
    </div>
  );
}

/** Parts of the lesson (demo / hands-on / …). Hidden JSON field "activities". */
export function ActivitiesEditor({ initial }: { initial: LessonActivity[] }) {
  const [rows, setRows] = useState<LessonActivity[]>(initial);
  const set = (id: string, patch: Partial<LessonActivity>) => setRows((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  return (
    <div>
      <input type="hidden" name="activities" value={JSON.stringify(rows)} />
      <ol style={{ margin: 0, paddingInlineStart: "1.3rem", display: "grid", gap: ".35rem" }}>
        {rows.map((r) => (
          <li key={r.id}>
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <select aria-label="סוג החלק" value={r.kind} onChange={(e) => set(r.id, { kind: e.target.value as LessonActivity["kind"] })} style={{ width: "auto" }}>
                {ACTIVITY_KINDS.map((k) => <option key={k} value={k}>{ACTIVITY_KIND[k]}</option>)}
              </select>
              <input aria-label="שם החלק" placeholder="למשל: הר געש" value={r.title} maxLength={150} onChange={(e) => set(r.id, { title: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
              <button type="button" className="btn ghost sm" aria-label="הסרה" onClick={() => setRows((xs) => xs.filter((x) => x.id !== r.id))}>✕</button>
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="btn ghost sm" style={{ marginTop: ".4rem" }} onClick={() => setRows((xs) => [...xs, { id: newItemId(), kind: "DEMO", title: "" }])}>
        + הוספת חלק
      </button>
    </div>
  );
}

/** Safety requirements as checkboxes (name="safety"), with a hint from the hazards. */
export function SafetyChecks({ initial, suggested }: { initial: string[]; suggested: string[] }) {
  return (
    <div>
      <div className="row" style={{ gap: ".25rem 1rem" }}>
        {Object.entries(SAFETY).map(([k, v]) => (
          <label key={k} className="check small">
            <input type="checkbox" name="safety" value={k} defaultChecked={initial.includes(k)} /> {v}
            {suggested.includes(k) && !initial.includes(k) && <span className="badge amber">מומלץ</span>}
          </label>
        ))}
      </div>
    </div>
  );
}

/** Reads the hidden JSON fields written by the editors above. */
export function readJsonField<T>(fd: FormData, name: string): T[] {
  const v = fd.get(name);
  if (typeof v !== "string" || !v) return [];
  try {
    const x = JSON.parse(v);
    return Array.isArray(x) ? (x as T[]) : [];
  } catch {
    return [];
  }
}

/** Cleans editor rows before saving. */
export function cleanItems(items: LessonItem[]): LessonItem[] {
  return items
    .filter((i) => i.name.trim() || i.quantity.trim())
    .map((i) => ({
      ...i,
      name: i.name.trim().slice(0, 200),
      quantity: (i.quantity ?? "").trim().slice(0, 50),
      allergens: i.allergens.filter((a) => a in ALLERGENS),
      allergenOther: i.allergens.includes("OTHER") ? (i.allergenOther?.trim() || null) : null,
      noKnownAllergens: i.food && !i.allergens.length ? !!i.noKnownAllergens : false,
      hazards: i.hazards.filter((h) => h in HAZARDS),
      notes: i.notes?.trim() || null,
    }));
}

export function cleanActivities(rows: LessonActivity[]): LessonActivity[] {
  return rows.filter((r) => r.title.trim()).map((r) => ({ ...r, title: r.title.trim().slice(0, 150) }));
}

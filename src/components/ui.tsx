import { TONE } from "@/lib/labels";
export { FlashBox } from "./Flash";

export function Badge({ value, label }: { value: string; label: string }) {
  return <span className={`badge ${TONE[value] ?? "gray"}`}>{label}</span>;
}

export function Stat({ num, label, alert }: { num: number | string; label: string; alert?: boolean }) {
  return (
    <div className={`stat${alert ? " alert" : ""}`}>
      <div className="num">{num}</div>
      <div className="lbl">{label}</div>
    </div>
  );
}

export function Options({ map, includeEmpty }: { map: Record<string, string>; includeEmpty?: string }) {
  return (
    <>
      {includeEmpty !== undefined && <option value="">{includeEmpty}</option>}
      {Object.entries(map).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </>
  );
}

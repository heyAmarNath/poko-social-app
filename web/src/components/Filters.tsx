import { useSearchParams } from "react-router";
import { usePeople, usePlatforms } from "../lib/data";
import type { TargetRow } from "../lib/types";

/** Platform + person filters stored in the URL so views are shareable. */
export function useFilters() {
  const [sp, setSp] = useSearchParams();
  const platform = sp.get("platform");
  const person = sp.get("person");
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    v ? n.set(k, v) : n.delete(k);
    setSp(n, { replace: true });
  };
  const apply = (rows: TargetRow[]) =>
    rows.filter(
      (t) =>
        (!platform || String(t.platform_id) === platform) &&
        (!person || [t.writer_id, t.creative_id, t.manager_id].map(String).includes(person)),
    );
  return { platform, person, set, apply };
}

export function FilterBar({ f }: { f: ReturnType<typeof useFilters> }) {
  const platforms = usePlatforms().data ?? [];
  const people = usePeople().data ?? [];
  return (
    <div className="flex flex-wrap gap-2">
      <select className="input w-auto" value={f.platform ?? ""} onChange={(e) => f.set("platform", e.target.value)}>
        <option value="">All platforms</option>
        {platforms.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select className="input w-auto" value={f.person ?? ""} onChange={(e) => f.set("person", e.target.value)}>
        <option value="">Everyone</option>
        {people.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );
}

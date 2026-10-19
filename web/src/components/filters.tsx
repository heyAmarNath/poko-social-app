import { useSearchParams } from "react-router";
import { useMembers, usePlatforms } from "@/lib/data";
import type { TargetRow } from "@/lib/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlatformIcon } from "@/components/platform";
import { PersonAvatar } from "@/components/people";

const ALL = "__all";

/** Platform + person filters stored in the URL so views can be shared. */
export function useFilters() {
  const [sp, setSp] = useSearchParams();
  const platform = sp.get("platform");
  const person = sp.get("person");
  const set = (k: string, v: string | null) => {
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
  const platforms = (usePlatforms().data ?? []).filter((p) => p.visible);
  const members = useMembers();
  return (
    <>
      <Select value={f.platform ?? ALL} onValueChange={(v) => f.set("platform", v === ALL ? null : v)}>
        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All platforms</SelectItem>
          {platforms.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}><PlatformIcon k={p.key} name={p.name} color={p.color} className="size-4" decorative />{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={f.person ?? ALL} onValueChange={(v) => f.set("person", v === ALL ? null : v)}>
        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Everyone</SelectItem>
          {members.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}><PersonAvatar person={p} size="sm" />{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

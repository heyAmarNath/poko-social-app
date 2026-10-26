import { usePeopleMap, usePostableBrands } from "@/lib/data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AccountAvatar } from "@/components/account-avatar";
import { PersonAvatar } from "@/components/people";
import { PlatformIcon } from "@/components/platform";

/**
 * One row per brand: its full name (the checkbox picks every platform), its platform icons to pick
 * one by one (hover one for its handle), then who manages them. The three line up as columns.
 */
export function AccountPicker({ selected, onChange }: { selected: number[]; onChange: (ids: number[]) => void }) {
  const brands = usePostableBrands();
  const people = usePeopleMap();
  if (!brands.length) return <p className="text-sm text-muted-foreground">No accounts yet. An admin adds them under Accounts.</p>;
  const toggle = (ids: number[], on: boolean) => onChange(on ? [...new Set([...selected, ...ids])] : selected.filter((x) => !ids.includes(x)));
  return (
    <div className="grid grid-cols-[minmax(0,max-content)_minmax(0,1fr)_auto] divide-y rounded-lg border">
      {brands.map((b) => {
        const ids = b.accounts.map((a) => a.id);
        const all = ids.every((i) => selected.includes(i));
        const some = !all && ids.some((i) => selected.includes(i));
        const who = [...new Set(b.accounts.map((a) => a.manager_id))].map((id) => id && people.get(id)).filter((p) => !!p);
        return (
          <div key={b.id} className="col-span-full grid grid-cols-subgrid items-center gap-x-4 p-3">
            <Label className="cursor-pointer">
              <Checkbox checked={all ? true : some ? "indeterminate" : false} onCheckedChange={(v) => toggle(ids, !!v)} />
              <AccountAvatar name={b.name} size="sm" />
              <span className="leading-snug break-words">{b.name}</span>
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {b.accounts.map((a) => {
                const on = selected.includes(a.id);
                return (
                  <Button key={a.id} type="button" size="icon" variant="outline" aria-pressed={on} onClick={() => toggle([a.id], !on)}
                    aria-label={`${a.platform_name} ${a.handle}`} title={`${a.platform_name} · ${a.handle}`}
                    className={cn(on && "border-primary bg-primary/10 ring-1 ring-primary hover:bg-primary/15 dark:bg-primary/20")}>
                    <PlatformIcon k={a.platform_key} name={a.platform_name} color={a.platform_color} className="size-4" decorative />
                  </Button>
                );
              })}
            </div>
            <span className="flex items-center justify-self-end -space-x-1" title={who.length ? `Managed by ${who.map((p) => p.name).join(", ")}` : undefined}>
              {who.slice(0, 3).map((p) => <PersonAvatar key={p.id} person={p} size="sm" className="ring-2 ring-background" />)}
              {who.length > 3 && <span className="pl-2 text-xs text-muted-foreground">+{who.length - 3}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

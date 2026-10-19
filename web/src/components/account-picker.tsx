import { accountName, useHandlerMap, usePeopleMap, usePostableAccounts } from "@/lib/data";
import type { Account } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PersonAvatar } from "@/components/people";
import { PlatformIcon } from "@/components/platform";
import { AccountAvatar } from "@/components/account-avatar";

/** Accounts grouped by account name, each with its platforms as toggles and its managers shown. */
export function AccountPicker({ selected, onChange, exclude = [] }: { selected: number[]; onChange: (ids: number[]) => void; exclude?: number[] }) {
  const accounts = usePostableAccounts().filter((a) => !exclude.includes(a.id));
  const handlers = useHandlerMap();
  const people = usePeopleMap();
  const groups = new Map<string, Account[]>();
  for (const a of accounts) groups.set(accountName(a), [...(groups.get(accountName(a)) ?? []), a]);
  if (!groups.size)
    return <p className="text-sm text-muted-foreground">{exclude.length ? "Every account is already on this post." : "No accounts yet. An admin adds them under Accounts."}</p>;
  const toggle = (ids: number[], on: boolean) => onChange(on ? [...new Set([...selected, ...ids])] : selected.filter((x) => !ids.includes(x)));
  return (
    <div className="divide-y rounded-lg border">
      {[...groups].map(([name, list]) => {
        const ids = list.map((a) => a.id);
        const all = ids.every((i) => selected.includes(i));
        const some = !all && ids.some((i) => selected.includes(i));
        const who = [...new Set(ids.flatMap((i) => handlers.get(i) ?? []))].map((id) => people.get(id)).filter((p) => !!p);
        return (
          <div key={name} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
            <div className="flex w-44 shrink-0 items-center gap-2">
              <Label className="min-w-0 cursor-pointer">
                <Checkbox checked={all ? true : some ? "indeterminate" : false} onCheckedChange={(v) => toggle(ids, !!v)} />
                <AccountAvatar name={name} avatarKey={list.find((a) => a.avatar_key)?.avatar_key} size="sm" />
                <span className="truncate">{name}</span>
              </Label>
              {who.length > 0 && (
                <span className="ml-auto flex -space-x-1" title={`Managed by ${who.map((p) => p.name).join(", ")}`}>
                  {who.slice(0, 3).map((p) => <PersonAvatar key={p.id} person={p} size="sm" className="ring-2 ring-background" />)}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {list.map((a) => {
                const on = selected.includes(a.id);
                return (
                  <Button key={a.id} type="button" size="sm" variant="outline" aria-pressed={on} onClick={() => toggle([a.id], !on)}
                    className={cn(on && "border-primary bg-primary/10 ring-1 ring-primary hover:bg-primary/15 dark:bg-primary/20")} title={`${a.platform_name} · ${a.handle}`}>
                    <PlatformIcon k={a.platform_key} name={a.platform_name} color={a.platform_color} />
                    <span className="max-w-32 truncate text-muted-foreground">{a.handle}</span>
                  </Button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

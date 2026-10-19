import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AtSign, EyeOff, Pencil, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { accountName, useAccounts, usePlatforms } from "@/lib/data";
import { attempt } from "@/lib/errors";
import type { Account, Platform } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Confirm } from "@/components/confirm";
import { PageHeader } from "@/components/page-header";
import { PlatformDot } from "@/components/platform";

export type AccountGroup = { name: string; accounts: Account[] };

export function useAccountGroups() {
  const accounts = useAccounts().data ?? [];
  return useMemo(() => {
    const m = new Map<string, Account[]>();
    for (const a of accounts) m.set(accountName(a), [...(m.get(accountName(a)) ?? []), a]);
    return [...m].map(([name, accounts]) => ({ name, accounts }));
  }, [accounts]);
}

export function AccountsPage() {
  const groups = useAccountGroups();
  const platforms = usePlatforms().data;
  const [editing, setEditing] = useState<AccountGroup | "new" | null>(null);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Accounts"
        description="Each account is a brand or person, with its handles on every social platform in one place."
        actions={<Button onClick={() => setEditing("new")}><Plus /> Add account</Button>}
      />
      {groups.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><AtSign /></EmptyMedia>
            <EmptyTitle>No accounts yet</EmptyTitle>
            <EmptyDescription>Add an account and fill in its handle on each platform you use.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button onClick={() => setEditing("new")}><Plus /> Add account</Button></EmptyContent>
        </Empty>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow><TableHead className="pl-4">Account</TableHead><TableHead>Platforms</TableHead><TableHead className="hidden md:table-cell">Timezone</TableHead><TableHead /></TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((g) => {
                const active = g.accounts.some((a) => a.active);
                return (
                  <TableRow key={g.name} className={cn(!active && "opacity-60")}>
                    <TableCell className="pl-4 font-medium">{g.name}{!active && <Badge variant="outline" className="ml-2">Paused</Badge>}</TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-wrap gap-1.5">
                        {g.accounts.map((a) => (
                          <Badge key={a.id} variant="outline" className={cn("font-normal", !a.platform_visible && "text-muted-foreground")} title={a.platform_visible ? undefined : "Platform hidden"}>
                            <PlatformDot color={a.platform_color} />{a.platform_name}<span className="text-muted-foreground">{a.handle}</span>
                            {!a.platform_visible && <EyeOff />}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{g.accounts[0].timezone || "—"}</TableCell>
                    <TableCell className="pr-4 text-right"><Button variant="ghost" size="icon-sm" aria-label={`Edit ${g.name}`} onClick={() => setEditing(g)}><Pencil /></Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      {editing && platforms && <AccountDialog group={editing === "new" ? null : editing} platforms={platforms} onClose={() => setEditing(null)} />}
    </div>
  );
}

type Row = { key: string; id?: number; platform: Platform; handle: string; url: string };

/** Rendered only once platforms have loaded, because the rows are built from them on open. */
function AccountDialog({ group, platforms, onClose }: { group: AccountGroup | null; platforms: Platform[]; onClose: () => void }) {
  const qc = useQueryClient();
  const first = group?.accounts[0];
  const [name, setName] = useState(group?.name ?? "");
  const [timezone, setTimezone] = useState(first?.timezone ?? "");
  const [notes, setNotes] = useState(first?.notes ?? "");
  const [active, setActive] = useState(group ? group.accounts.some((a) => a.active) : true);
  const [busy, setBusy] = useState(false);
  const zones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);

  // One row per visible platform, plus any existing handles on hidden platforms.
  const [rows, setRows] = useState<Row[]>(() => {
    const out: Row[] = [];
    for (const p of platforms) {
      const existing = group?.accounts.filter((a) => a.platform_id === p.id) ?? [];
      if (!p.visible && !existing.length) continue;
      if (existing.length) existing.forEach((a) => out.push({ key: `a${a.id}`, id: a.id, platform: p, handle: a.handle, url: a.url ?? "" }));
      else out.push({ key: `p${p.id}`, platform: p, handle: "", url: "" });
    }
    return out;
  });
  const set = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const filled = rows.filter((r) => r.handle.trim()).length;

  const save = async () => {
    setBusy(true);
    const ok = await attempt(async () => {
      await api("/admin/accounts", {
        method: "PUT",
        json: {
          name, previous_name: group?.name ?? null, timezone, notes, active,
          entries: rows.filter((r) => r.id || r.handle.trim()).map((r) => ({ id: r.id, platform_id: r.platform.id, handle: r.handle, url: r.url })),
        },
      });
      await qc.invalidateQueries({ queryKey: ["accounts"] });
      await qc.invalidateQueries({ queryKey: ["rules"] });
    }, group ? "Account saved" : "Account added");
    setBusy(false);
    if (ok) onClose();
  };
  const remove = () =>
    attempt(async () => {
      await api(`/admin/accounts?name=${encodeURIComponent(group!.name)}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["accounts"] });
      onClose();
    }, "Account deleted");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{group ? `Edit ${group.name}` : "Add account"}</DialogTitle>
          <DialogDescription>Fill in the handle on each platform this account uses. Leave the rest empty.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="acc-name">Account name</FieldLabel>
              <Input id="acc-name" autoFocus placeholder="e.g. Acme" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Audience timezone</FieldLabel>
              <Select value={timezone || "__none"} onValueChange={(v) => setTimezone(v === "__none" ? "" : v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none"><span className="text-muted-foreground">Not set</span></SelectItem>
                  {zones.map((z) => <SelectItem key={z} value={z}>{z.replaceAll("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <FieldSet>
            <FieldLegend variant="label">Platforms <span className="font-normal text-muted-foreground">· {filled} filled</span></FieldLegend>
            <div className="divide-y rounded-lg border">
              {rows.map((r) => (
                <div key={r.key} className="grid items-center gap-2 p-2.5 sm:grid-cols-[9rem_1fr_1fr]">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <PlatformDot color={r.platform.color} />{r.platform.name}
                    {!r.platform.visible && <EyeOff className="size-3.5 text-muted-foreground" aria-label="Hidden platform" />}
                  </span>
                  <Input aria-label={`${r.platform.name} handle`} placeholder="@handle or page name" value={r.handle} onChange={(e) => set(r.key, { handle: e.target.value })} />
                  <Input aria-label={`${r.platform.name} profile link`} placeholder="Profile link (optional)" value={r.url} onChange={(e) => set(r.key, { url: e.target.value })} />
                </div>
              ))}
            </div>
            {group && <FieldDescription>Clearing a handle removes that platform from the account. Past posts keep their history.</FieldDescription>}
          </FieldSet>
          <Field>
            <FieldLabel htmlFor="acc-notes">Notes</FieldLabel>
            <Textarea id="acc-notes" placeholder="Tone of voice, posting rules… never passwords" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Field orientation="horizontal">
            <Switch id="acc-active" checked={active} onCheckedChange={setActive} />
            <FieldLabel htmlFor="acc-active">Active, members can post to it</FieldLabel>
          </Field>
        </FieldGroup>
        <DialogFooter className="sm:justify-between">
          {group ? (
            <Confirm title={`Delete ${group.name}?`} description="All its platform handles are removed. Past posts keep their history." onConfirm={remove}>
              <Button variant="destructive">Delete account</Button>
            </Confirm>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={busy || !name.trim() || (!group && !filled)} onClick={save}>{group ? "Save" : "Add account"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

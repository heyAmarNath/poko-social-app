import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AtSign, EyeOff, Pencil, Plus, Undo2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useBrands, useTeam, usePeopleMap, usePlatforms } from "@/lib/data";
import { attempt } from "@/lib/errors";
import type { Account, Brand, Platform } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AccountAvatar } from "@/components/account-avatar";
import { Confirm } from "@/components/confirm";
import { PageHeader } from "@/components/page-header";
import { PersonAvatar, PersonSelect } from "@/components/people";
import { PlatformIcon } from "@/components/platform";
import { TimezoneSelect } from "@/components/timezone-select";
import { normalizeUrl } from "../../../../shared/links";

export function AccountsPage() {
  const groups = useBrands().data ?? [];
  const platforms = usePlatforms().data;
  const [editing, setEditing] = useState<Brand | "new" | null>(null);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Accounts"
        description="Each account is a brand or person, with who manages it on each platform. Click a platform icon to open that profile."
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {groups.map((g) => <AccountCard key={g.id} group={g} onEdit={() => setEditing(g)} />)}
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex min-h-52 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground transition-colors hover:border-foreground/30 hover:bg-muted/40 hover:text-foreground"
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-muted"><Plus className="size-5" /></span>
            Add account
          </button>
        </div>
      )}
      {/* The form copies the platform list when it opens, so wait for it. */}
      {editing && platforms && <AccountDialog group={editing === "new" ? null : editing} platforms={platforms} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AccountCard({ group: g, onEdit }: { group: Brand; onEdit: () => void }) {
  const people = usePeopleMap();
  const active = !!g.active;
  const who = [...new Set(g.accounts.map((a) => a.manager_id))].map((id) => id && people.get(id)).filter((p) => !!p);
  return (
    <Card className={cn("group/card relative items-center gap-0 px-4 pt-6 pb-4 text-center transition-shadow hover:shadow-md", !active && "opacity-70")}>
      <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${g.name}`}
        className="absolute top-2 right-2 opacity-60 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100">
        <Pencil />
      </Button>
      <button type="button" onClick={onEdit} className="flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Edit ${g.name}`}>
        <AccountAvatar name={g.name} size="xl" />
      </button>
      <h3 className="mt-3 max-w-full truncate font-semibold">{g.name}</h3>
      <p className="text-xs text-muted-foreground">
        {g.accounts.length} platform{g.accounts.length === 1 ? "" : "s"}
        {!active && " · Paused"}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {g.accounts.map((a) => <PlatformLink key={a.id} account={a} />)}
      </div>
      <div className="mt-4 flex h-6 items-center justify-center gap-2 border-t pt-4 text-xs text-muted-foreground w-full">
        {who.length ? (
          <>
            <span className="flex -space-x-1">{who.slice(0, 4).map((p) => <PersonAvatar key={p.id} person={p} size="sm" className="ring-2 ring-card" />)}</span>
            <span className="truncate">Managed by {who.length === 1 ? who[0].name : `${who.length} people`}</span>
          </>
        ) : (
          <span>No managers yet</span>
        )}
      </div>
    </Card>
  );
}

/** Round brand-icon button that opens the account's profile in a new tab. */
function PlatformLink({ account: a }: { account: Account }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a href={a.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${a.platform_name} profile`}
          className="relative flex size-10 items-center justify-center rounded-full border bg-background transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <PlatformIcon k={a.platform_key} name={a.platform_name} color={a.platform_color} className="size-5" decorative />
          {!a.platform_visible && <EyeOff className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-background p-0.5 text-muted-foreground" />}
        </a>
      </TooltipTrigger>
      <TooltipContent>Open on {a.platform_name}{!a.platform_visible && " (platform hidden)"}</TooltipContent>
    </Tooltip>
  );
}

/** One platform in the form: the profile link and its manager. */
type Row = { key: string; id?: number; platform: Platform; url: string; removed: boolean; manager: number | null };

const EXAMPLE: Record<string, string> = {
  x: "https://x.com/yourbrand", facebook: "https://facebook.com/yourpage", instagram: "https://instagram.com/yourbrand",
  linkedin: "https://linkedin.com/company/yourbrand", reddit: "https://reddit.com/r/yourcommunity", discord: "https://discord.gg/invite",
  threads: "https://threads.net/@yourbrand", tiktok: "https://tiktok.com/@yourbrand", youtube: "https://youtube.com/@yourchannel",
};

/** Rendered once platforms have loaded: the rows are built from them when the form opens. */
function AccountDialog({ group, platforms, onClose }: { group: Brand | null; platforms: Platform[]; onClose: () => void }) {
  const qc = useQueryClient();
  const team = useTeam();
  const [name, setName] = useState(group?.name ?? "");
  const [timezone, setTimezone] = useState(group?.timezone ?? "");
  const [notes, setNotes] = useState(group?.notes ?? "");
  const [active, setActive] = useState(group ? !!group.active : true);
  const [busy, setBusy] = useState(false);

  // One row per visible platform, plus any existing profiles on hidden platforms.
  const [rows, setRows] = useState<Row[]>(() => {
    const out: Row[] = [];
    for (const p of platforms) {
      const existing = group?.accounts.filter((a) => a.platform_id === p.id) ?? [];
      if (!p.visible && !existing.length) continue;
      if (existing.length)
        existing.forEach((a) => out.push({ key: `a${a.id}`, id: a.id, platform: p, url: a.url, removed: false, manager: a.manager_id }));
      else out.push({ key: `p${p.id}`, platform: p, url: "", removed: false, manager: null });
    }
    return out;
  });
  const set = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const isFilled = (r: Row) => !r.removed && !!r.url.trim();
  const badLink = (r: Row) => !!r.url.trim() && !normalizeUrl(r.url);
  const filled = rows.filter(isFilled).length;

  const save = async () => {
    setBusy(true);
    const ok = await attempt(async () => {
      await api(group ? `/admin/brands/${group.id}` : "/admin/brands", {
        method: group ? "PUT" : "POST",
        json: {
          name, timezone, notes, active,
          entries: rows
            .filter((r) => r.id || isFilled(r))
            .map((r) => ({
              id: r.id, platform_id: r.platform.id, manager_id: r.manager,
              // a saved row sent without a link is deleted
              url: r.removed ? "" : r.url,
            })),
        },
      });
      await qc.invalidateQueries({ queryKey: ["brands"] });
    }, group ? "Account saved" : "Account added");
    setBusy(false);
    if (ok) onClose();
  };
  const remove = () =>
    attempt(async () => {
      await api(`/admin/brands/${group!.id}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["brands"] });
      onClose();
    }, "Account deleted");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{group ? `Edit ${group.name}` : "Add account"}</DialogTitle>
          <DialogDescription>Paste the profile link for each platform this account uses and pick its manager. Leave the rest empty.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="acc-name">Account name</FieldLabel>
              <div className="flex items-center gap-3">
                <AccountAvatar name={name || "?"} />
                <Input id="acc-name" autoFocus placeholder="e.g. Acme" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </Field>
            <Field>
              <FieldLabel>Audience timezone</FieldLabel>
              <TimezoneSelect value={timezone} onChange={setTimezone} allowNone />
            </Field>
          </div>
          <FieldSet>
            <FieldLegend variant="label">Platforms <span className="font-normal text-muted-foreground">· {filled} filled</span></FieldLegend>
            <div className="divide-y rounded-lg border">
              <div className="hidden grid-cols-[3rem_1fr_12rem_2rem] gap-2 bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted-foreground sm:grid">
                <span /><span>Profile link</span><span>Manager</span><span />
              </div>
              {rows.map((r) => (
                <div key={r.key} className={cn("grid items-center gap-2 p-2.5 grid-cols-[2rem_1fr_2rem] sm:grid-cols-[3rem_1fr_12rem_2rem]", r.removed && "opacity-50")}>
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <PlatformIcon k={r.platform.key} name={r.platform.name} color={r.platform.color} className="size-5" />
                    {!r.platform.visible && <EyeOff className="size-3.5 text-muted-foreground" aria-label="Hidden platform" />}
                  </span>
                  <Input
                    type="url" inputMode="url" autoComplete="off" spellCheck={false}
                    aria-label={`${r.platform.name} profile link`} aria-invalid={badLink(r) || undefined} disabled={r.removed}
                    placeholder={r.removed ? "Will be removed" : EXAMPLE[r.platform.key] ?? "https://…"}
                    value={r.url} onChange={(e) => set(r.key, { url: e.target.value })}
                  />
                  <PersonSelect people={team} value={r.manager} onChange={(manager) => set(r.key, { manager })} disabled={!isFilled(r)}
                    placeholder="No manager" label={`${r.platform.name} manager`} className="col-span-2 col-start-2 row-start-2 text-xs sm:col-span-1 sm:col-start-auto sm:row-start-auto" />
                  {r.id ? (
                    <Button type="button" variant="ghost" size="icon-sm" className="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto"
                      aria-label={r.removed ? `Keep ${r.platform.name}` : `Remove ${r.platform.name}`} title={r.removed ? "Undo remove" : "Remove this platform"}
                      onClick={() => set(r.key, { removed: !r.removed })}>
                      {r.removed ? <Undo2 /> : <X />}
                    </Button>
                  ) : <span className="hidden sm:block" />}
                  {badLink(r) && <p className="col-span-2 col-start-2 text-xs text-destructive sm:col-span-3">That doesn't look like a web address.</p>}
                </div>
              ))}
            </div>
            <FieldDescription>
              Clicking a platform icon on the account card opens this link. The manager is filled in as "Posted by" on new posts to that platform.
            </FieldDescription>
          </FieldSet>
          <Field>
            <FieldLabel htmlFor="acc-notes">Notes</FieldLabel>
            <Textarea id="acc-notes" placeholder="Tone of voice, posting rules… never passwords" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Field orientation="horizontal">
            <Switch id="acc-active" checked={active} onCheckedChange={setActive} />
            <FieldLabel htmlFor="acc-active">Active, the team can post to it</FieldLabel>
          </Field>
        </FieldGroup>
        <DialogFooter className="sm:justify-between">
          {group ? (
            <Confirm title={`Delete ${group.name}?`} description="All its platform handles are removed. Past posts stay." onConfirm={remove}>
              <Button variant="destructive">Delete account</Button>
            </Confirm>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={busy || !name.trim() || (!group && !filled) || rows.some((r) => !r.removed && badLink(r))} onClick={save}>{group ? "Save" : "Add account"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

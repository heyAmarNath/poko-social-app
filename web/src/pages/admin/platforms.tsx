import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useAccounts, usePlatforms } from "@/lib/data";
import { attempt } from "@/lib/errors";
import type { Platform } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { PlatformDot } from "@/components/platform";

export function PlatformsPage() {
  const platforms = usePlatforms().data ?? [];
  const accounts = useAccounts().data ?? [];
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Platform> | null>(null);
  const toggle = (p: Platform, visible: boolean) =>
    attempt(async () => {
      await api(`/admin/platforms/${p.id}`, { method: "PATCH", json: { visible } });
      await qc.invalidateQueries({ queryKey: ["platforms"] });
      await qc.invalidateQueries({ queryKey: ["accounts"] });
    }, `${p.name} is now ${visible ? "shown" : "hidden"}`);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Platforms"
        description="Hidden platforms disappear from account forms, filters and the post editor. Existing posts keep them."
        actions={<Button onClick={() => setEditing({ color: "#64748b", extra_fields: [], visible: 1 })}><Plus /> Add platform</Button>}
      />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20 pl-4">Show</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Character limit</TableHead>
              <TableHead className="hidden md:table-cell">Extra fields</TableHead>
              <TableHead className="hidden sm:table-cell">Accounts</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {platforms.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="pl-4"><Switch checked={!!p.visible} onCheckedChange={(v) => toggle(p, v)} aria-label={`Show ${p.name}`} /></TableCell>
                <TableCell className={cn("font-medium", !p.visible && "text-muted-foreground")}>
                  <span className="flex items-center gap-2"><PlatformDot color={p.color} />{p.name}</span>
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{p.char_limit?.toLocaleString() ?? "No limit"}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">{p.extra_fields.map((x) => x.label).join(", ") || "—"}</TableCell>
                <TableCell className="hidden tabular-nums text-muted-foreground sm:table-cell">{accounts.filter((a) => a.platform_id === p.id).length}</TableCell>
                <TableCell className="pr-4 text-right"><Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}><Pencil /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {editing && <PlatformDialog initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PlatformDialog({ initial, onClose }: { initial: Partial<Platform>; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(initial);
  const [extras, setExtras] = useState((initial.extra_fields ?? []).map((x) => x.label).join(", "));
  const isNew = !f.id;
  const save = async () => {
    const extra_fields = extras.split(",").map((s) => s.trim()).filter(Boolean).map((label) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"), label }));
    const json = { name: f.name, char_limit: f.char_limit || null, color: f.color, visible: !!f.visible, extra_fields };
    const ok = await attempt(async () => {
      await api(isNew ? "/admin/platforms" : `/admin/platforms/${f.id}`, { method: isNew ? "POST" : "PATCH", json });
      await qc.invalidateQueries({ queryKey: ["platforms"] });
      await qc.invalidateQueries({ queryKey: ["accounts"] });
    }, isNew ? "Platform added" : "Saved");
    if (ok) onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Add platform" : `Edit ${initial.name}`}</DialogTitle>
          <DialogDescription>Character limits power the counters in the post editor.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid grid-cols-[1fr_auto] gap-4">
            <Field>
              <FieldLabel htmlFor="pf-name">Name</FieldLabel>
              <Input id="pf-name" autoFocus value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="pf-color">Colour</FieldLabel>
              <Input id="pf-color" type="color" className="w-16 p-1" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="pf-limit">Character limit</FieldLabel>
            <Input id="pf-limit" type="number" min={1} placeholder="No limit" value={f.char_limit ?? ""} onChange={(e) => setF({ ...f, char_limit: e.target.value ? Number(e.target.value) : null })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="pf-extra">Extra fields</FieldLabel>
            <Input id="pf-extra" placeholder="e.g. Subreddit, Post title" value={extras} onChange={(e) => setExtras(e.target.value)} />
            <FieldDescription>Comma separated. Each post on this platform gets these inputs.</FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <Switch id="pf-visible" checked={!!f.visible} onCheckedChange={(v) => setF({ ...f, visible: v ? 1 : 0 })} />
            <FieldLabel htmlFor="pf-visible">Show this platform</FieldLabel>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!f.name?.trim()} onClick={save}>{isNew ? "Add platform" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

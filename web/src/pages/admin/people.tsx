import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, ShieldCheck, User } from "lucide-react";
import { api } from "@/lib/api";
import { useMe, usePeople, useRefresh } from "@/lib/data";
import { attempt } from "@/lib/errors";
import type { Person } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Confirm } from "@/components/confirm";
import { PageHeader } from "@/components/page-header";
import { PersonAvatar } from "@/components/people";
import type { Role } from "../../../../shared/rules";

const COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#8b5cf6", "#ef4444", "#84cc16", "#0ea5e9", "#f97316"];

/** The team: who can sign in (with the Google account on their profile) and who is an admin. */
export function PeoplePage() {
  const people = (usePeople().data ?? []).filter((p) => !p.deleted);
  const me = useMe().data!;
  const [editing, setEditing] = useState<Partial<Person> | null>(null);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="People"
        description="Everyone signs in with Google. Only the people listed here, with the Google email on their profile, can get in."
        actions={<Button onClick={() => setEditing({ role: "member", avatar_color: COLORS[people.length % COLORS.length], active: 1 })}><Plus /> Add person</Button>}
      />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow><TableHead className="pl-4">Name</TableHead><TableHead className="hidden sm:table-cell">Google email</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {people.map((p) => (
              <TableRow key={p.id} className={cn(!p.active && "opacity-60")}>
                <TableCell className="pl-4">
                  <div className="flex items-center gap-2.5"><PersonAvatar person={p} /><span className="font-medium">{p.name}</span>{p.id === me.id && <span className="text-xs text-muted-foreground">You</span>}</div>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">{p.email}</TableCell>
                <TableCell>
                  {p.role === "admin" ? <Badge variant="secondary"><ShieldCheck /> Admin</Badge> : <Badge variant="outline"><User /> Member</Badge>}
                </TableCell>
                <TableCell>{p.active ? "Active" : <span className="text-muted-foreground">Inactive</span>}</TableCell>
                <TableCell className="pr-4 text-right"><Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}><Pencil /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {editing && <PersonDialog initial={editing} self={editing.id === me.id} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PersonDialog({ initial, self, onClose }: { initial: Partial<Person>; self: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const refresh = useRefresh();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const isNew = !f.id;
  const save = async () => {
    setBusy(true);
    const json: Record<string, unknown> = { name: f.name, email: f.email, avatar_color: f.avatar_color, role: f.role };
    if (!isNew) json.active = !!f.active;
    const ok = await attempt(async () => {
      await api(isNew ? "/admin/profiles" : `/admin/profiles/${f.id}`, { method: isNew ? "POST" : "PATCH", json });
      await qc.invalidateQueries({ queryKey: ["profiles"] });
    }, isNew ? "Person added" : "Saved");
    setBusy(false);
    if (ok) onClose();
  };
  const remove = () =>
    attempt(async () => {
      await api(`/admin/profiles/${f.id}`, { method: "DELETE" });
      // Their open work and accounts were unassigned too.
      await Promise.all([qc.invalidateQueries({ queryKey: ["profiles"] }), qc.invalidateQueries({ queryKey: ["brands"] })]);
      refresh();
      onClose();
    }, `${initial.name} deleted`);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Add person" : `Edit ${initial.name}`}</DialogTitle>
          <DialogDescription>They sign in with Google, using the email below.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <div className="flex items-center gap-3">
              <PersonAvatar person={{ name: f.name || "?", avatar_color: f.avatar_color ?? COLORS[0] }} />
              <Input id="name" autoFocus value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} />
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Google email</FieldLabel>
            <Input id="email" type="email" placeholder="name@poko.video" value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value })} />
            <FieldDescription>Changing it signs them out; they sign in again with the new account.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Colour</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" aria-label={c} onClick={() => setF({ ...f, avatar_color: c })}
                  className={cn("size-7 rounded-full ring-offset-2 ring-offset-background", f.avatar_color === c && "ring-2 ring-foreground")} style={{ background: c }} />
              ))}
            </div>
          </Field>
          <Field>
            <FieldLabel>Type</FieldLabel>
            <ToggleGroup type="single" variant="outline" value={f.role} onValueChange={(v) => v && setF({ ...f, role: v as Role })} className="w-full">
              <ToggleGroupItem value="member" className="flex-1"><User /> Member</ToggleGroupItem>
              <ToggleGroupItem value="admin" className="flex-1"><ShieldCheck /> Admin</ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>
              {f.role === "admin" ? "Everything a member does, plus managing people, accounts, topics and platforms." : "Writes posts, makes media and publishes them."}
            </FieldDescription>
          </Field>
          {!isNew && (
            <Field orientation="horizontal">
              <Switch id="active" checked={!!f.active} onCheckedChange={(v) => setF({ ...f, active: v ? 1 : 0 })} />
              <FieldLabel htmlFor="active">Active, can sign in</FieldLabel>
            </Field>
          )}
        </FieldGroup>
        <DialogFooter className="sm:justify-between">
          {!isNew && !self ? (
            <Confirm title={`Delete ${initial.name}?`} action="Delete person" onConfirm={remove}
              description="They can't sign in anymore, and they're taken off open posts and the accounts they manage. Finished posts keep their name. You can add the same email again later.">
              <Button variant="destructive">Delete person</Button>
            </Confirm>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={busy || !f.name?.trim() || !f.email?.trim()} onClick={save}>{isNew ? "Add person" : "Save"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, Pencil, Plus, ShieldCheck, User } from "lucide-react";
import { api } from "@/lib/api";
import { useMe, usePeople } from "@/lib/data";
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
import { PageHeader } from "@/components/page-header";
import { PersonAvatar } from "@/components/people";
import { PinInput } from "@/components/pin-input";
import type { Role } from "../../../../shared/rules";

const COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#8b5cf6", "#ef4444", "#84cc16", "#0ea5e9", "#f97316"];

export function PeoplePage() {
  const people = usePeople().data ?? [];
  const me = useMe().data!;
  const [editing, setEditing] = useState<Partial<Person> | null>(null);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="People"
        description="Members write, design, schedule and publish content. Admins only manage this settings area."
        actions={<Button onClick={() => setEditing({ role: "member", avatar_color: COLORS[people.length % COLORS.length], active: 1 })}><Plus /> Add person</Button>}
      />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow><TableHead className="pl-4">Name</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead className="hidden sm:table-cell">Email</TableHead><TableHead /></TableRow>
          </TableHeader>
          <TableBody>
            {people.map((p) => (
              <TableRow key={p.id} className={cn(!p.active && "opacity-60")}>
                <TableCell className="pl-4">
                  <div className="flex items-center gap-2.5"><PersonAvatar person={p} /><span className="font-medium">{p.name}</span>{p.id === me.id && <span className="text-xs text-muted-foreground">You</span>}</div>
                </TableCell>
                <TableCell>
                  {p.role === "admin" ? <Badge variant="secondary"><ShieldCheck /> Admin</Badge> : <Badge variant="outline"><User /> Member</Badge>}
                </TableCell>
                <TableCell>
                  {p.locked_until && p.locked_until > Date.now() ? <Badge variant="destructive"><Lock /> Locked</Badge> : p.active ? "Active" : <span className="text-muted-foreground">Inactive</span>}
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">{p.email || "—"}</TableCell>
                <TableCell className="pr-4 text-right"><Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)}><Pencil /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {editing && <PersonDialog initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PersonDialog({ initial, onClose }: { initial: Partial<Person>; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(initial);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const isNew = !f.id;
  const save = async () => {
    setBusy(true);
    const json: Record<string, unknown> = { name: f.name, avatar_color: f.avatar_color, role: f.role, email: f.email ?? "" };
    if (!isNew) json.active = !!f.active;
    if (pin) json.pin = pin;
    const ok = await attempt(async () => {
      await api(isNew ? "/admin/profiles" : `/admin/profiles/${f.id}`, { method: isNew ? "POST" : "PATCH", json });
      await qc.invalidateQueries({ queryKey: ["profiles"] });
      await qc.invalidateQueries({ queryKey: ["handlers"] });
    }, isNew ? "Person added" : "Saved");
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Add person" : `Edit ${initial.name}`}</DialogTitle>
          <DialogDescription>They pick their tile on the profile screen and unlock it with their PIN.</DialogDescription>
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
              {f.role === "admin" ? "Manages people, accounts and their managers, templates and platforms. Can't write or publish posts." : "Can do all content work: write, add media, schedule and mark posted."}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel>{isNew ? "PIN" : "Reset PIN"}</FieldLabel>
            <PinInput value={pin} onChange={setPin} masked={false} />
            <FieldDescription>{isNew ? "Four digits. They can change it later." : "Leave empty to keep the current PIN. Resetting also unlocks the profile."}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="email">Email <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
            <Input id="email" type="email" value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          {!isNew && (
            <Field orientation="horizontal">
              <Switch id="active" checked={!!f.active} onCheckedChange={(v) => setF({ ...f, active: v ? 1 : 0 })} />
              <FieldLabel htmlFor="active">Active, shown on the profile screen</FieldLabel>
            </Field>
          )}
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !f.name?.trim() || (isNew && pin.length !== 4) || (!!pin && pin.length !== 4)} onClick={save}>{isNew ? "Add person" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

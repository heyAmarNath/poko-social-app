import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useTopics } from "@/lib/data";
import { attempt } from "@/lib/errors";
import type { Topic } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Confirm } from "@/components/confirm";
import { PageHeader } from "@/components/page-header";

export function TopicsPage() {
  const q = useTopics();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Topic> | null>(null);
  const list = q.data ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["topics"] });

  const move = (i: number, by: -1 | 1) => {
    const ids = list.map((t) => t.id);
    [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
    return attempt(async () => {
      await api("/admin/topics/order", { method: "POST", json: { ids } });
      await refresh();
    });
  };
  const remove = (t: Topic) =>
    attempt(async () => {
      await api(`/admin/topics/${t.id}`, { method: "DELETE" });
      await refresh();
    }, `${t.name} deleted`);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Topics"
        description="The kinds of post the team makes. Members see every topic in their sidebar, and new posts start from the topic's template."
        actions={<Button onClick={() => setEditing({})}><Plus /> New topic</Button>}
      />
      {q.isPending ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : list.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Tags /></EmptyMedia>
            <EmptyTitle>No topics yet</EmptyTitle>
            <EmptyDescription>Add one for each kind of post, like a feature promotion or a daily update.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button onClick={() => setEditing({})}><Plus /> New topic</Button></EmptyContent>
        </Empty>
      ) : (
        <Card className="gap-0 divide-y py-0">
          {list.map((t, i) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex flex-col">
                <Button variant="ghost" size="icon-xs" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${t.name} up`}><ArrowUp /></Button>
                <Button variant="ghost" size="icon-xs" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${t.name} down`}><ArrowDown /></Button>
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{t.name}</div>
                <div className="truncate text-sm text-muted-foreground">{t.description || <em>No description</em>}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditing(t)}><Pencil /> Edit</Button>
                <Confirm title={`Delete ${t.name}?`} description="It disappears from the sidebar. Its posts stay, with no topic." onConfirm={() => remove(t)}>
                  <Button variant="ghost" size="icon-sm" className="text-destructive hover:text-destructive" aria-label={`Delete ${t.name}`}><Trash2 /></Button>
                </Confirm>
              </div>
            </div>
          ))}
        </Card>
      )}
      {editing && <TopicDialog initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TopicDialog({ initial, onClose }: { initial: Partial<Topic>; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const isNew = !f.id;
  const save = async () => {
    setBusy(true);
    const json = { name: f.name, description: f.description ?? "", template: f.template ?? "" };
    const ok = await attempt(async () => {
      await api(isNew ? "/admin/topics" : `/admin/topics/${f.id}`, { method: isNew ? "POST" : "PUT", json });
      await qc.invalidateQueries({ queryKey: ["topics"] });
    }, isNew ? "Topic added" : "Topic saved");
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "New topic" : `Edit ${initial.name}`}</DialogTitle>
          <DialogDescription>Changing the template only affects new posts.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="topic-name">Name</FieldLabel>
            <Input id="topic-name" autoFocus placeholder="e.g. Feature Promotion" value={f.name ?? ""} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="topic-description">What it means</FieldLabel>
            <Input id="topic-description" placeholder="e.g. Show one Poko feature and the problem it solves" value={f.description ?? ""}
              onChange={(e) => setF({ ...f, description: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="topic-template">Template</FieldLabel>
            <Textarea id="topic-template" className="min-h-56 font-mono text-sm" value={f.template ?? ""} onChange={(e) => setF({ ...f, template: e.target.value })}
              placeholder={"[Hook]\n\n[The point]\n\n[Call to action]"} />
            <FieldDescription>New posts in this topic start with this text. Put the parts to fill in inside [brackets].</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !f.name?.trim()} onClick={save}>{busy ? "Saving…" : isNew ? "Add topic" : "Save topic"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

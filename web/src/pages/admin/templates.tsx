import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAccounts, useMembers, usePlatforms, useTemplates } from "@/lib/data";
import { attempt } from "@/lib/errors";
import type { Template } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AccountPicker } from "@/components/account-picker";
import { Confirm } from "@/components/confirm";
import { DatePicker } from "@/components/date-picker";
import { PageHeader } from "@/components/page-header";
import { PersonSelect } from "@/components/people";
import { PlatformIcon } from "@/components/platform";
import { TimezoneSelect, browserTimeZone } from "@/components/timezone-select";
import { parseYmd, ymd } from "@/lib/dates";
import { describeSchedule, runDates, TEMPLATE_HORIZON_DAYS, todayIn, WEEKDAYS, zonedToEpoch } from "../../../../shared/schedule";

const fmtYmd = (s: string) => parseYmd(s).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

/** Next few run dates, looking well past the generation window. */
function nextRuns(t: Pick<Template, "weekdays" | "time" | "timezone" | "starts_on" | "ends_on">, n = 3) {
  // Skip today's slot if its time has already passed, like the server does.
  return runDates(t, todayIn(t.timezone), 60).filter((d) => zonedToEpoch(d, t.time, t.timezone) > Date.now()).slice(0, n);
}

function WeekdayStrip({ days }: { days: number[] }) {
  return (
    <div className="flex gap-1">
      {WEEKDAYS.map((d) => (
        <span key={d.n} title={d.long}
          className={cn("flex size-7 items-center justify-center rounded-full text-[11px] font-medium",
            days.includes(d.n) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
          {d.short[0]}
        </span>
      ))}
    </div>
  );
}

export function TemplatesPage() {
  const q = useTemplates();
  const accounts = useAccounts().data ?? [];
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const list = q.data ?? [];
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ["templates"] })]);

  const toggle = (t: Template, active: boolean) =>
    attempt(async () => {
      const r = await api<{ removed: number; created: number }>(`/admin/templates/${t.id}`, { method: "PATCH", json: { active } });
      await refresh();
      toast.success(active ? `${t.title} resumed` : `${t.title} paused`, {
        description: active ? `${r.created} upcoming draft${r.created === 1 ? "" : "s"} created.` : r.removed ? `${r.removed} untouched upcoming draft${r.removed === 1 ? "" : "s"} removed.` : undefined,
      });
    });
  const remove = (t: Template) =>
    attempt(async () => {
      await api(`/admin/templates/${t.id}`, { method: "DELETE" });
      await refresh();
    }, "Template deleted");

  const blank: Partial<Template> = { weekdays: [1, 2, 3, 4, 5], time: "10:00", timezone: browserTimeZone(), starts_on: ymd(new Date()), ends_on: null, active: 1, account_ids: [] };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Templates"
        description={`Repeating posts. Each active template drafts a post on its weekdays, ${TEMPLATE_HORIZON_DAYS} days ahead, for members to finish and publish.`}
        actions={<Button onClick={() => setEditing(blank)}><Plus /> New template</Button>}
      />
      {q.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-56 rounded-xl" />)}</div>
      ) : list.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Repeat /></EmptyMedia>
            <EmptyTitle>No templates yet</EmptyTitle>
            <EmptyDescription>Create one for posts that repeat, like a Monday tip or a Friday recap.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button onClick={() => setEditing(blank)}><Plus /> New template</Button></EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((t) => {
            const accs = accounts.filter((a) => t.account_ids.includes(a.id));
            const next = t.active ? nextRuns(t) : [];
            return (
              <Card key={t.id} className={cn(!t.active && "opacity-70")}>
                <CardHeader>
                  <CardTitle>{t.title}</CardTitle>
                  <CardDescription className="flex items-center gap-1.5"><Repeat className="size-3.5" />{describeSchedule(t.weekdays, t.time)} <span className="text-xs">({t.timezone.replaceAll("_", " ")})</span></CardDescription>
                  <CardAction><Switch checked={!!t.active} onCheckedChange={(v) => toggle(t, v)} aria-label={t.active ? "Pause template" : "Resume template"} /></CardAction>
                </CardHeader>
                <CardContent className="space-y-4">
                  <WeekdayStrip days={t.weekdays} />
                  {t.body && <p className="line-clamp-2 text-sm text-muted-foreground">{t.body}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    {accs.map((a) => (
                      <Badge key={a.id} variant="outline" className="font-normal"><PlatformIcon k={a.platform_key} name={a.platform_name} color={a.platform_color} /><span className="text-muted-foreground">{a.handle}</span></Badge>
                    ))}
                  </div>
                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="mt-px size-3.5 shrink-0" />
                    {t.active ? (next.length ? <>Next: {next.map(fmtYmd).join(" · ")}</> : "No more dates in its range") : "Paused"}
                    {t.ends_on && <span className="ml-auto shrink-0">Ends {fmtYmd(t.ends_on)}</span>}
                  </div>
                </CardContent>
                <CardFooter className="mt-auto justify-between gap-2 border-t">
                  <span className="text-xs text-muted-foreground">{t.post_count} post{t.post_count === 1 ? "" : "s"} made</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(t)}><Pencil /> Edit</Button>
                    <Confirm title={`Delete ${t.title}?`} description="Upcoming drafts nobody has touched are removed. Posts already worked on stay." onConfirm={() => remove(t)}>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"><Trash2 /> Delete</Button>
                    </Confirm>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
      {editing && <TemplateDialog initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const PRESETS = [
  { label: "Every day", days: [1, 2, 3, 4, 5, 6, 7] },
  { label: "Weekdays", days: [1, 2, 3, 4, 5] },
  { label: "Weekends", days: [6, 7] },
];

function TemplateDialog({ initial, onClose }: { initial: Partial<Template>; onClose: () => void }) {
  const qc = useQueryClient();
  const members = useMembers();
  const accounts = useAccounts().data ?? [];
  const platforms = usePlatforms().data ?? [];
  const [f, setF] = useState<Partial<Template>>(initial);
  const [hasEnd, setHasEnd] = useState(!!initial.ends_on);
  const [busy, setBusy] = useState(false);
  const isNew = !f.id;
  const set = (patch: Partial<Template>) => setF((x) => ({ ...x, ...patch }));
  const days = f.weekdays ?? [];
  const ids = f.account_ids ?? [];

  const limits = accounts.filter((a) => ids.includes(a.id)).map((a) => platforms.find((p) => p.id === a.platform_id)?.char_limit).filter((n): n is number => !!n);
  const limit = limits.length ? Math.min(...limits) : null;
  const len = [...(f.body ?? "")].length;
  const preview = useMemo(
    () => (days.length && f.time && f.timezone && f.starts_on ? nextRuns({ weekdays: days, time: f.time, timezone: f.timezone, starts_on: f.starts_on, ends_on: hasEnd ? f.ends_on ?? null : null }, 5) : []),
    [days, f.time, f.timezone, f.starts_on, f.ends_on, hasEnd],
  );

  const save = async () => {
    setBusy(true);
    const json = { ...f, ends_on: hasEnd ? f.ends_on : null, active: !!f.active };
    const ok = await attempt(async () => {
      const r = await api<{ created: number; removed?: number }>(isNew ? "/admin/templates" : `/admin/templates/${f.id}`, { method: isNew ? "POST" : "PUT", json });
      await qc.invalidateQueries({ queryKey: ["templates"] });
      toast.success(isNew ? "Template created" : "Template saved", {
        description: [r.removed ? `${r.removed} untouched draft${r.removed === 1 ? "" : "s"} rebuilt` : "", `${r.created} upcoming draft${r.created === 1 ? "" : "s"} created`].filter(Boolean).join(" · "),
      });
    });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "New template" : `Edit ${initial.title}`}</DialogTitle>
          <DialogDescription>
            {isNew ? "Drafts appear on the chosen days for members to finish." : "Upcoming drafts nobody has touched are rebuilt from your changes. Posts already worked on stay as they are."}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="tpl-title">Title</FieldLabel>
            <Input id="tpl-title" autoFocus placeholder="e.g. Monday tip" value={f.title ?? ""} onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="tpl-body">Post text</FieldLabel>
              <span className={cn("text-xs tabular-nums text-muted-foreground", limit && len > limit && "font-medium text-destructive")}>{limit ? `${len} / ${limit}` : len}</span>
            </div>
            <Textarea id="tpl-body" className="min-h-28" placeholder="Starting text for every post. Members can edit each one." value={f.body ?? ""} onChange={(e) => set({ body: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="tpl-notes">Brief & notes</FieldLabel>
            <Textarea id="tpl-notes" placeholder="What each post should cover, hashtags, where to find assets…" value={f.notes ?? ""} onChange={(e) => set({ notes: e.target.value })} />
          </Field>

          <FieldSet>
            <FieldLegend variant="label">Repeats on</FieldLegend>
            <div className="flex flex-wrap items-center gap-3">
              <ToggleGroup type="multiple" variant="outline" spacing={1} value={days.map(String)} onValueChange={(v) => set({ weekdays: v.map(Number).sort() })} aria-label="Weekdays">
                {WEEKDAYS.map((d) => (
                  <ToggleGroupItem key={d.n} value={String(d.n)} aria-label={d.long} className="w-11 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{d.short}</ToggleGroupItem>
                ))}
              </ToggleGroup>
              <div className="flex gap-1">
                {PRESETS.map((p) => (
                  <Button key={p.label} type="button" size="sm" variant={days.join() === p.days.join() ? "secondary" : "ghost"} onClick={() => set({ weekdays: p.days })}>{p.label}</Button>
                ))}
              </div>
            </div>
            <FieldDescription>{days.length ? describeSchedule(days, f.time ?? "10:00") : "Pick at least one day."}</FieldDescription>
          </FieldSet>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="tpl-time">Post time</FieldLabel>
              <Input id="tpl-time" type="time" value={f.time ?? "10:00"} onChange={(e) => e.target.value && set({ time: e.target.value })} />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel>Timezone</FieldLabel>
              <TimezoneSelect value={f.timezone ?? browserTimeZone()} onChange={(tz) => set({ timezone: tz })} />
            </Field>
            <Field>
              <FieldLabel>Starts</FieldLabel>
              <DatePicker value={parseYmd(f.starts_on)} onChange={(d) => set({ starts_on: ymd(d) })} />
            </Field>
            <Field className="sm:col-span-2">
              <div className="flex items-center gap-2">
                <Switch id="tpl-end" checked={hasEnd} onCheckedChange={(v) => (setHasEnd(v), v && !f.ends_on && set({ ends_on: f.starts_on }))} />
                <FieldLabel htmlFor="tpl-end">Ends on a date</FieldLabel>
              </div>
              {hasEnd ? <DatePicker value={parseYmd(f.ends_on ?? f.starts_on)} onChange={(d) => set({ ends_on: ymd(d) })} /> : <p className="text-sm text-muted-foreground">Runs until you pause it.</p>}
            </Field>
          </div>
          {preview.length > 0 && (
            <p className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-sm"><CalendarClock className="size-4 text-muted-foreground" />Next: {preview.map(fmtYmd).join(" · ")}</p>
          )}

          <Field>
            <FieldLabel>Post to</FieldLabel>
            <AccountPicker selected={ids} onChange={(v) => set({ account_ids: v })} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field><FieldLabel>Writer</FieldLabel><PersonSelect people={members} value={f.writer_id ?? null} onChange={(v) => set({ writer_id: v })} /></Field>
            <Field><FieldLabel>Creative (media)</FieldLabel><PersonSelect people={members} value={f.creative_id ?? null} onChange={(v) => set({ creative_id: v })} /></Field>
          </div>
          <Field orientation="horizontal">
            <Switch id="tpl-active" checked={!!f.active} onCheckedChange={(v) => set({ active: v ? 1 : 0 })} />
            <FieldLabel htmlFor="tpl-active">Active, create drafts automatically</FieldLabel>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !f.title?.trim() || !days.length || !ids.length} onClick={save}>{busy ? "Saving…" : isNew ? "Create template" : "Save template"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

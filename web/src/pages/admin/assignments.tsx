import { Fragment } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Workflow } from "lucide-react";
import { api } from "@/lib/api";
import { useMembers, useRules } from "@/lib/data";
import { attempt } from "@/lib/errors";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { PersonAvatar, PersonSelect } from "@/components/people";
import { PlatformLabel } from "@/components/platform";
import { useAccountGroups } from "./accounts";

const JOBS = [
  ["manager", "Posts it"],
  ["writer", "Writes"],
  ["creative", "Media"],
] as const;
type Job = (typeof JOBS)[number][0];

export function AssignmentsPage() {
  const groups = useAccountGroups();
  const members = useMembers();
  const rules = useRules().data ?? [];
  const qc = useQueryClient();
  const get = (accountId: number, job: Job) => rules.find((r) => r.account_id === accountId && r.role === job)?.profile_id ?? null;
  const set = (ids: number[], job: Job, profile_id: number | null) =>
    attempt(async () => {
      for (const account_id of ids) await api("/admin/rules", { method: "PUT", json: { account_id, role: job, profile_id } });
      await qc.invalidateQueries({ queryKey: ["rules"] });
    });

  if (!groups.length)
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Assignments" />
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Workflow /></EmptyMedia>
            <EmptyTitle>No accounts yet</EmptyTitle>
            <EmptyDescription>Add accounts first, then choose who handles each one.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader title="Assignments" description="Who handles each account on each platform. New posts pick these members up automatically, and each post can still override them." />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Account</TableHead>
              {JOBS.map(([k, label]) => <TableHead key={k} className="min-w-44">{label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => {
              const ids = g.accounts.map((a) => a.id);
              return (
                <Fragment key={g.name}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell className="pl-4 font-medium">{g.name} <span className="text-xs font-normal text-muted-foreground">all platforms</span></TableCell>
                    {JOBS.map(([job]) => {
                      const vals = new Set(ids.map((id) => get(id, job)));
                      const v = vals.size === 1 ? [...vals][0] : undefined;
                      return (
                        <TableCell key={job}>
                          <PersonSelect people={members} value={v} placeholder={v === undefined ? "Mixed" : "Unassigned"} onChange={(p) => set(ids, job, p)} />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                  {g.accounts.length > 1 && g.accounts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="pl-8"><PlatformLabel color={a.platform_color} name={a.platform_name} detail={a.handle} /></TableCell>
                      {JOBS.map(([job]) => (
                        <TableCell key={job}><PersonSelect people={members} value={get(a.id, job)} onChange={(p) => set([a.id], job, p)} /></TableCell>
                      ))}
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <section>
        <h2 className="mb-3 font-medium">By member</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((p) => {
            const mine = rules.filter((r) => r.profile_id === p.id);
            return (
              <Card key={p.id} className="gap-3 p-4">
                <div className="flex items-center gap-2"><PersonAvatar person={p} /><span className="font-medium">{p.name}</span><span className="ml-auto text-xs text-muted-foreground">{mine.length}</span></div>
                {mine.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing assigned</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {mine.map((r) => {
                      const a = groups.flatMap((g) => g.accounts).find((x) => x.id === r.account_id);
                      return a && (
                        <li key={r.id} className="flex items-center justify-between gap-2">
                          <PlatformLabel color={a.platform_color} name={a.platform_name} detail={a.handle} className="text-xs" />
                          <span className="shrink-0 text-xs text-muted-foreground">{JOBS.find(([k]) => k === r.role)?.[1]}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}

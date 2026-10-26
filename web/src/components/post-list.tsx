import { Fragment, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePeopleMap, useTopics } from "@/lib/data";
import { fmtDateTime } from "@/lib/dates";
import type { PostSummary, PostVersion } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PersonAvatar } from "@/components/people";
import { PlatformIcon } from "@/components/platform";
import { StatusBadge, VersionStatus } from "@/components/status";
import type { Status } from "../../../shared/rules";

const overdue = (at: number | null, status: Status) => !!at && at < Date.now() && status !== "completed";
const unique = (list: (number | null)[]) => [...new Set(list.filter((x): x is number => !!x))];

/** How a table is sorted: by status (not ready, working, completed) or by time, either way round. */
type Sort = { by: "status" | "time"; dir: "asc" | "desc" };
const RANK: Record<Status, number> = { not_ready: 0, working: 1, completed: 2 };
const SORT_TITLE = { status: { asc: "Not ready first", desc: "Completed first" }, time: { asc: "Soonest first", desc: "Latest first" } } as const;

/** Orders two rows; each key breaks the other's ties, and rows without a date always go last. */
function compare(sort: Sort, a: { status: Status; at: number | null }, b: { status: Status; at: number | null }) {
  const flip = sort.dir === "desc" ? -1 : 1;
  const status = RANK[a.status] - RANK[b.status];
  const time = a.at === b.at ? 0 : a.at === null ? 1 : b.at === null ? -1 : (a.at - b.at) * (sort.by === "time" ? flip : 1);
  return sort.by === "status" ? status * flip || time : time || status;
}

/** The sort for one page, remembered in this browser. Choosing the current key again reverses it. */
function useSort(page: string) {
  const key = `sort:${page}`;
  const [sort, setSort] = useState<Sort>(() => {
    try {
      const s = JSON.parse(localStorage.getItem(key) ?? "null");
      if ((s?.by === "status" || s?.by === "time") && (s.dir === "asc" || s.dir === "desc")) return s;
    } catch {
      /* storage blocked or an old value: use the default */
    }
    return { by: "time", dir: "asc" };
  });
  const choose = (by: Sort["by"]) => {
    const next: Sort = { by, dir: sort.by === by && sort.dir === "asc" ? "desc" : "asc" };
    setSort(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* not remembered, still sorted */
    }
  };
  return [sort, choose] as const;
}

/**
 * Posts as a table, each followed by its versions (one per account): status, date, title, topic,
 * and who does the content, media and posting. Click a row to open the post (at that version).
 * Click Status or Date to sort by it (again to reverse); `sortKey` remembers the choice per page.
 * `only` limits which versions are listed, e.g. to the signed-in person's in My work.
 */
export function PostList({ posts, only, sortKey }: { posts: PostSummary[]; only?: (v: PostVersion) => boolean; sortKey: string }) {
  const nav = useNavigate();
  const topics = new Map((useTopics().data ?? []).map((t) => [t.id, t.name]));
  const [sort, choose] = useSort(sortKey);
  const rows = posts
    .map((p) => ({
      p,
      versions: (only ? p.versions.filter(only) : p.versions).toSorted((a, b) =>
        compare(sort, { status: a.status, at: a.scheduled_at ?? p.scheduled_at }, { status: b.status, at: b.scheduled_at ?? p.scheduled_at })),
    }))
    .toSorted((a, b) => compare(sort, { status: a.p.status, at: a.p.scheduled_at }, { status: b.p.status, at: b.p.scheduled_at }));
  const ariaSort = (by: Sort["by"]) => (sort.by !== by ? "none" : sort.dir === "asc" ? "ascending" : "descending");
  const [folded, setFolded] = useState<Set<number>>(new Set());
  const fold = (id: number) => setFolded((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  return (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-44 pl-4" aria-sort={ariaSort("status")}><SortButton label="Status" by="status" sort={sort} onSort={choose} /></TableHead>
            <TableHead className="w-40" aria-sort={ariaSort("time")}><SortButton label="Date" by="time" sort={sort} onSort={choose} /></TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-44">Topic</TableHead>
            <TableHead className="w-32">Content</TableHead>
            <TableHead className="w-32">Media</TableHead>
            <TableHead className="w-36 pr-4">Post</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ p, versions }) => {
            const open = !folded.has(p.id);
            return (
              <Fragment key={p.id}>
                <TableRow className="cursor-pointer" onClick={() => nav(`/posts/${p.id}`)}>
                  <TableCell className="pl-2" onClick={(e) => e.stopPropagation()}>
                    <span className="flex items-center gap-1">
                      {versions.length > 0 ? (
                        <Button variant="ghost" size="icon-xs" onClick={() => fold(p.id)} aria-expanded={open}
                          aria-label={`${open ? "Hide" : "Show"} ${p.title} versions`}>
                          <ChevronDown className={cn("transition-transform", !open && "-rotate-90")} />
                        </Button>
                      ) : <span className="size-6" />}
                      <StatusBadge status={p.status} />
                    </span>
                  </TableCell>
                  <When at={p.scheduled_at} late={overdue(p.scheduled_at, p.status)} />
                  <TableCell className="max-w-0 min-w-48">
                    <Link to={`/posts/${p.id}`} onClick={(e) => e.stopPropagation()}
                      className={cn("block truncate font-medium hover:underline", p.status === "completed" && "text-muted-foreground line-through")}>
                      {p.title}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-44 truncate text-muted-foreground">{topics.get(p.topic_id ?? 0) ?? "—"}</TableCell>
                  <TableCell><People ids={unique(versions.map((v) => v.writer_id))} /></TableCell>
                  <TableCell><People ids={unique(versions.map((v) => v.creative_id))} /></TableCell>
                  <TableCell className="pr-4"><People ids={unique(versions.map((v) => v.poster_id))} /></TableCell>
                </TableRow>
                {open && versions.map((v) => <VersionRow key={v.account_id} post={p} version={v} />)}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

/** A sortable column heading: shows which way it's sorted, or that it can be. */
function SortButton({ label, by, sort, onSort }: { label: string; by: Sort["by"]; sort: Sort; onSort: (by: Sort["by"]) => void }) {
  const active = sort.by === by;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button type="button" onClick={() => onSort(by)} title={active ? `${SORT_TITLE[by][sort.dir]}, click to reverse` : `Sort by ${label.toLowerCase()}`}
      className={cn("-mx-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active && "text-foreground")}>
      {label}
      <Icon className={cn("size-3.5", !active && "opacity-40")} />
    </button>
  );
}

/** One version: its own status, time (the post's unless set), account, and people. */
function VersionRow({ post: p, version: v }: { post: PostSummary; version: PostVersion }) {
  const nav = useNavigate();
  const at = v.scheduled_at ?? p.scheduled_at;
  const open = () => nav(`/posts/${p.id}?v=${v.account_id}`);
  return (
    <TableRow className="cursor-pointer bg-muted/25 text-[13px]" onClick={open}>
      <TableCell className="pl-9" onClick={(e) => e.stopPropagation()}>
        <VersionStatus postId={p.id} version={v} size="sm" />
      </TableCell>
      <When at={at} late={overdue(at, v.status)} inherited={!v.scheduled_at} />
      <TableCell className="max-w-0">
        <span className={cn("flex min-w-0 items-center gap-1.5 pl-3", v.status === "completed" && "text-muted-foreground line-through")}>
          <PlatformIcon k={v.platform_key} name={v.platform_name} color={v.platform_color} className="size-3.5 shrink-0" />
          <span className="truncate">{v.brand_name}</span>
          {v.posted_url && (
            <a href={v.posted_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
              className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={`Open the live post on ${v.platform_name}`}>
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </span>
      </TableCell>
      <TableCell />
      <TableCell><People ids={unique([v.writer_id])} /></TableCell>
      <TableCell><People ids={unique([v.creative_id])} /></TableCell>
      <TableCell className="pr-4"><People ids={unique([v.poster_id])} /></TableCell>
    </TableRow>
  );
}

/** The date cell: red when past and not completed, faded when a version just follows the post's time. */
function When({ at, late, inherited }: { at: number | null; late: boolean; inherited?: boolean }) {
  return (
    <TableCell className={cn("whitespace-nowrap tabular-nums", late ? "font-medium text-destructive" : "text-muted-foreground", inherited && !late && "opacity-60")}>
      {at ? fmtDateTime(at) : "No date"}
    </TableCell>
  );
}

/** One person with their name, or several as avatars, or a dash. */
function People({ ids }: { ids: number[] }) {
  const people = usePeopleMap();
  const list = ids.map((id) => people.get(id)).filter((p) => !!p);
  if (!list.length) return <span className="text-muted-foreground">—</span>;
  if (list.length === 1)
    return (
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <PersonAvatar person={list[0]} size="sm" />
        <span className="truncate">{list[0].name}</span>
      </span>
    );
  return (
    <span className="flex -space-x-1" title={list.map((p) => p.name).join(", ")}>
      {list.map((p) => <PersonAvatar key={p.id} person={p} size="sm" className="ring-2 ring-card" />)}
    </span>
  );
}

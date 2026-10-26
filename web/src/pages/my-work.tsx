import { useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { useDashboard, useMe } from "@/lib/data";
import type { PostSummary, PostVersion } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PageHeader } from "@/components/page-header";
import { PostList } from "@/components/post-list";

const TABS = {
  all: { label: "All", empty: "No open versions for you.", keys: ["writer_id", "creative_id", "poster_id"] },
  content: { label: "Content", empty: "No versions for you to write.", keys: ["writer_id"] },
  media: { label: "Media", empty: "No media for you to make.", keys: ["creative_id"] },
  post: { label: "Post", empty: "No versions for you to publish.", keys: ["poster_id"] },
} as const;
type Tab = keyof typeof TABS;

/** The signed-in member's open versions: ones they write, make media for, or publish, under their posts. */
export function MyWorkPage() {
  const [sp, setSp] = useSearchParams();
  const tab: Tab = (sp.get("tab") as Tab) in TABS ? (sp.get("tab") as Tab) : "all";
  const me = useMe().data?.id;
  const q = useQuery({ queryKey: ["posts", "mine", tab], queryFn: () => api<PostSummary[]>(`/posts?mine=${tab}&status=open`) });
  const mine = (v: PostVersion) => v.status !== "completed" && TABS[tab].keys.some((k) => v[k] === me);
  const counts = useDashboard().data;
  const rows = q.data ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="My work" description="Open versions you write (Content by), make media for (Media by), or publish (Posted by). All shows every one of them." />
      <Tabs className="mb-5" value={tab} onValueChange={(v) => setSp({ tab: v }, { replace: true })}>
        <TabsList>
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <TabsTrigger key={t} value={t}>
              {TABS[t].label}
              {!!counts?.[t] && <span className="ml-1 text-xs tabular-nums text-muted-foreground">{counts[t]}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {q.isPending ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : rows.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
            <EmptyTitle>All caught up</EmptyTitle>
            <EmptyDescription>{TABS[tab].empty}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <PostList posts={rows} only={mine} sortKey="mine" />
      )}
    </div>
  );
}

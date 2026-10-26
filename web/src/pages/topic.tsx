import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, FileText, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useTopics } from "@/lib/data";
import type { PostSummary, Topic } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PageHeader } from "@/components/page-header";
import { PostList } from "@/components/post-list";

/** One topic's posts (/topics/:id), split into Open and Completed. */
export function TopicPage() {
  const { id } = useParams();
  const topics = useTopics();
  const topic = topics.data?.find((t) => t.id === Number(id));
  if (topics.isPending) return <Skeleton className="h-64 rounded-xl" />;
  if (!topic) return <p className="text-muted-foreground">This topic no longer exists.</p>;
  return <TopicPosts key={topic.id} topic={topic} />;
}

function TopicPosts({ topic }: { topic: Topic }) {
  const [sp, setSp] = useSearchParams();
  const status = sp.get("show") === "completed" ? "completed" : "open";
  const query = `status=${status}&topic=${topic.id}`;
  const q = useQuery({ queryKey: ["posts", query], queryFn: () => api<PostSummary[]>(`/posts?${query}`) });
  const rows = q.data ?? [];
  const newPost = `/posts/new?topic=${topic.id}`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={topic.name}
        description={topic.description}
        actions={<Button asChild><Link to={newPost}><Plus /> New post</Link></Button>}
      />
      <TemplatePreview topic={topic} />
      <Tabs className="mb-5" value={status} onValueChange={(v) => {
        const n = new URLSearchParams(sp);
        if (v === "completed") n.set("show", "completed");
        else n.delete("show");
        setSp(n, { replace: true });
      }}>
        <TabsList>
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
        </TabsList>
      </Tabs>
      {q.isPending ? (
        <Skeleton className="h-48 rounded-xl" />
      ) : rows.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><FileText /></EmptyMedia>
            <EmptyTitle>{status === "open" ? "Nothing to do" : "Nothing completed yet"}</EmptyTitle>
            <EmptyDescription>
              {status === "open" ? `No open posts for ${topic.name}.` : "Posts show up here once every version is completed."}
            </EmptyDescription>
          </EmptyHeader>
          {status === "open" && <EmptyContent><Button asChild><Link to={newPost}><Plus /> New post</Link></Button></EmptyContent>}
        </Empty>
      ) : (
        <PostList posts={rows} sortKey="topic" />
      )}
    </div>
  );
}

/** The topic's starter text, folded away until asked for. */
function TemplatePreview({ topic }: { topic: Topic }) {
  const [open, setOpen] = useState(false);
  if (!topic.template.trim()) return null;
  return (
    <Card className="mb-6 gap-0 py-0">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <FileText className="size-4 text-muted-foreground" />
        Template
        <span className="font-normal text-muted-foreground">· new posts start with this text</span>
        <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <CardContent className="border-t py-4">
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{topic.template}</p>
        </CardContent>
      )}
    </Card>
  );
}

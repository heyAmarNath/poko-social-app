import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { useRefresh } from "@/lib/data";
import { attempt } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STATUS_LABEL, TRANSITIONS, type Status } from "../../../shared/rules";

export const STATUS_DOT: Record<Status, string> = {
  not_ready: "bg-zinc-400",
  working: "bg-amber-500",
  scheduled: "bg-sky-500",
  posted: "bg-emerald-500",
  cancelled: "bg-zinc-300 dark:bg-zinc-600",
};

export function StatusDot({ status, className }: { status: Status; className?: string }) {
  return <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[status], className)} />;
}

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-normal", status === "cancelled" && "text-muted-foreground line-through", className)}>
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/** Status badge that opens a menu of allowed next statuses. Marking as posted asks for the live URL. */
export function StatusMenu({ target }: { target: { id: number; status: Status } }) {
  const refresh = useRefresh();
  const [posting, setPosting] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const move = async (to: Status, posted_url?: string) => {
    setBusy(true);
    await attempt(async () => {
      await api(`/targets/${target.id}/status`, { method: "POST", json: { status: to, posted_url } });
      refresh();
    }, `Moved to ${STATUS_LABEL[to]}`);
    setBusy(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={busy}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 inline-flex items-center gap-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <StatusBadge status={target.status} className="pr-1.5 hover:bg-muted" />
            <ChevronDown className="-ml-5 mr-1.5 size-3 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {TRANSITIONS[target.status].map((s) => (
            <DropdownMenuItem key={s} onSelect={() => (s === "posted" ? (setUrl(""), setPosting(true)) : move(s))}>
              <StatusDot status={s} />
              {STATUS_LABEL[s]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={posting} onOpenChange={setPosting}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Mark as posted</DialogTitle>
            <DialogDescription>Paste the link to the live post so everyone can find it. You can add it later.</DialogDescription>
          </DialogHeader>
          <Input autoFocus placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPosting(false)}>Cancel</Button>
            <Button onClick={() => (setPosting(false), move("posted", url.trim() || undefined))}>Mark as posted</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

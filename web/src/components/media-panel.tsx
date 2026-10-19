import { useEffect, useRef, useState } from "react";
import { Download, FileText, ImagePlus, Link2, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { api, upload } from "@/lib/api";
import { useRefresh } from "@/lib/data";
import { attempt, errorMessage } from "@/lib/errors";
import type { Attachment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Confirm } from "@/components/confirm";
import { MAX_UPLOAD_BYTES } from "../../../shared/rules";

/** A file or link staged on the New Post screen, saved once the post exists. */
export interface PendingMedia {
  key: string;
  label: string;
  file?: File;
  commit: (postId: number) => Promise<void>;
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
const MAX_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);

type Props =
  | { postId: number; attachments: Attachment[]; pending?: never; setPending?: never }
  | { postId?: never; attachments?: never; pending: PendingMedia[]; setPending: (p: PendingMedia[]) => void };

export function MediaPanel(props: Props) {
  const refresh = useRefresh();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<Record<string, { name: string; pct: number }>>({});
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [drag, setDrag] = useState(false);
  const live = props.postId !== undefined;

  const addFiles = async (files: File[]) => {
    const tooBig = files.filter((f) => f.size > MAX_UPLOAD_BYTES);
    if (tooBig.length) toast.error(`${tooBig.map((f) => f.name).join(", ")} is over ${MAX_MB} MB`, { description: "Upload it to Drive or Dropbox and add the link instead." });
    const ok = files.filter((f) => f.size <= MAX_UPLOAD_BYTES);
    if (!live) {
      props.setPending([
        ...props.pending,
        ...ok.map((file) => ({ key: crypto.randomUUID(), label: file.name, file, commit: (id: number) => upload(`/posts/${id}/attachments`, file) })),
      ]);
      return;
    }
    for (const f of ok) {
      const k = crypto.randomUUID();
      setProgress((s) => ({ ...s, [k]: { name: f.name, pct: 0 } }));
      try {
        await upload(`/posts/${props.postId}/attachments`, f, (pct) => setProgress((s) => ({ ...s, [k]: { name: f.name, pct } })));
      } catch (e) {
        toast.error(`${f.name}: ${errorMessage(e)}`);
      } finally {
        setProgress(({ [k]: _, ...rest }) => rest);
      }
    }
    refresh();
  };

  // Paste an image from the clipboard anywhere on the page.
  useEffect(() => {
    const h = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (!files.length) return;
      e.preventDefault();
      addFiles(files.map((f, i) => (f.name === "image.png" ? new File([f], `pasted-${Date.now()}-${i}.png`, { type: f.type }) : f)));
    };
    window.addEventListener("paste", h);
    return () => window.removeEventListener("paste", h);
  });

  const addLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = linkUrl.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch {
      return void toast.error("That doesn't look like a link");
    }
    const json = { url, filename: linkName.trim() || undefined };
    if (!live) {
      props.setPending([...props.pending, { key: crypto.randomUUID(), label: json.filename ?? url, commit: (id) => api(`/posts/${id}/links`, { method: "POST", json }) }]);
    } else if (!(await attempt(async () => (await api(`/posts/${props.postId}/links`, { method: "POST", json }), refresh())))) {
      return;
    }
    setLinkUrl("");
    setLinkName("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Media & attachments</CardTitle>
        <CardDescription>Images, videos and files up to {MAX_MB} MB, or links to larger files.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <button
          type="button"
          onDragOver={(e) => (e.preventDefault(), setDrag(true))}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => (e.preventDefault(), setDrag(false), addFiles([...e.dataTransfer.files]))}
          onClick={() => input.current?.click()}
          className={cn(
            "flex w-full flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground transition-colors hover:bg-muted/50",
            drag && "border-primary bg-muted",
          )}
        >
          <Upload className="size-5" />
          <span><span className="font-medium text-foreground">Click to upload</span>, drag and drop, or paste an image</span>
          <input ref={input} type="file" multiple hidden onChange={(e) => (addFiles([...(e.target.files ?? [])]), (e.target.value = ""))} />
        </button>
        {Object.entries(progress).map(([k, p]) => (
          <div key={k} className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground"><span className="truncate">{p.name}</span><span>{p.pct}%</span></div>
            <Progress value={p.pct} />
          </div>
        ))}
        <form onSubmit={addLink} className="flex flex-wrap gap-2">
          <div className="relative min-w-48 flex-1">
            <Link2 className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Link to Drive, Dropbox, Figma, Canva…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          </div>
          <Input className="w-40" placeholder="Label (optional)" value={linkName} onChange={(e) => setLinkName(e.target.value)} />
          <Button type="submit" variant="outline" disabled={!linkUrl.trim()}>Add link</Button>
        </form>

        {live ? (
          props.attachments.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {props.attachments.map((a) => (
                <AttachmentTile key={a.id} a={a} onDelete={() => attempt(async () => (await api(`/attachments/${a.id}`, { method: "DELETE" }), refresh()), "Removed")} />
              ))}
            </div>
          )
        ) : (
          props.pending.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {props.pending.map((p) => (
                <li key={p.key} className="flex items-center gap-2 px-3 py-2 text-sm">
                  {p.file ? <FileText className="size-4 text-muted-foreground" /> : <Link2 className="size-4 text-muted-foreground" />}
                  <span className="truncate">{p.label}</span>
                  {p.file && <span className="text-xs text-muted-foreground">{mb(p.file.size)}</span>}
                  <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label="Remove" onClick={() => props.setPending(props.pending.filter((x) => x.key !== p.key))}><X /></Button>
                </li>
              ))}
            </ul>
          )
        )}
      </CardContent>
    </Card>
  );
}

function AttachmentTile({ a, onDelete }: { a: Attachment; onDelete: () => void }) {
  const src = `/api/files/${a.id}`;
  const thumb =
    a.kind === "link" ? (
      <a href={a.url!} target="_blank" rel="noreferrer" className="flex h-28 items-center justify-center bg-muted"><Link2 className="size-6 text-muted-foreground" /></a>
    ) : a.mime?.startsWith("image/") ? (
      <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={a.filename} loading="lazy" className="h-28 w-full bg-muted object-cover" /></a>
    ) : a.mime?.startsWith("video/") ? (
      <video src={src} controls preload="metadata" className="h-28 w-full bg-black object-contain" />
    ) : (
      <a href={src} target="_blank" rel="noreferrer" className="flex h-28 items-center justify-center bg-muted"><ImagePlus className="size-6 text-muted-foreground" /></a>
    );
  return (
    <div className="overflow-hidden rounded-lg border">
      {thumb}
      <div className="flex items-center gap-1 p-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium" title={a.filename}>{a.filename}</div>
          <div className="text-[11px] text-muted-foreground">{a.kind === "link" ? "Link" : a.size ? mb(a.size) : ""}</div>
        </div>
        {a.kind === "file" && (
          <Button asChild variant="ghost" size="icon-xs" aria-label="Download"><a href={`${src}?download=1`}><Download /></a></Button>
        )}
        <Confirm title={`Remove ${a.filename}?`} action="Remove" onConfirm={onDelete}>
          <Button variant="ghost" size="icon-xs" aria-label="Remove"><Trash2 /></Button>
        </Confirm>
      </div>
    </div>
  );
}

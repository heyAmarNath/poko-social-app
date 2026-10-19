import { useEffect, useRef, useState } from "react";
import { api, upload } from "../lib/api";
import { useRefresh } from "../lib/data";
import type { Attachment } from "../lib/types";
import { ErrorText } from "./ui";
import { MAX_UPLOAD_BYTES } from "../../../shared/rules";

/** A file or link staged on the New Post screen, uploaded once the post exists. */
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
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [err, setErr] = useState<unknown>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkName, setLinkName] = useState("");
  const [drag, setDrag] = useState(false);
  const live = props.postId !== undefined;

  const addFiles = async (files: File[]) => {
    setErr(null);
    const tooBig = files.filter((f) => f.size > MAX_UPLOAD_BYTES);
    if (tooBig.length) setErr(new Error(`${tooBig.map((f) => f.name).join(", ")} is over ${MAX_MB} MB. Upload it to Drive or Dropbox and add the link instead.`));
    const ok = files.filter((f) => f.size <= MAX_UPLOAD_BYTES);
    if (!live) {
      props.setPending([
        ...props.pending,
        ...ok.map((file) => ({ key: crypto.randomUUID(), label: file.name, file, commit: (id: number) => upload(`/posts/${id}/attachments`, file) })),
      ]);
      return;
    }
    for (const f of ok) {
      const k = f.name + f.size;
      try {
        await upload(`/posts/${props.postId}/attachments`, f, (p) => setProgress((s) => ({ ...s, [k]: p })));
      } catch (e) {
        setErr(e);
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
    setErr(null);
    if (!linkUrl.trim()) return;
    const json = { url: linkUrl.trim(), filename: linkName.trim() || undefined };
    if (!live) {
      try {
        new URL(json.url);
      } catch {
        return setErr(new Error("That doesn't look like a URL"));
      }
      props.setPending([...props.pending, { key: crypto.randomUUID(), label: json.filename ?? json.url, commit: (id) => api(`/posts/${id}/links`, { method: "POST", json }) }]);
    } else {
      try {
        await api(`/posts/${props.postId}/links`, { method: "POST", json });
        refresh();
      } catch (e) {
        return setErr(e);
      }
    }
    setLinkUrl("");
    setLinkName("");
  };

  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-semibold">Media & attachments</h2>
      <div
        onDragOver={(e) => (e.preventDefault(), setDrag(true))}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          addFiles([...e.dataTransfer.files]);
        }}
        onClick={() => input.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-5 text-center text-sm ${drag ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950" : "border-slate-300 dark:border-slate-700"}`}
      >
        Drop files, click to choose, or paste an image. Max {MAX_MB} MB each.
        <input ref={input} type="file" multiple hidden onChange={(e) => (addFiles([...(e.target.files ?? [])]), (e.target.value = ""))} />
      </div>
      {Object.entries(progress).map(([k, p]) => (
        <div key={k} className="h-1.5 overflow-hidden rounded bg-slate-200 dark:bg-slate-800"><div className="h-full bg-indigo-500" style={{ width: `${p}%` }} /></div>
      ))}
      <form onSubmit={addLink} className="flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="Or paste a link: Drive, Dropbox, Figma, Canva…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
        <input className="input w-40" placeholder="Label (optional)" value={linkName} onChange={(e) => setLinkName(e.target.value)} />
        <button className="btn-outline">Add link</button>
      </form>
      <ErrorText error={err} />

      {live ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {props.attachments.map((a) => <AttachmentTile key={a.id} a={a} onDelete={() => confirm(`Remove ${a.filename}?`) && api(`/attachments/${a.id}`, { method: "DELETE" }).then(refresh, setErr)} />)}
        </div>
      ) : (
        <ul className="space-y-1 text-sm">
          {props.pending.map((p) => (
            <li key={p.key} className="flex items-center justify-between rounded bg-slate-100 px-2 py-1 dark:bg-slate-800">
              <span className="truncate">{p.file ? "📄" : "🔗"} {p.label} {p.file && <span className="text-xs text-slate-500">{mb(p.file.size)}</span>}</span>
              <button className="text-xs text-red-600" onClick={() => props.setPending(props.pending.filter((x) => x.key !== p.key))}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AttachmentTile({ a, onDelete }: { a: Attachment; onDelete: () => void }) {
  const src = `/api/files/${a.id}`;
  const preview =
    a.kind === "link" ? (
      <a href={a.url!} target="_blank" rel="noreferrer" className="flex h-28 items-center justify-center bg-slate-100 text-3xl dark:bg-slate-800">🔗</a>
    ) : a.mime?.startsWith("image/") ? (
      <a href={src} target="_blank" rel="noreferrer"><img src={src} alt={a.filename} loading="lazy" className="h-28 w-full object-cover" /></a>
    ) : a.mime?.startsWith("video/") ? (
      <video src={src} controls preload="metadata" className="h-28 w-full bg-black object-contain" />
    ) : (
      <a href={src} target="_blank" rel="noreferrer" className="flex h-28 items-center justify-center bg-slate-100 text-3xl dark:bg-slate-800">📄</a>
    );
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
      {preview}
      <div className="flex items-center justify-between gap-1 p-2 text-xs">
        <span className="truncate" title={a.filename}>{a.filename}</span>
        <span className="flex shrink-0 gap-2">
          {a.kind === "file" && <a href={`${src}?download=1`} className="text-indigo-600">↓</a>}
          <button className="text-red-600" onClick={onDelete} aria-label="Remove">✕</button>
        </span>
      </div>
      {a.size && <div className="px-2 pb-2 text-[10px] text-slate-500">{mb(a.size)}</div>}
    </div>
  );
}

import { useState } from "react";
import { DatabaseBackup } from "lucide-react";
import { api } from "@/lib/api";
import { attempt } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";

export function BackupPage() {
  const [last, setLast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    await attempt(async () => setLast((await api<{ key: string }>("/admin/backup", { method: "POST" })).key), "Backup saved");
    setBusy(false);
  };
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Backup" />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><DatabaseBackup className="size-4" /> Nightly snapshots</CardTitle>
          <CardDescription>Every night at 02:00 UTC the whole database is saved as JSON to the media bucket. The last 30 days are kept.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Files are stored under <code className="rounded bg-muted px-1 py-0.5 text-foreground">backups/</code> in the R2 bucket, one per day.
          {last && <p className="mt-3 text-foreground">Saved <code className="rounded bg-muted px-1 py-0.5">{last}</code></p>}
        </CardContent>
        <CardFooter><Button variant="outline" disabled={busy} onClick={run}>{busy ? "Backing up…" : "Back up now"}</Button></CardFooter>
      </Card>
    </div>
  );
}

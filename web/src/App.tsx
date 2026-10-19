import { Navigate, Route, Routes } from "react-router";
import { useMe } from "@/lib/data";
import { AppShell } from "@/components/app-shell";
import { ProfileSwitcher } from "@/pages/profile-switcher";
import { DayPage } from "@/pages/day";
import { BoardPage } from "@/pages/board";
import { MyWorkPage } from "@/pages/my-work";
import { PostPage } from "@/pages/post";
import { AssignmentsPage } from "@/pages/admin/assignments";
import { AccountsPage } from "@/pages/admin/accounts";
import { PlatformsPage } from "@/pages/admin/platforms";
import { PeoplePage } from "@/pages/admin/people";
import { BackupPage } from "@/pages/admin/backup";
import { Skeleton } from "@/components/ui/skeleton";

export function App() {
  const me = useMe();
  if (me.isPending)
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  if (me.isError) return <ProfileSwitcher />;

  // Admins only administer; members only work on content.
  if (me.data.role === "admin")
    return (
      <Routes>
        <Route element={<AppShell />}>
          <Route path="admin/assignments" element={<AssignmentsPage />} />
          <Route path="admin/accounts" element={<AccountsPage />} />
          <Route path="admin/platforms" element={<PlatformsPage />} />
          <Route path="admin/people" element={<PeoplePage />} />
          <Route path="admin/backup" element={<BackupPage />} />
          <Route path="*" element={<Navigate to="/admin/people" replace />} />
        </Route>
      </Routes>
    );

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="day" element={<DayPage />} />
        <Route path="board" element={<BoardPage />} />
        <Route path="mine" element={<MyWorkPage />} />
        <Route path="posts/new" element={<PostPage />} />
        <Route path="posts/:id" element={<PostPage />} />
        <Route path="*" element={<Navigate to="/day" replace />} />
      </Route>
    </Routes>
  );
}

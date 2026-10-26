import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import { useMe } from "@/lib/data";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { SignInPage } from "@/pages/sign-in";

// Pages load on first visit, so the first screen only downloads the shell.
const DayPage = lazy(() => import("@/pages/day").then((m) => ({ default: m.DayPage })));
const MyWorkPage = lazy(() => import("@/pages/my-work").then((m) => ({ default: m.MyWorkPage })));
const TopicPage = lazy(() => import("@/pages/topic").then((m) => ({ default: m.TopicPage })));
const PostPage = lazy(() => import("@/pages/post").then((m) => ({ default: m.PostPage })));
const AccountsPage = lazy(() => import("@/pages/admin/accounts").then((m) => ({ default: m.AccountsPage })));
const PlatformsPage = lazy(() => import("@/pages/admin/platforms").then((m) => ({ default: m.PlatformsPage })));
const PeoplePage = lazy(() => import("@/pages/admin/people").then((m) => ({ default: m.PeoplePage })));
const TopicsPage = lazy(() => import("@/pages/admin/topics").then((m) => ({ default: m.TopicsPage })));

export function App() {
  const me = useMe();
  if (me.isPending)
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Skeleton className="h-8 w-40" />
      </div>
    );
  if (me.isError) return <SignInPage />;

  // Everyone works on content; admins also get the settings pages.
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="day" element={<DayPage />} />
        <Route path="mine" element={<MyWorkPage />} />
        <Route path="topics/:id" element={<TopicPage />} />
        <Route path="posts/new" element={<PostPage />} />
        <Route path="posts/:id" element={<PostPage />} />
        {me.data.role === "admin" && (
          <>
            <Route path="admin/people" element={<PeoplePage />} />
            <Route path="admin/accounts" element={<AccountsPage />} />
            <Route path="admin/topics" element={<TopicsPage />} />
            <Route path="admin/platforms" element={<PlatformsPage />} />
          </>
        )}
        <Route path="*" element={<Navigate to="/day" replace />} />
      </Route>
    </Routes>
  );
}

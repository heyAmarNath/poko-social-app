import { Navigate, Route, Routes } from "react-router";
import { useMe } from "./lib/data";
import { ProfileSwitcher } from "./pages/ProfileSwitcher";
import { Layout } from "./components/Layout";
import { DayView } from "./pages/DayView";
import { WeekView } from "./pages/WeekView";
import { BoardView } from "./pages/BoardView";
import { MyWork } from "./pages/MyWork";
import { Admin } from "./pages/Admin";
import { PostPage } from "./pages/PostPage";
import { canAdmin } from "../../shared/rules";

export function App() {
  const me = useMe();
  if (me.isPending) return <div className="p-8 text-sm text-slate-500">Loading…</div>;
  if (me.isError) return <ProfileSwitcher />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/day" replace />} />
        <Route path="day" element={<DayView />} />
        <Route path="week" element={<WeekView />} />
        <Route path="board" element={<BoardView />} />
        <Route path="mine" element={<MyWork />} />
        <Route path="posts/new" element={<PostPage />} />
        <Route path="posts/:id" element={<PostPage />} />
        {canAdmin(me.data) && <Route path="admin/*" element={<Admin />} />}
        <Route path="*" element={<Navigate to="/day" replace />} />
      </Route>
    </Routes>
  );
}

import { Suspense } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import {
  AtSign, CalendarDays, ChevronsUpDown, Hash, Inbox, LayoutGrid, LogOut, Megaphone, Monitor, Moon, Plus, Sun, Tags, Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { useDashboard, useMe, useTopics } from "@/lib/data";
import { ErrorBoundary } from "@/components/error-boundary";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PersonAvatar } from "@/components/people";

type NavItem = { to: string; label: string; icon: typeof Hash; count?: number };

const MANAGE: NavItem[] = [
  { to: "/admin/people", label: "People", icon: Users },
  { to: "/admin/accounts", label: "Accounts", icon: AtSign },
  { to: "/admin/topics", label: "Topics", icon: Tags },
  { to: "/admin/platforms", label: "Platforms", icon: LayoutGrid },
];

export function AppShell() {
  const me = useMe().data!;
  const loc = useLocation();
  const topics = useTopics();
  const d = useDashboard().data;

  const main: NavItem[] = [
    // Day opens on today, so its count is today's open posts.
    { to: "/day", label: "Day", icon: CalendarDays, count: d?.today },
    { to: "/mine", label: "My work", icon: Inbox, count: d?.all },
  ];
  // On a topic's page, a new post starts in that topic.
  const onTopic = /^\/topics\/(\d+)$/.exec(loc.pathname)?.[1];
  const newPost = onTopic ? `/posts/new?topic=${onTopic}` : "/posts/new";
  // Everyone sees every topic, with how many of its posts are still open.
  const topicItems: NavItem[] = (topics.data ?? []).map((t) => ({ to: `/topics/${t.id}`, label: t.name, icon: Hash, count: t.open_count }));
  return (
    <SidebarProvider>
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link to="/">
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Megaphone className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate font-semibold">Poko Social</span>
                    <span className="truncate text-xs text-muted-foreground">Content</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="New post" className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground">
                    <Link to={newPost}><Plus /> <span>New post</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <NavGroup label="Posts" items={main} />
          {me.role === "admin" && <NavGroup label="Manage" items={MANAGE} />}
          <NavGroup label="Topics" items={topicItems} />
        </SidebarContent>
        <SidebarFooter>
          <UserMenu />
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <span className="text-sm text-muted-foreground">{me.name}</span>
          <Button asChild size="sm" className="ml-auto md:hidden">
            <Link to={newPost}><Plus /> New post</Link>
          </Button>
        </header>
        <div className="min-w-0 flex-1 p-4 md:p-6">
          <ErrorBoundary key={loc.pathname}>
            <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const loc = useLocation();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((it) => {
            const active = loc.pathname === it.to;
            return (
              <SidebarMenuItem key={it.to}>
                <SidebarMenuButton asChild isActive={active} tooltip={it.label}>
                  <NavLink to={it.to}>
                    <it.icon />
                    <span>{it.label}</span>
                  </NavLink>
                </SidebarMenuButton>
                {!!it.count && <SidebarMenuBadge title={`${it.count} open`}>{it.count}</SidebarMenuBadge>}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** A full reload leaves nothing of this person's data in memory, which matters on a shared computer. */
async function signOut() {
  await api("/auth/logout", { method: "POST" });
  window.location.assign("/");
}

function UserMenu() {
  const me = useMe().data!;
  const { theme, setTheme } = useTheme();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent">
              <PersonAvatar person={me} />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{me.name}</span>
                <span className="truncate text-xs capitalize text-muted-foreground">{me.role}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="text-sm font-medium">{me.name}</div>
              <div className="truncate text-xs text-muted-foreground">{me.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger><Sun /> Theme</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                  <DropdownMenuRadioItem value="light"><Sun /> Light</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark"><Moon /> Dark</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system"><Monitor /> System</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut}><LogOut /> Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

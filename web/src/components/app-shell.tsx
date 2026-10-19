import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "@/components/theme-provider";
import {
  AlertTriangle, AtSign, CalendarDays, ChevronsUpDown, DatabaseBackup, Inbox, KeyRound, KanbanSquare,
  LayoutGrid, LogOut, Megaphone, Monitor, Moon, Plus, Sun, UserX, Users, Workflow,
} from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/lib/data";
import { addDays, startOfDay } from "@/lib/dates";
import { attempt } from "@/lib/errors";
import type { Dashboard } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { PinInput } from "@/components/pin-input";
import { PersonAvatar } from "@/components/people";

type NavItem = { to: string; label: string; icon: typeof CalendarDays; count?: number; tone?: "warn" };

export function AppShell() {
  const me = useMe().data!;
  const member = me.role === "member";
  const today = startOfDay(new Date());
  const dash = useQuery({
    queryKey: ["dashboard", today.getTime()],
    queryFn: () => api<Dashboard>(`/dashboard?from=${today.getTime()}&to=${addDays(today, 1).getTime()}`),
    refetchInterval: 60_000,
    enabled: member,
  });
  const d = dash.data;

  const main: NavItem[] = member
    ? [
        { to: "/day", label: "Day", icon: CalendarDays, count: d?.today },
        { to: "/board", label: "Board", icon: KanbanSquare, count: d?.review },
        { to: "/mine", label: "My work", icon: Inbox, count: d?.mine },
      ]
    : [
        { to: "/admin/people", label: "People", icon: Users },
        { to: "/admin/accounts", label: "Accounts", icon: AtSign },
        { to: "/admin/assignments", label: "Assignments", icon: Workflow },
        { to: "/admin/platforms", label: "Platforms", icon: LayoutGrid },
        { to: "/admin/backup", label: "Backup", icon: DatabaseBackup },
      ];
  const attention: NavItem[] = member
    ? [
        ...(d?.overdue ? [{ to: "/board?view=overdue", label: "Overdue", icon: AlertTriangle, count: d.overdue, tone: "warn" as const }] : []),
        ...(d?.unassigned ? [{ to: "/board?view=unassigned", label: "No manager", icon: UserX, count: d.unassigned, tone: "warn" as const }] : []),
      ]
    : [];

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
                    <span className="truncate font-semibold">Social Pipeline</span>
                    <span className="truncate text-xs text-muted-foreground">{member ? "Content" : "Administration"}</span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          {member && (
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="New post" className="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground">
                      <Link to="/posts/new"><Plus /> <span>New post</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
          <NavGroup label={member ? "Plan" : "Manage"} items={main} />
          {attention.length > 0 && <NavGroup label="Needs attention" items={attention} />}
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
          {member && (
            <Button asChild size="sm" className="ml-auto md:hidden">
              <Link to="/posts/new"><Plus /> New post</Link>
            </Button>
          )}
        </header>
        <div className="min-w-0 flex-1 p-4 md:p-6">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  const loc = useLocation();
  const here = loc.pathname + loc.search;
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((it) => {
            const special = /view=(overdue|unassigned)/.test(loc.search);
            const active = it.to.includes("?") ? here === it.to : loc.pathname.startsWith(it.to) && !(it.to === "/board" && special);
            return (
              <SidebarMenuItem key={it.to}>
                <SidebarMenuButton asChild isActive={active} tooltip={it.label}>
                  <NavLink to={it.to}>
                    <it.icon className={it.tone === "warn" ? "text-amber-600 dark:text-amber-400" : undefined} />
                    <span>{it.label}</span>
                  </NavLink>
                </SidebarMenuButton>
                {!!it.count && (
                  <SidebarMenuBadge className={it.tone === "warn" ? "text-amber-700 dark:text-amber-400" : undefined}>{it.count}</SidebarMenuBadge>
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function UserMenu() {
  const me = useMe().data!;
  const qc = useQueryClient();
  const { theme, setTheme } = useTheme();
  const [pinOpen, setPinOpen] = useState(false);
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    await qc.resetQueries();
  };
  return (
    <>
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
                <div className="text-xs text-muted-foreground">{me.access_email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setPinOpen(true)}><KeyRound /> Change PIN</DropdownMenuItem>
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
              <DropdownMenuItem onSelect={logout}><LogOut /> Switch profile</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <ChangePinDialog open={pinOpen} onOpenChange={setPinOpen} />
    </>
  );
}

function ChangePinDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const save = async () => {
    const ok = await attempt(() => api("/me/pin", { method: "POST", json: { current, next } }), "PIN updated");
    if (ok) (setCurrent(""), setNext(""), onOpenChange(false));
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change PIN</DialogTitle>
          <DialogDescription>Your PIN unlocks your profile on this app.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Current PIN</FieldLabel>
            <PinInput value={current} onChange={setCurrent} />
          </Field>
          <Field>
            <FieldLabel>New PIN</FieldLabel>
            <PinInput value={next} onChange={setNext} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button disabled={current.length !== 4 || next.length !== 4} onClick={save}>Save PIN</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

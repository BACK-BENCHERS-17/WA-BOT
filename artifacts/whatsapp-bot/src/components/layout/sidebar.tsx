import { Link, useLocation } from "wouter";
import { MessageSquare, LayoutDashboard, Settings, Bot, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Messages", href: "/messages", icon: MessageSquare },
  { name: "Bot Config", href: "/bot", icon: Bot },
  { name: "Session", href: "/session", icon: Phone },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <div className="flex h-full w-64 flex-col bg-sidebar border-r border-sidebar-border">
      <div className="flex h-16 shrink-0 items-center px-6">
        <Bot className="h-6 w-6 text-sidebar-primary mr-2" />
        <span className="text-lg font-semibold tracking-tight text-sidebar-foreground">WA Command</span>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto pt-4 pb-4">
        <nav className="flex-1 space-y-1 px-3">
          {navigation.map((item) => {
            const isActive = location === item.href || (location.startsWith(item.href) && item.href !== "/");
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                  "group flex items-center rounded-md px-3 py-2 text-sm transition-colors"
                )}
              >
                <item.icon
                  className={cn(
                    isActive ? "text-sidebar-primary" : "text-muted-foreground group-hover:text-sidebar-primary",
                    "mr-3 h-5 w-5 shrink-0"
                  )}
                  aria-hidden="true"
                />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

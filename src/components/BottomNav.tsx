import { MessageSquare, Phone, Bell, User, Users } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { icon: MessageSquare, label: "Chats", path: "/conversations" },
    { icon: Users, label: "Groups", path: "/groups" },
    { icon: Phone, label: "Calls", path: "/calls" },
    { icon: Bell, label: "Notifications", path: "/notifications" },
    { icon: User, label: "Account", path: "/settings" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-40 shadow-lg">
      <div className="flex items-center justify-around h-20 max-w-2xl mx-auto px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-1.5 transition-all duration-200",
                isActive
                  ? "text-primary scale-105"
                  : "text-muted-foreground hover:text-foreground hover:scale-105"
              )}
            >
              <Icon className="w-7 h-7" />
              <span className="text-xs font-semibold">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;

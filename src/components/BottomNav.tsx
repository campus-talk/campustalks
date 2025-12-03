import { MessageSquare, Phone, Bell, User, Users } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { icon: MessageSquare, label: "Chats", path: "/conversations" },
    { icon: Users, label: "Groups", path: "/groups" },
    { icon: Phone, label: "Calls", path: "/calls" },
    { icon: Bell, label: "Alerts", path: "/notifications" },
    { icon: User, label: "Account", path: "/settings" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-xl border-t border-border/50 z-50 shadow-lg safe-area-pb">
      <div className="flex items-stretch justify-around h-[72px] max-w-lg mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 relative active:bg-primary/5 transition-all duration-200"
            >
              <motion.div
                whileTap={{ scale: 0.9 }}
                className={cn(
                  "p-2.5 rounded-2xl transition-all duration-300",
                  isActive ? "bg-primary/15 shadow-sm" : "hover:bg-primary/5"
                )}
              >
                <Icon
                  className={cn(
                    "w-6 h-6 transition-all duration-300",
                    isActive ? "text-primary scale-105" : "text-muted-foreground"
                  )}
                  strokeWidth={isActive ? 2.5 : 2}
                />
              </motion.div>
              <span
                className={cn(
                  "text-[10px] font-semibold transition-colors duration-300",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                {item.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="activeNavTab"
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-1 bg-primary rounded-b-full"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
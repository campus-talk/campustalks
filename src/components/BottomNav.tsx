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
    <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-border/40 z-50 safe-area-pb">
      <div className="flex items-stretch justify-around h-[68px] max-w-lg mx-auto px-2">
        {navItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          
          return (
            <motion.button
              key={item.path}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => navigate(item.path)}
              className="flex-1 flex flex-col items-center justify-center gap-1 relative active:scale-95 transition-transform"
            >
              <motion.div
                whileTap={{ scale: 0.85 }}
                className={cn(
                  "p-2 rounded-xl transition-all duration-300",
                  isActive 
                    ? "bg-primary/15 shadow-sm" 
                    : "hover:bg-muted"
                )}
              >
                <Icon
                  className={cn(
                    "w-5 h-5 transition-all duration-300",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )}
                  strokeWidth={isActive ? 2.5 : 2}
                />
              </motion.div>
              <span
                className={cn(
                  "text-[10px] font-medium transition-colors duration-300",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                {item.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="activeNavIndicator"
                  className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-8 h-1 bg-gradient-to-r from-primary to-accent rounded-b-full"
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;

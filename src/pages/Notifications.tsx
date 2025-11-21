import { Bell } from "lucide-react";
import BottomNav from "@/components/BottomNav";

const Notifications = () => {
  return (
    <div className="min-h-screen geometric-pattern pb-20">
      <header className="gradient-primary text-white p-6 shadow-lg">
        <h1 className="text-2xl font-bold">Notifications</h1>
      </header>

      <div className="max-w-2xl mx-auto p-4">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bell className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No notifications</h3>
          <p className="text-sm text-muted-foreground">
            You're all caught up!
          </p>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Notifications;

import { Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import BottomNav from "@/components/BottomNav";

interface CallHistory {
  id: string;
  name: string;
  avatar: string | null;
  type: "incoming" | "outgoing" | "missed";
  isVideo: boolean;
  time: string;
}

// Mock data - replace with actual data from database
const mockCallHistory: CallHistory[] = [];

const Calls = () => {
  const getCallIcon = (call: CallHistory) => {
    if (call.type === "missed") {
      return <PhoneMissed className="w-5 h-5 text-destructive" />;
    }
    if (call.type === "incoming") {
      return <PhoneIncoming className="w-5 h-5 text-green-500" />;
    }
    return <PhoneOutgoing className="w-5 h-5 text-primary" />;
  };

  return (
    <div className="min-h-screen geometric-pattern pb-20">
      <header className="gradient-primary text-white p-6 shadow-lg">
        <h1 className="text-2xl font-bold">Calls</h1>
      </header>

      <div className="max-w-2xl mx-auto p-4">
        {mockCallHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Phone className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No calls yet</h3>
            <p className="text-sm text-muted-foreground">
              Your call history will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {mockCallHistory.map((call) => (
              <div
                key={call.id}
                className="glass-effect rounded-xl p-4 flex items-center gap-4 hover:bg-accent/5 transition-colors"
              >
                <Avatar className="w-12 h-12">
                  <AvatarImage src={call.avatar || ""} />
                  <AvatarFallback className="bg-gradient-primary text-white">
                    {call.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{call.name}</h3>
                    {call.isVideo && <Video className="w-4 h-4 text-muted-foreground" />}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {getCallIcon(call)}
                    <span>{call.time}</span>
                  </div>
                </div>

                <button className="p-2 hover:bg-accent rounded-full transition-colors">
                  {call.isVideo ? (
                    <Video className="w-5 h-5 text-primary" />
                  ) : (
                    <Phone className="w-5 h-5 text-primary" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default Calls;

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import StatusCircle from "./StatusCircle";
import CreateStatusDialog from "./CreateStatusDialog";
import StatusViewer from "./StatusViewer";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

interface Status {
  id: string;
  content: string | null;
  media_url: string | null;
  media_type: string;
  background_color: string | null;
  created_at: string;
  user_id: string;
  profiles: {
    full_name: string;
    avatar_url: string | null;
    username: string | null;
  };
}

interface GroupedStatus {
  userId: string;
  profile: {
    full_name: string;
    avatar_url: string | null;
    username: string | null;
  };
  statuses: Status[];
  hasUnviewed: boolean;
}

interface StatusBarProps {
  currentUserId: string;
  currentUserProfile: {
    full_name: string;
    avatar_url: string | null;
  };
}

const StatusBar = ({ currentUserId, currentUserProfile }: StatusBarProps) => {
  const [myStatuses, setMyStatuses] = useState<Status[]>([]);
  const [otherStatuses, setOtherStatuses] = useState<GroupedStatus[]>([]);
  const [viewedStatusIds, setViewedStatusIds] = useState<Set<string>>(new Set());
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedStatuses, setSelectedStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatuses = async () => {
    try {
      // Fetch all active statuses (not expired)
      const { data: statusesData, error } = await supabase
        .from("statuses")
        .select(`
          *,
          profiles:user_id(full_name, avatar_url, username)
        `)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch viewed statuses
      const { data: viewsData } = await supabase
        .from("status_views")
        .select("status_id")
        .eq("viewer_id", currentUserId);

      const viewedIds = new Set(viewsData?.map((v) => v.status_id) || []);
      setViewedStatusIds(viewedIds);

      // Separate my statuses and others
      const myStatusList = statusesData?.filter((s) => s.user_id === currentUserId) || [];
      const otherStatusList = statusesData?.filter((s) => s.user_id !== currentUserId) || [];

      setMyStatuses(myStatusList);

      // Group other statuses by user
      const grouped: { [key: string]: GroupedStatus } = {};
      otherStatusList.forEach((status) => {
        if (!grouped[status.user_id]) {
          grouped[status.user_id] = {
            userId: status.user_id,
            profile: status.profiles,
            statuses: [],
            hasUnviewed: false,
          };
        }
        grouped[status.user_id].statuses.push(status);
        if (!viewedIds.has(status.id)) {
          grouped[status.user_id].hasUnviewed = true;
        }
      });

      // Sort: unviewed first
      const sortedGroups = Object.values(grouped).sort((a, b) => {
        if (a.hasUnviewed && !b.hasUnviewed) return -1;
        if (!a.hasUnviewed && b.hasUnviewed) return 1;
        return 0;
      });

      setOtherStatuses(sortedGroups);
    } catch (error) {
      console.error("Error fetching statuses:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatuses();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("statuses-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "statuses" },
        () => {
          fetchStatuses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  const handleMyStatusClick = () => {
    // Always open create dialog - user can view existing or add new
    setCreateDialogOpen(true);
  };

  const handleViewMyStatuses = () => {
    if (myStatuses.length > 0) {
      setSelectedStatuses(myStatuses);
      setViewerOpen(true);
    }
  };

  const handleOtherStatusClick = (group: GroupedStatus) => {
    setSelectedStatuses(group.statuses);
    setViewerOpen(true);
  };

  // Create all user groups for continuous story viewing
  const allUserGroups = [
    ...(myStatuses.length > 0 ? [{ userId: currentUserId, statuses: myStatuses }] : []),
    ...otherStatuses.map(g => ({ userId: g.userId, statuses: g.statuses }))
  ];

  const handleUserChange = (userId: string) => {
    const group = allUserGroups.find(g => g.userId === userId);
    if (group) {
      setSelectedStatuses(group.statuses);
    }
  };

  if (loading) {
    return (
      <div className="px-3 py-4">
        <div className="flex gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div className="w-[70px] h-[70px] rounded-full bg-muted animate-pulse" />
              <div className="w-12 h-3 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <ScrollArea className="w-full">
        <div className="flex gap-3 px-3 py-4">
          {/* My Status - Click to add new */}
          <StatusCircle
            avatarUrl={currentUserProfile.avatar_url}
            name={currentUserProfile.full_name}
            hasStatus={myStatuses.length > 0}
            isOwn
            onClick={handleMyStatusClick}
            statusCount={myStatuses.length}
            onViewStatus={myStatuses.length > 0 ? handleViewMyStatuses : undefined}
          />

          {/* Other Users' Statuses */}
          {otherStatuses.map((group) => (
            <StatusCircle
              key={group.userId}
              avatarUrl={group.profile.avatar_url}
              name={group.profile.full_name}
              hasStatus
              isViewed={!group.hasUnviewed}
              onClick={() => handleOtherStatusClick(group)}
              statusCount={group.statuses.length}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="invisible" />
      </ScrollArea>

      <CreateStatusDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        userId={currentUserId}
        onStatusCreated={fetchStatuses}
      />

      <StatusViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        statuses={selectedStatuses}
        currentUserId={currentUserId}
        onStatusDeleted={fetchStatuses}
        allUserGroups={allUserGroups}
        onUserChange={handleUserChange}
      />
    </>
  );
};

export default StatusBar;

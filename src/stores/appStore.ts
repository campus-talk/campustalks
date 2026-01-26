import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

// Types
interface Conversation {
  id: string;
  is_group?: boolean;
  group?: {
    id: string;
    name: string;
    avatar_url: string | null;
  };
  otherUser?: {
    id: string;
    full_name: string;
    avatar_url: string | null;
    status: string;
  };
  lastMessage: {
    content: string;
    created_at: string;
    is_read: boolean;
    sender_id: string;
    message_type: string;
  } | null;
  unreadCount: number;
}

interface Group {
  id: string;
  name: string;
  avatar_url: string | null;
  description: string | null;
  created_at: string;
  memberCount: number;
}

interface CallLog {
  id: string;
  caller_id: string;
  receiver_id: string;
  call_type: "audio" | "video";
  call_status: "missed" | "answered" | "declined" | "cancelled";
  duration_seconds: number;
  created_at: string;
  caller_profile?: {
    full_name: string;
    avatar_url: string | null;
  };
  receiver_profile?: {
    full_name: string;
    avatar_url: string | null;
  };
}

interface Profile {
  id: string;
  full_name: string;
  username: string | null;
  unique_key: string;
  avatar_url: string | null;
  bio: string | null;
  status: string;
  phone: string | null;
  is_private: boolean;
}

interface AppState {
  // User
  currentUserId: string;
  currentUserProfile: Profile | null;
  
  // Conversations
  conversations: Conversation[];
  conversationsLoading: boolean;
  conversationsLastFetch: number;
  
  // Groups
  groups: Group[];
  groupsLoading: boolean;
  groupsLastFetch: number;
  
  // Calls
  calls: CallLog[];
  callsLoading: boolean;
  callsLastFetch: number;
  
  // Unread counts
  totalUnreadMessages: number;
  unreadNotifications: number;
  pendingRequests: number;
  
  // Actions
  setCurrentUser: (userId: string, profile: Profile | null) => void;
  
  // Conversations
  setConversations: (conversations: Conversation[]) => void;
  setConversationsLoading: (loading: boolean) => void;
  fetchConversations: (force?: boolean) => Promise<void>;
  updateConversationUnread: (conversationId: string, unreadCount: number) => void;
  
  // Groups
  setGroups: (groups: Group[]) => void;
  setGroupsLoading: (loading: boolean) => void;
  fetchGroups: (force?: boolean) => Promise<void>;
  
  // Calls
  setCalls: (calls: CallLog[]) => void;
  setCallsLoading: (loading: boolean) => void;
  fetchCalls: (force?: boolean) => Promise<void>;
  
  // Profile
  fetchCurrentUserProfile: () => Promise<void>;
  
  // Counts
  setTotalUnreadMessages: (count: number) => void;
  setUnreadNotifications: (count: number) => void;
  setPendingRequests: (count: number) => void;
  fetchCounts: () => Promise<void>;
  
  // Refresh all data
  refreshAll: () => Promise<void>;
}

// Cache duration: 30 seconds (data is considered "stale" after this)
const CACHE_DURATION = 30 * 1000;

export const useAppStore = create<AppState>((set, get) => ({
  // Initial state
  currentUserId: '',
  currentUserProfile: null,
  
  conversations: [],
  conversationsLoading: false,
  conversationsLastFetch: 0,
  
  groups: [],
  groupsLoading: false,
  groupsLastFetch: 0,
  
  calls: [],
  callsLoading: false,
  callsLastFetch: 0,
  
  totalUnreadMessages: 0,
  unreadNotifications: 0,
  pendingRequests: 0,
  
  // Actions
  setCurrentUser: (userId, profile) => set({ currentUserId: userId, currentUserProfile: profile }),
  
  setConversations: (conversations) => set({ conversations }),
  setConversationsLoading: (loading) => set({ conversationsLoading: loading }),
  
  fetchConversations: async (force = false) => {
    const state = get();
    const now = Date.now();
    
    // Skip if data is fresh and not forced
    if (!force && state.conversations.length > 0 && (now - state.conversationsLastFetch) < CACHE_DURATION) {
      return;
    }
    
    // Get current user if not set
    let userId = state.currentUserId;
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      userId = user.id;
    }
    
    set({ conversationsLoading: true });
    
    try {
      // Get all conversations for current user
      const { data: participations } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", userId);

      const conversationIds = participations?.map((p) => p.conversation_id) || [];
      if (conversationIds.length === 0) {
        set({ conversations: [], conversationsLoading: false, conversationsLastFetch: now });
        return;
      }

      // Batch fetch conversations, participants, and messages in parallel
      const [convsResult, allParticipantsResult, messagesResult] = await Promise.all([
        supabase
          .from("conversations")
          .select("id, is_group, group_id")
          .in("id", conversationIds),
        supabase
          .from("conversation_participants")
          .select("conversation_id, user_id")
          .in("conversation_id", conversationIds),
        // Get last message for each conversation - optimized single query
        supabase
          .from("messages")
          .select("conversation_id, content, created_at, is_read, sender_id, message_type")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: false }),
      ]);

      const convs = convsResult.data || [];
      const allParticipants = allParticipantsResult.data || [];
      const allMessages = messagesResult.data || [];

      // Get other users' profiles
      const otherUserIds = [...new Set(
        allParticipants
          .filter((p) => p.user_id !== userId)
          .map((p) => p.user_id)
      )];

      // Get groups
      const groupIds = convs.filter(c => c.is_group && c.group_id).map(c => c.group_id!);

      const [profilesResult, groupsResult, unreadResult] = await Promise.all([
        otherUserIds.length > 0 
          ? supabase.from("profiles").select("id, full_name, avatar_url, status").in("id", otherUserIds)
          : { data: [] },
        groupIds.length > 0 
          ? supabase.from("groups").select("id, name, avatar_url").in("id", groupIds)
          : { data: [] },
        // Get unread counts in one query
        supabase
          .from("messages")
          .select("conversation_id")
          .in("conversation_id", conversationIds)
          .eq("is_read", false)
          .neq("sender_id", userId),
      ]);

      const profiles = profilesResult.data || [];
      const groups = groupsResult.data || [];
      const unreadMessages = unreadResult.data || [];

      // Count unreads per conversation
      const unreadCounts = unreadMessages.reduce((acc, msg) => {
        acc[msg.conversation_id] = (acc[msg.conversation_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Build conversation objects - optimized to avoid N+1
      const conversationsData: Conversation[] = [];
      const seenConversations = new Set<string>();
      
      // Group messages by conversation (get latest per conversation)
      const lastMessageByConv: Record<string, typeof allMessages[0]> = {};
      for (const msg of allMessages) {
        if (!lastMessageByConv[msg.conversation_id]) {
          lastMessageByConv[msg.conversation_id] = msg;
        }
      }

      for (const convId of conversationIds) {
        if (seenConversations.has(convId)) continue;
        seenConversations.add(convId);
        
        const conv = convs.find(c => c.id === convId);
        const lastMessage = lastMessageByConv[convId] || null;
        const unreadCount = unreadCounts[convId] || 0;

        if (conv?.is_group) {
          const group = groups.find(g => g.id === conv.group_id);
          if (group) {
            conversationsData.push({
              id: convId,
              is_group: true,
              group,
              lastMessage: lastMessage ? {
                content: lastMessage.content,
                created_at: lastMessage.created_at,
                is_read: lastMessage.is_read ?? false,
                sender_id: lastMessage.sender_id,
                message_type: lastMessage.message_type ?? 'text',
              } : null,
              unreadCount,
            });
          }
        } else {
          const otherUserId = allParticipants.find(
            (p) => p.conversation_id === convId && p.user_id !== userId
          )?.user_id;
          const otherUser = profiles.find((p) => p.id === otherUserId);
          
          if (otherUser) {
            conversationsData.push({
              id: convId,
              is_group: false,
              otherUser,
              lastMessage: lastMessage ? {
                content: lastMessage.content,
                created_at: lastMessage.created_at,
                is_read: lastMessage.is_read ?? false,
                sender_id: lastMessage.sender_id,
                message_type: lastMessage.message_type ?? 'text',
              } : null,
              unreadCount,
            });
          }
        }
      }

      // Sort by last message time
      conversationsData.sort((a, b) => {
        const timeA = a.lastMessage?.created_at || "";
        const timeB = b.lastMessage?.created_at || "";
        return timeB.localeCompare(timeA);
      });

      // Calculate total unread
      const totalUnread = conversationsData.reduce((sum, c) => sum + c.unreadCount, 0);

      set({ 
        conversations: conversationsData, 
        conversationsLoading: false,
        conversationsLastFetch: now,
        totalUnreadMessages: totalUnread,
      });
    } catch (error) {
      console.error("Error fetching conversations:", error);
      set({ conversationsLoading: false });
    }
  },
  
  updateConversationUnread: (conversationId, unreadCount) => {
    const { conversations } = get();
    const updated = conversations.map(c => 
      c.id === conversationId ? { ...c, unreadCount } : c
    );
    const totalUnread = updated.reduce((sum, c) => sum + c.unreadCount, 0);
    set({ conversations: updated, totalUnreadMessages: totalUnread });
  },
  
  setGroups: (groups) => set({ groups }),
  setGroupsLoading: (loading) => set({ groupsLoading: loading }),
  
  fetchGroups: async (force = false) => {
    const state = get();
    const now = Date.now();
    
    if (!force && state.groups.length > 0 && (now - state.groupsLastFetch) < CACHE_DURATION) {
      return;
    }
    
    let userId = state.currentUserId;
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      userId = user.id;
    }
    
    set({ groupsLoading: true });
    
    try {
      // Get groups where user is a member
      const { data: memberships } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", userId);

      if (!memberships || memberships.length === 0) {
        set({ groups: [], groupsLoading: false, groupsLastFetch: now });
        return;
      }

      const groupIds = memberships.map(m => m.group_id);

      // Get group details and member counts in parallel
      const [groupsResult, memberCountsResult] = await Promise.all([
        supabase
          .from("groups")
          .select("*")
          .in("id", groupIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("group_members")
          .select("group_id")
          .in("group_id", groupIds),
      ]);

      const groupsData = groupsResult.data || [];
      const memberCounts = memberCountsResult.data || [];

      // Count members per group
      const counts = memberCounts.reduce((acc, m) => {
        acc[m.group_id] = (acc[m.group_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const groupsWithCounts: Group[] = groupsData.map(group => ({
        ...group,
        memberCount: counts[group.id] || 0,
      }));

      set({ groups: groupsWithCounts, groupsLoading: false, groupsLastFetch: now });
    } catch (error) {
      console.error("Error fetching groups:", error);
      set({ groupsLoading: false });
    }
  },
  
  setCalls: (calls) => set({ calls }),
  setCallsLoading: (loading) => set({ callsLoading: loading }),
  
  fetchCalls: async (force = false) => {
    const state = get();
    const now = Date.now();
    
    if (!force && state.calls.length > 0 && (now - state.callsLastFetch) < CACHE_DURATION) {
      return;
    }
    
    let userId = state.currentUserId;
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      userId = user.id;
    }
    
    set({ callsLoading: true });
    
    try {
      const { data } = await supabase
        .from("call_logs")
        .select(`
          *,
          caller_profile:caller_id (full_name, avatar_url),
          receiver_profile:receiver_id (full_name, avatar_url)
        `)
        .or(`caller_id.eq.${userId},receiver_id.eq.${userId}`)
        .order("created_at", { ascending: false })
        .limit(50);

      set({ calls: (data as any) || [], callsLoading: false, callsLastFetch: now });
    } catch (error) {
      console.error("Error fetching calls:", error);
      set({ callsLoading: false });
    }
  },
  
  fetchCurrentUserProfile: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    
    if (data) {
      set({ 
        currentUserId: user.id, 
        currentUserProfile: data as Profile,
      });
    }
  },
  
  setTotalUnreadMessages: (count) => set({ totalUnreadMessages: count }),
  setUnreadNotifications: (count) => set({ unreadNotifications: count }),
  setPendingRequests: (count) => set({ pendingRequests: count }),
  
  fetchCounts: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const [notifResult, requestsResult] = await Promise.all([
      supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false),
      supabase
        .from("message_requests")
        .select("*", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .eq("status", "pending"),
    ]);
    
    set({
      unreadNotifications: notifResult.count || 0,
      pendingRequests: requestsResult.count || 0,
    });
  },
  
  refreshAll: async () => {
    const state = get();
    await Promise.all([
      state.fetchConversations(true),
      state.fetchGroups(true),
      state.fetchCalls(true),
      state.fetchCounts(),
    ]);
  },
}));

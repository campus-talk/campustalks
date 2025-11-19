import { useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search as SearchIcon, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface SearchResult {
  id: string;
  full_name: string;
  username: string;
  unique_key: string;
  avatar_url: string | null;
  bio: string | null;
  status: string;
}

const Search = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .or(`username.ilike.%${searchQuery}%,unique_key.ilike.%${searchQuery}%`)
        .limit(20);

      if (error) throw error;

      setResults(data || []);

      if (data?.length === 0) {
        toast({
          title: "No results",
          description: "Try searching with a different username or unique code",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="min-h-screen geometric-pattern">
      {/* Header */}
      <header className="gradient-primary text-white p-6 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold">Search People</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto p-6">
        {/* Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-effect rounded-3xl p-6 mb-6"
        >
          <div className="flex gap-3">
            <Input
              type="text"
              placeholder="Search by @username or unique code (FC-XXXX)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1 bg-background/50"
            />
            <Button
              onClick={handleSearch}
              disabled={searching}
              className="gradient-primary hover:gradient-primary-hover text-white"
            >
              <SearchIcon className="w-5 h-5" />
            </Button>
          </div>
        </motion.div>

        {/* Results */}
        <div className="space-y-4">
          {results.map((user, index) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => navigate(`/profile/${user.id}`)}
              className="glass-effect rounded-2xl p-6 cursor-pointer hover:scale-[1.02] transition-transform"
            >
              <div className="flex items-center gap-4">
                <Avatar className="w-16 h-16 border-2 border-primary/20">
                  <AvatarImage src={user.avatar_url || ""} />
                  <AvatarFallback className="bg-gradient-primary text-white text-lg">
                    {user.full_name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{user.full_name}</h3>
                  <p className="text-sm text-muted-foreground">@{user.username}</p>
                  <p className="text-xs text-muted-foreground font-mono mt-1">
                    {user.unique_key}
                  </p>
                </div>
              </div>
              {user.bio && (
                <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
                  {user.bio}
                </p>
              )}
            </motion.div>
          ))}
        </div>

        {results.length === 0 && !searching && searchQuery && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 text-muted-foreground"
          >
            <SearchIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No users found</p>
            <p className="text-sm">Try a different search term</p>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Search;

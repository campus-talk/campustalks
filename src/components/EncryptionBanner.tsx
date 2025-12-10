import { Lock } from "lucide-react";

interface EncryptionBannerProps {
  isGroup?: boolean;
  groupName?: string;
  userName?: string;
}

const EncryptionBanner = ({ isGroup, groupName, userName }: EncryptionBannerProps) => {
  return (
    <div className="flex justify-center py-2 px-4">
      <div className="flex items-center gap-2 py-2 px-4 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-[11px] text-center rounded-lg max-w-[85%]">
        <Lock className="w-3 h-3 flex-shrink-0" />
        <p className="leading-tight">
          {isGroup ? (
            <>Messages and calls are end-to-end encrypted. No one outside this group can read them.</>
          ) : (
            <>Messages and calls are end-to-end encrypted. No one outside this chat can read them.</>
          )}
        </p>
      </div>
    </div>
  );
};

export default EncryptionBanner;

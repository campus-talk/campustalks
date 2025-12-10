import { format, isToday, isYesterday } from "date-fns";

interface DateSeparatorProps {
  date: Date;
}

const DateSeparator = ({ date }: DateSeparatorProps) => {
  const getDateLabel = (d: Date) => {
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "dd/MM/yyyy");
  };

  return (
    <div className="flex justify-center my-4">
      <span className="bg-muted/80 text-muted-foreground text-[11px] px-3 py-1 rounded-full shadow-sm">
        {getDateLabel(date)}
      </span>
    </div>
  );
};

export default DateSeparator;

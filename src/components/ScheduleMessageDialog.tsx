import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Clock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format, addHours, addDays, setHours, setMinutes } from "date-fns";

interface ScheduleMessageDialogProps {
  isOpen: boolean;
  message: string;
  onClose: () => void;
  onSchedule: (scheduledAt: Date) => void;
}

const ScheduleMessageDialog = ({
  isOpen,
  message,
  onClose,
  onSchedule,
}: ScheduleMessageDialogProps) => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");

  const quickOptions = [
    { label: "In 1 hour", getValue: () => addHours(new Date(), 1) },
    { label: "In 3 hours", getValue: () => addHours(new Date(), 3) },
    { label: "Tomorrow morning", getValue: () => setMinutes(setHours(addDays(new Date(), 1), 9), 0) },
    { label: "Tomorrow evening", getValue: () => setMinutes(setHours(addDays(new Date(), 1), 18), 0) },
  ];

  const handleQuickSelect = (getValue: () => Date) => {
    setSelectedDate(getValue());
  };

  const handleCustomDateTime = () => {
    if (customDate && customTime) {
      const [year, month, day] = customDate.split("-").map(Number);
      const [hours, minutes] = customTime.split(":").map(Number);
      const date = new Date(year, month - 1, day, hours, minutes);
      
      if (date > new Date()) {
        setSelectedDate(date);
      }
    }
  };

  const handleSchedule = () => {
    if (selectedDate) {
      onSchedule(selectedDate);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-card w-full max-w-sm rounded-2xl shadow-xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold text-foreground">Schedule Message</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-accent/10 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Message Preview */}
          <div className="p-3 bg-muted/30 border-b border-border">
            <div className="text-sm text-muted-foreground mb-1">Message:</div>
            <p className="text-sm text-foreground truncate">{message}</p>
          </div>

          {/* Quick Options */}
          <div className="p-4 space-y-2">
            <p className="text-sm font-medium text-muted-foreground mb-3">Quick options</p>
            <div className="grid grid-cols-2 gap-2">
              {quickOptions.map((option) => (
                <button
                  key={option.label}
                  onClick={() => handleQuickSelect(option.getValue)}
                  className={`p-3 rounded-lg text-sm font-medium transition-colors border ${
                    selectedDate?.getTime() === option.getValue().getTime()
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-accent/10 text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Date/Time */}
          <div className="p-4 pt-0 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Or set custom time</p>
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  min={format(new Date(), "yyyy-MM-dd")}
                  className="w-full"
                />
              </div>
              <div className="flex-1">
                <Input
                  type="time"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleCustomDateTime}
              disabled={!customDate || !customTime}
              className="w-full"
            >
              <Calendar className="w-4 h-4 mr-2" />
              Set Custom Time
            </Button>
          </div>

          {/* Selected Time */}
          {selectedDate && (
            <div className="px-4 pb-2">
              <div className="p-3 bg-primary/10 rounded-lg text-center">
                <p className="text-sm text-primary font-medium">
                  Scheduled for: {format(selectedDate, "PPp")}
                </p>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="p-4 border-t border-border flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleSchedule}
              disabled={!selectedDate}
              className="flex-1"
            >
              Schedule
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ScheduleMessageDialog;

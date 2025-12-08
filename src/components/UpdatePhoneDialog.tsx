import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Phone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

interface UpdatePhoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPhone?: string | null;
  userId: string;
  onPhoneUpdated: (phone: string) => void;
}

const UpdatePhoneDialog = ({
  open,
  onOpenChange,
  currentPhone,
  userId,
  onPhoneUpdated,
}: UpdatePhoneDialogProps) => {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSendOtp = async () => {
    if (!phone || phone.length < 10) {
      toast({
        variant: "destructive",
        title: "Invalid Phone",
        description: "Please enter a valid phone number with country code",
      });
      return;
    }

    setLoading(true);
    try {
      const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;
      
      const { error } = await supabase.auth.updateUser({
        phone: formattedPhone,
      });

      if (error) throw error;

      setOtpSent(true);
      toast({
        title: "OTP Sent!",
        description: `A verification code has been sent to ${formattedPhone}`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      toast({
        variant: "destructive",
        title: "Invalid OTP",
        description: "Please enter a valid 6-digit OTP",
      });
      return;
    }

    setLoading(true);
    try {
      const formattedPhone = phone.startsWith("+") ? phone : `+91${phone}`;
      
      const { error: verifyError } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: otp,
        type: "phone_change",
      });

      if (verifyError) throw verifyError;

      // Update phone in profile
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ phone: formattedPhone })
        .eq("id", userId);

      if (updateError) throw updateError;

      toast({
        title: "Phone Updated!",
        description: "Your phone number has been updated successfully.",
      });

      onPhoneUpdated(formattedPhone);
      handleClose();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPhone("");
    setOtp("");
    setOtpSent(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            {currentPhone ? "Update Phone Number" : "Add Phone Number"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {currentPhone && (
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Current Number</p>
              <p className="font-medium">{currentPhone}</p>
            </div>
          )}

          {!otpSent ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="newPhone">New Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="newPhone"
                    type="tel"
                    placeholder="+91 9876543210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter with country code (e.g., +91 for India)
                </p>
              </div>

              <Button
                onClick={handleSendOtp}
                className="w-full gradient-primary text-white"
                disabled={loading || !phone}
              >
                {loading ? "Sending..." : "Send OTP"}
              </Button>
            </>
          ) : (
            <>
              <div className="text-center space-y-1">
                <p className="text-sm text-muted-foreground">
                  Enter the 6-digit code sent to
                </p>
                <p className="font-semibold">
                  {phone.startsWith("+") ? phone : `+91${phone}`}
                </p>
              </div>

              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={otp}
                  onChange={(value) => setOtp(value)}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <Button
                onClick={handleVerifyOtp}
                className="w-full gradient-primary text-white"
                disabled={loading || otp.length !== 6}
              >
                {loading ? "Verifying..." : "Verify & Update"}
              </Button>

              <div className="flex justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOtpSent(false)}
                  className="text-muted-foreground"
                >
                  Change Number
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSendOtp}
                  disabled={loading}
                  className="text-primary"
                >
                  Resend OTP
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UpdatePhoneDialog;
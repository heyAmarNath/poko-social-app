import { REGEXP_ONLY_DIGITS } from "input-otp";
import { cn } from "@/lib/utils";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

export function PinInput({
  value, onChange, onComplete, autoFocus, disabled, masked = true, size = "default",
}: { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; autoFocus?: boolean; disabled?: boolean; masked?: boolean; size?: "default" | "lg" }) {
  return (
    <InputOTP
      maxLength={4}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      autoFocus={autoFocus}
      disabled={disabled}
    >
      <InputOTPGroup>
        {[0, 1, 2, 3].map((i) => (
          <InputOTPSlot key={i} index={i} mask={masked} className={cn(size === "lg" && "size-14 text-2xl")} />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}

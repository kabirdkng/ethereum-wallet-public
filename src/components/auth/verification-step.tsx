type ContactType = "email" | "phone";

interface VerificationStepProps {
  contactType: ContactType;
  otp: string;
  onOtpChange: (value: string) => void;
  loading: boolean;
  onVerify: () => void;
  onBack: () => void;
}

export function VerificationStep({
  contactType,
  otp,
  onOtpChange,
  loading,
  onVerify,
  onBack,
}: VerificationStepProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Verification Code
        </label>
        <input
          type="text"
          value={otp}
          onChange={(e) => onOtpChange(e.target.value)}
          placeholder="Enter 6-digit code"
          maxLength={6}
          className="w-full px-4 py-3 border border-default rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <p className="text-xs text-muted mt-2">
          Check your {contactType === "email" ? "email" : "phone"} for the verification code
        </p>
      </div>

      <button
        onClick={onVerify}
        disabled={loading || otp.length !== 6}
        className="w-full bg-primary text-on-primary py-3 rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        {loading ? "Verifying..." : "Verify & Continue"}
      </button>

      <button
        onClick={onBack}
        className="w-full text-muted hover:text-foreground text-sm"
      >
        Back
      </button>
    </div>
  );
}

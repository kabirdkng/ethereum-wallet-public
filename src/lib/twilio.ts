/**
 * Twilio utilities for SMS operations
 * Handles both Twilio Verify (for OTP) and standard SMS (for custom messages)
 */

/**
 * Send a custom SMS message using Twilio
 * Used for recovery codes and other custom messages
 * @param to - Recipient phone number
 * @param message - Message body
 */
export async function sendTwilioSMS(to: string, message: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !token || !from) {
    console.info("[Twilio] SMS credentials not configured. Logging message for development.");
    console.info(`[Twilio] To: ${to}`);
    console.info(`[Twilio] Message: ${message}`);
    return;
  }

  try {
    const twilioModule = await import("twilio");
    const twilio = twilioModule.default(sid, token);

    await twilio.messages.create({
      to,
      from,
      body: message,
    });

    console.info("[Twilio] SMS sent successfully to", to);
  } catch (error) {
    console.error("[Twilio] SMS failed:", error);
    console.info(`[Twilio] Fallback - Message for ${to}: ${message}`);
    throw error;
  }
}

/**
 * Send OTP using Twilio Verify API
 * Twilio generates and manages the OTP
 * @param to - Recipient phone number
 */
export async function sendTwilioVerifyOTP(to: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

  if (!sid || !token || !verifyServiceSid) {
    console.info("[Twilio] Verify credentials not configured.");
    throw new Error("Twilio Verify not configured");
  }

  const twilioModule = await import("twilio");
  const twilio = twilioModule.default(sid, token);

  await twilio.verify.v2
    .services(verifyServiceSid)
    .verifications.create({
      to,
      channel: "sms",
    });

  console.info("[Twilio] Verify OTP sent to", to);
}

/**
 * Verify OTP using Twilio Verify API
 * @param to - Recipient phone number
 * @param code - OTP code to verify
 * @returns true if valid, false otherwise
 */
export async function verifyTwilioOTP(to: string, code: string): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

  if (!sid || !token || !verifyServiceSid) {
    console.info("[Twilio] Verify credentials not configured.");
    return false;
  }

  try {
    const twilioModule = await import("twilio");
    const twilio = twilioModule.default(sid, token);

    const verificationCheck = await twilio.verify.v2
      .services(verifyServiceSid)
      .verificationChecks.create({
        to,
        code,
      });

    return verificationCheck.status === "approved";
  } catch (error) {
    console.error("[Twilio] Verify check failed:", error);
    return false;
  }
}

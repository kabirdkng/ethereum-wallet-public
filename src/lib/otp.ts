import bcrypt from "bcryptjs";

const OTP_LENGTH = 6;
const OTP_EXPIRATION_MINUTES = 10;

export interface OtpConfig {
  length?: number;
  expiresInMinutes?: number;
}

export function generateOtp({ length = OTP_LENGTH }: OtpConfig = {}): string {
  const max = 10 ** length;
  const min = 10 ** (length - 1);
  const code = Math.floor(Math.random() * (max - min) + min);
  return code.toString();
}

export async function hashOtp(otp: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(otp, salt);
}

export async function verifyOtp(otp: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(otp, hashed);
}

export function otpExpiresAt({
  expiresInMinutes = OTP_EXPIRATION_MINUTES,
}: OtpConfig = {}): Date {
  return new Date(Date.now() + expiresInMinutes * 60_000);
}

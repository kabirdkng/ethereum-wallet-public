import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be at least 32 characters."),
  ENCRYPTION_SECRET: z.string().min(32, "ENCRYPTION_SECRET must be at least 32 characters for OAuth backup security.").optional(),
  NEXTAUTH_URL: z.string().url().optional(),
  BULLMQ_PREFIX: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_VERIFY_SERVICE_SID: z.string().optional(), // For signup OTP
  TWILIO_FROM_NUMBER: z.string().optional(), // For recovery messages
  // Rate limiting / production hardening
  REDIS_URL: z.string().url().optional(),
  RATE_LIMIT_ENABLED: z.coerce.boolean().optional().default(true),
  RATE_LIMIT_DEFAULT_WINDOW_SECONDS: z.coerce.number().optional().default(60),
  RATE_LIMIT_DEFAULT_MAX: z.coerce.number().optional().default(100),
  RATE_LIMIT_AUTH_SIGNUP_MAX: z.coerce.number().optional().default(5),
  RATE_LIMIT_AUTH_SIGNUP_WINDOW_SECONDS: z.coerce.number().optional().default(3600),
  RATE_LIMIT_AUTH_VERIFY_MAX: z.coerce.number().optional().default(10),
  RATE_LIMIT_AUTH_VERIFY_WINDOW_SECONDS: z.coerce.number().optional().default(600),
  RATE_LIMIT_AUTH_SIGNIN_MAX: z.coerce.number().optional().default(10),
  RATE_LIMIT_AUTH_SIGNIN_WINDOW_SECONDS: z.coerce.number().optional().default(900),
  RATE_LIMIT_RECOVERY_INITIATE_MAX: z.coerce.number().optional().default(3),
  RATE_LIMIT_RECOVERY_INITIATE_WINDOW_SECONDS: z.coerce.number().optional().default(86400),
  ALCHEMY_API_KEY: z.string().optional(),
  WALLETCONNECT_PROJECT_ID: z.string().optional(),
  ETHERSCAN_API_KEY: z.string().optional(),
  // OAuth credentials
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
});

const clientSchema = z.object({
  NEXT_PUBLIC_ALCHEMY_API_KEY: z.string().optional(),
  NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID: z.string().optional(), // Gas Manager policy ID for AA
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.string().optional(),
  NEXT_PUBLIC_RPC_URL: z.string().url().optional(),
  NEXT_PUBLIC_NETWORK: z.enum(["sepolia", "mainnet"]).optional().default("sepolia"),
  NEXT_PUBLIC_ETHERSCAN_API_KEY: z.string().optional(),
  NEXT_PUBLIC_PLATFORM_FEE_PERCENTAGE: z.string().optional().default("1.5"),
  NEXT_PUBLIC_PLATFORM_FEE_RECIPIENT: z.string().optional(),
  NEXT_PUBLIC_BASE_URL: z.string().url().optional().default("http://localhost:3000"),
});

type ServerEnv = z.infer<typeof serverSchema>;
type ClientEnv = z.infer<typeof clientSchema>;

let cachedServerEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (!cachedServerEnv) {
    cachedServerEnv = serverSchema.parse(process.env);
  }
  return cachedServerEnv;
}

export function getClientEnv(): ClientEnv {
  return clientSchema.parse({
    NEXT_PUBLIC_ALCHEMY_API_KEY: process.env.NEXT_PUBLIC_ALCHEMY_API_KEY,
    NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID: process.env.NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID,
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL,
    NEXT_PUBLIC_NETWORK: process.env.NEXT_PUBLIC_NETWORK,
    NEXT_PUBLIC_ETHERSCAN_API_KEY: process.env.NEXT_PUBLIC_ETHERSCAN_API_KEY,
    NEXT_PUBLIC_PLATFORM_FEE_PERCENTAGE: process.env.NEXT_PUBLIC_PLATFORM_FEE_PERCENTAGE,
    NEXT_PUBLIC_PLATFORM_FEE_RECIPIENT: process.env.NEXT_PUBLIC_PLATFORM_FEE_RECIPIENT,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
  });
}

/**
 * Get the platform fee percentage from environment
 * @returns Platform fee as a number (e.g., 1.5 for 1.5%)
 */
export function getPlatformFeePercentage(): number {
  const feeStr = process.env.NEXT_PUBLIC_PLATFORM_FEE_PERCENTAGE || "1.5";
  return parseFloat(feeStr);
}

/**
 * Get the platform fee recipient address from environment
 * @returns Platform fee recipient address or null if not configured
 */
export function getPlatformFeeRecipient(): `0x${string}` | null {
  const recipient = process.env.NEXT_PUBLIC_PLATFORM_FEE_RECIPIENT;
  return recipient && recipient.startsWith('0x') ? (recipient as `0x${string}`) : null;
}

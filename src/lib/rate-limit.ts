/**
 * Redis-backed rate limiter with in-memory fallback
 * 
 * SECURITY: Prevents brute force attacks on recovery flows
 * - Tracks attempts by identifier (email/phone) and IP
 * - Configurable limits and windows
 * - Uses Redis for distributed rate limiting in production
 * - Falls back to in-memory when Redis unavailable
 */

import { getRedisClient } from './cache/redis';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup expired entries every 5 minutes (in-memory fallback only)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  identifier: string; // email, phone, or IP
  limit: number; // Max attempts
  windowMs: number; // Time window in milliseconds
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check if request is within rate limit
 * Uses Redis if available, otherwise falls back to in-memory store
 */
export async function checkRateLimit(config: RateLimitConfig): Promise<RateLimitResult> {
  const redis = getRedisClient();
  
  // Use Redis if available
  if (redis) {
    return checkRateLimitRedis(config, redis);
  }
  
  // Fallback to in-memory
  return checkRateLimitMemory(config);
}

/**
 * Redis-based rate limiting (production)
 */
async function checkRateLimitRedis(config: RateLimitConfig, redis: NonNullable<ReturnType<typeof getRedisClient>>): Promise<RateLimitResult> {
  const { identifier, limit, windowMs } = config;
  const now = Date.now();
  const key = `ratelimit:${identifier}`;
  const windowStart = now - windowMs;
  
  try {
    const pipeline = redis.pipeline();
    
    // Remove old entries outside the window
    pipeline.zremrangebyscore(key, '-inf', windowStart);
    
    // Count current requests in window
    pipeline.zcard(key);
    
    // Add current request
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    
    // Set expiry
    pipeline.expire(key, Math.ceil(windowMs / 1000));
    
    const results = await pipeline.exec();
    
    if (!results) {
      // Fallback on pipeline failure
      return checkRateLimitMemory(config);
    }
    
    const count = (results[1]?.[1] as number) || 0;
    const resetAt = now + windowMs;
    
    return {
      allowed: count < limit,
      remaining: Math.max(0, limit - count - 1),
      resetAt,
    };
  } catch (error) {
    console.error('Redis rate limit error, falling back to memory:', error);
    return checkRateLimitMemory(config);
  }
}

/**
 * In-memory rate limiting (fallback)
 */
function checkRateLimitMemory(config: RateLimitConfig): RateLimitResult {
  const { identifier, limit, windowMs } = config;
  const now = Date.now();
  
  const entry = rateLimitStore.get(identifier);

  // No entry or expired - create new
  if (!entry || entry.resetAt < now) {
    const resetAt = now + windowMs;
    rateLimitStore.set(identifier, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt,
    };
  }

  // Increment count
  entry.count += 1;

  // Check if over limit
  if (entry.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  return {
    allowed: true,
    remaining: limit - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Reset rate limit for identifier (used after successful auth)
 */
export async function resetRateLimit(identifier: string): Promise<void> {
  const redis = getRedisClient();
  
  if (redis) {
    try {
      await redis.del(`ratelimit:${identifier}`);
    } catch (error) {
      console.error('Redis reset error:', error);
    }
  }
  
  // Also clear from memory store
  rateLimitStore.delete(identifier);
}

/**
 * Get client IP from request
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

/**
 * Helper to apply rate limiting in API routes
 */
export function createRateLimitError(resetAt: number): Response {
  const resetDate = new Date(resetAt);
  return Response.json(
    {
      error: "Too many attempts",
      message: `Please try again after ${resetDate.toLocaleTimeString()}`,
      retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
      },
    }
  );
}

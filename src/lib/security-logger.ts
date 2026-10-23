/**
 * Security event logging for audit trail and threat detection
 * 
 * SECURITY: Logs security-sensitive events for monitoring and alerting
 * - Recovery attempts (success/failure)
 * - OAuth authentication events
 * - Rate limit violations
 * - Suspicious activity patterns
 * 
 * TODO: In production, integrate with logging service (Datadog, Sentry, etc.)
 */

export enum SecurityEventType {
  // Recovery events
  RECOVERY_INITIATED = "recovery.initiated",
  RECOVERY_SUCCESS = "recovery.success",
  RECOVERY_FAILED = "recovery.failed",
  RECOVERY_EXPIRED = "recovery.expired",

  // OAuth events
  OAUTH_RECOVERY_INITIATED = "oauth_recovery.initiated",
  OAUTH_RECOVERY_VERIFIED = "oauth_recovery.verified",
  OAUTH_RECOVERY_SUCCESS = "oauth_recovery.success",
  OAUTH_RECOVERY_FAILED = "oauth_recovery.failed",
  OAUTH_MISMATCH = "oauth.mismatch",
  
  // Backup events
  BACKUP_CREATED = "backup.created",
  BACKUP_ACCESSED = "backup.accessed",
  
  // Security violations
  RATE_LIMIT_EXCEEDED = "security.rate_limit_exceeded",
  USER_MISMATCH = "security.user_mismatch",
  INVALID_CREDENTIALS = "security.invalid_credentials",
  SESSION_EXPIRED = "security.session_expired",
}

export interface SecurityEvent {
  type: SecurityEventType;
  userId?: string;
  identifier?: string; // email/phone
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
  success: boolean;
}

/**
 * Log security event
 * In production, send to logging service and trigger alerts for suspicious patterns
 */
export function logSecurityEvent(event: SecurityEvent): void {
  const logEntry = {
    ...event,
    timestamp: event.timestamp.toISOString(),
  };

  // Log to console with structured format
  if (event.success) {
    console.log("[SECURITY_EVENT]", JSON.stringify(logEntry));
  } else {
    console.warn("[SECURITY_ALERT]", JSON.stringify(logEntry));
  }

  // TODO: In production:
  // - Send to logging service (Datadog, Sentry, CloudWatch, etc.)
  // - Trigger alerts for repeated failures
  // - Block IPs with suspicious patterns
  // - Send notifications for critical events
}

/**
 * Detect suspicious patterns in events
 */
export function detectSuspiciousActivity(events: SecurityEvent[]): boolean {
  // Check for multiple failed attempts from same identifier/IP
  const failedAttempts = events.filter(e => !e.success);
  
  if (failedAttempts.length >= 5) {
    return true;
  }

  // Check for rapid succession attempts (< 1 second apart)
  for (let i = 1; i < events.length; i++) {
    const timeDiff = events[i]!.timestamp.getTime() - events[i - 1]!.timestamp.getTime();
    if (timeDiff < 1000) {
      return true;
    }
  }

  return false;
}

/**
 * Extract security context from request
 */
export function getSecurityContext(request: Request): {
  ip: string;
  userAgent: string;
} {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || 
             request.headers.get("x-real-ip") || 
             "unknown";

  const userAgent = request.headers.get("user-agent") || "unknown";

  return { ip, userAgent };
}

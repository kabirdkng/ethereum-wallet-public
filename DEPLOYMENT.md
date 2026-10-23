# Deployment Guide - Vercel + Neon

## Prerequisites
- [x] Neon database created and connection string ready
- [x] Redis instance (Upstash, Redis Cloud, or similar)
- [x] GitHub repository (for automatic deployments)

## Step-by-Step Deployment

### 1. Push Code to GitHub
```bash
git add .
git commit -m "Production ready with rate limiting and security headers"
git push origin main
```

### 2. Import Project to Vercel
1. Go to https://vercel.com
2. Click **"Add New Project"**
3. Import your GitHub repository
4. Framework Preset: **Next.js** (auto-detected)
5. Root Directory: `./` (default)

### 3. Configure Environment Variables
Add these in Vercel Project Settings → Environment Variables:

#### Required
```bash
DATABASE_URL=postgresql://username:password@ep-xxx.aws.neon.tech/neondb?sslmode=require
NEXTAUTH_SECRET=your-32-character-minimum-secret-here
NEXTAUTH_URL=https://your-app.vercel.app
```

#### Redis (Recommended for Production)
```bash
REDIS_URL=redis://default:password@your-redis-host:6379
RATE_LIMIT_ENABLED=true
```

#### Email (Optional - Resend)
```bash
RESEND_API_KEY=re_xxxxx
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

#### SMS (Optional - Twilio)
```bash
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=your_token
TWILIO_VERIFY_SERVICE_SID=VAxxxxx
TWILIO_FROM_NUMBER=+1234567890
```

#### OAuth (Optional)
```bash
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
FACEBOOK_APP_ID=xxx
FACEBOOK_APP_SECRET=xxx
ENCRYPTION_SECRET=your-32-character-encryption-secret
```

#### Blockchain (Optional)
```bash
ALCHEMY_API_KEY=your_key
ETHERSCAN_API_KEY=your_key
NEXT_PUBLIC_ALCHEMY_API_KEY=your_key
NEXT_PUBLIC_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR-KEY
NEXT_PUBLIC_NETWORK=sepolia
NEXT_PUBLIC_ETHERSCAN_API_KEY=your_key
```

#### Platform Fees
```bash
NEXT_PUBLIC_PLATFORM_FEE_PERCENTAGE=1.5
NEXT_PUBLIC_PLATFORM_FEE_RECIPIENT=0xYourWalletAddress
NEXT_PUBLIC_BASE_URL=https://your-app.vercel.app
```

### 4. Run Database Migrations
After first deployment, run migrations:

**Option A: Vercel CLI** (recommended)
```bash
npm i -g vercel
vercel env pull .env.production
npm run prisma:deploy
```

**Option B: Direct Migration** (one-time)
```bash
# Locally with production DATABASE_URL
DATABASE_URL="your-neon-url" npx prisma migrate deploy
```

### 5. Deploy
```bash
# Automatic: Push to GitHub triggers deployment
git push origin main

# Manual: Deploy via Vercel CLI
vercel --prod
```

## Post-Deployment Checklist

### Security
- [ ] Verify HTTPS is enforced
- [ ] Test security headers (use securityheaders.com)
- [ ] Confirm CSP is not blocking necessary resources
- [ ] Test rate limiting on auth endpoints

### OAuth Setup (if using)
**Google OAuth:**
1. Google Cloud Console → Credentials
2. Add authorized redirect URI: `https://your-app.vercel.app/api/auth/callback/google`

**Facebook OAuth:**
1. Facebook Developer Console → App Settings
2. Add redirect URI: `https://your-app.vercel.app/api/auth/callback/facebook`

### Testing
- [ ] Create account (email/phone verification)
- [ ] Wallet setup and PIN creation
- [ ] Send transaction (testnet)
- [ ] Recovery setup (social or cloud)
- [ ] Rate limiting (try 6 signups quickly)
- [ ] OAuth login (if configured)

### Monitoring
- [ ] Enable Vercel Analytics
- [ ] Set up error tracking (Sentry recommended)
- [ ] Monitor Neon database metrics
- [ ] Monitor Redis usage

## Recommended Services

### Database
- **Neon** (Free tier: 0.5 GB storage, 3 projects)
  - https://console.neon.tech

### Redis
- **Upstash** (Free tier: 10k commands/day)
  - https://console.upstash.com
- **Redis Cloud** (Free tier: 30 MB)
  - https://redis.com/try-free

### Email
- **Resend** (Free tier: 100 emails/day)
  - https://resend.com

### SMS
- **Twilio** (Trial: $15.50 credit)
  - https://www.twilio.com/try-twilio

### Blockchain RPC
- **Alchemy** (Free tier: 300M compute units/month)
  - https://alchemy.com

## Troubleshooting

### Build Fails
```bash
# Error: Prisma Client not generated
# Fix: Ensured by postinstall script in package.json
```

### Runtime Errors
```bash
# Check Vercel Function Logs
vercel logs <deployment-url>
```

### Database Connection Issues
```bash
# Verify DATABASE_URL has ?sslmode=require
# Neon requires SSL connections
```

### CORS Errors
- Check NEXTAUTH_URL matches your Vercel domain
- Update OAuth redirect URIs

## Environment Variables Summary

**Critical (Must Set):**
- `DATABASE_URL`
- `NEXTAUTH_SECRET` (generate: `openssl rand -base64 32`)
- `NEXTAUTH_URL`

**Recommended:**
- `REDIS_URL` (for rate limiting)
- `RESEND_API_KEY` + `RESEND_FROM_EMAIL` (for email OTP)
- `TWILIO_*` (for SMS OTP)

**Optional:**
- OAuth credentials (Google, Facebook)
- Blockchain API keys (Alchemy, Etherscan)
- Platform fee configuration

## Continuous Deployment

Once set up, every push to `main` branch automatically:
1. Runs `npm install`
2. Executes `postinstall` (generates Prisma client)
3. Runs `build` script (generates Prisma + builds Next.js)
4. Deploys to production

## Performance Tips

1. **Enable Vercel Edge Caching** for static assets
2. **Use Neon connection pooling** (already enabled via ?sslmode=require)
3. **Monitor Redis memory usage** and upgrade if needed
4. **Set up CDN** for profile images if storing OAuth pictures

## Security Notes

- Never commit `.env` files
- Rotate `NEXTAUTH_SECRET` if leaked
- Use separate databases for staging/production
- Enable Vercel password protection for preview deployments
- Set up Vercel IP allowlist if handling large funds

---

**Your app is production-ready! 🚀**

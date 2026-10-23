import NextAuth, { NextAuthConfig } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import { prisma } from "@/lib/prisma";
import { getServerEnv } from "@/config/env";

const env = getServerEnv();

export const authConfig: NextAuthConfig = {
  providers: [
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
    FacebookProvider({
      clientId: env.FACEBOOK_APP_ID!,
      clientSecret: env.FACEBOOK_APP_SECRET!,
    }),
  ],
  basePath: "/api/auth",
  trustHost: true,
  callbacks: {
    async signIn({ user, account }) {
      if (!account) return false;

      try {
        // Find or create user with OAuth data
        let dbUser = await prisma.user.findFirst({
          where: {
            AND: [
              { oauthProvider: account.provider },
              { oauthId: account.providerAccountId },
            ],
          },
        });

        if (!dbUser) {
          // Check if email already exists (prevent account takeover)
          const emailUser = await prisma.user.findUnique({
            where: { email: user.email!.toLowerCase() },
          });

          if (emailUser && !emailUser.oauthProvider) {
            // User signed up via OTP/PIN - link OAuth to existing account
            console.log("[Auth] Linking OAuth to existing OTP account:", user.email);
            dbUser = await prisma.user.update({
              where: { id: emailUser.id },
              data: {
                oauthProvider: account.provider,
                oauthId: account.providerAccountId,
                profilePicture: user.image || null,
                emailVerified: true, // OAuth emails are pre-verified by provider
              },
            });
          } else if (emailUser) {
            // Update existing user with OAuth data
            dbUser = await prisma.user.update({
              where: { id: emailUser.id },
              data: {
                oauthProvider: account.provider,
                oauthId: account.providerAccountId,
                profilePicture: user.image || null,
                emailVerified: true, // OAuth emails are pre-verified by provider
              },
            });
          } else {
            // Create new user with OAuth data
            dbUser = await prisma.user.create({
              data: {
                email: user.email!.toLowerCase(),
                oauthProvider: account.provider,
                oauthId: account.providerAccountId,
                profilePicture: user.image || null,
                emailVerified: true, // OAuth emails are pre-verified by provider
              },
            });
          }
        } else {
          // Update profile picture if changed
          if (user.image && user.image !== dbUser.profilePicture) {
            dbUser = await prisma.user.update({
              where: { id: dbUser.id },
              data: { profilePicture: user.image },
            });
          }
        }

        // Store the database user ID in the account for later retrieval
        user.id = dbUser.id;

        return true;
      } catch (error) {
        console.error("[Auth] OAuth sign-in error:", error);
        return false;
      }
    },

    async jwt({ token, user, account }) {
      // On initial sign in, add our custom data to the token
      if (account && user) {
        const dbUser = await prisma.user.findFirst({
          where: {
            AND: [
              { oauthProvider: account.provider },
              { oauthId: account.providerAccountId },
            ],
          },
        });

        if (dbUser) {
          token.userId = dbUser.id;
          token.walletAddress = dbUser.walletAddress;
          token.oauthProvider = dbUser.oauthProvider;
          token.profilePicture = dbUser.profilePicture;
        }
      }
      return token;
    },

    async session({ session, token }) {
      // Add our custom data to the session
      if (session.user) {
        type CustomUser = typeof session.user & {
          userId?: string;
          walletAddress?: string | null;
          oauthProvider?: string | null;
          profilePicture?: string | null;
        };
        const customUser = session.user as CustomUser;
        customUser.userId = token.userId as string;
        customUser.walletAddress = token.walletAddress as string | null;
        customUser.oauthProvider = token.oauthProvider as string | null;
        customUser.profilePicture = token.profilePicture as string | null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/onboarding",  // Redirect to your custom auth page
    error: "/onboarding",
  },
  session: {
    strategy: "jwt",  // Use JWT strategy instead of database (no adapter needed)
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

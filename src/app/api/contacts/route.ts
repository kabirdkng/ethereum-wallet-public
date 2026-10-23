import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAddress } from "viem";
import { getCached, setCached, deleteCached, cacheKeys } from "@/lib/cache/redis";

// GET /api/contacts - List all contacts for authenticated user
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionToken = authHeader.substring(7);

    // Verify session
    const session = await prisma.session.findUnique({
      where: { sessionToken },
      include: { User: true },
    });

    if (!session || session.expires < new Date()) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    // Check for force refresh query param
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "true";

    // Try to get cached contacts first (unless force refresh)
    if (!forceRefresh) {
      const cacheKey = cacheKeys.contacts(session.userId);
      const cached = await getCached<{ contacts: unknown[] }>(cacheKey);

      if (cached) {
        console.log(`[ContactsAPI] Cache hit for user ${session.userId}`);
        return NextResponse.json({
          success: true,
          ...cached,
          fromCache: true,
        });
      }
      console.log(`[ContactsAPI] Cache miss for user ${session.userId}`);
    } else {
      console.log(`[ContactsAPI] Force refresh for user ${session.userId}`);
    }

    // Fetch all contacts for this user
    const contacts = await prisma.contact.findMany({
      where: { userId: session.userId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        walletAddress: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const responseData = { contacts };

    // Cache the response for 60 seconds (contacts don't change frequently)
    const cacheKey = cacheKeys.contacts(session.userId);
    await setCached(cacheKey, responseData, 60);

    return NextResponse.json({ success: true, ...responseData });
  } catch (error) {
    console.error("Error fetching contacts:", error);
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
  }
}

// POST /api/contacts - Create a new contact
const createContactSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  walletAddress: z.string().refine((addr) => isAddress(addr), {
    message: "Invalid Ethereum address",
  }),
  notes: z.string().max(500, "Notes are too long").optional(),
});

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sessionToken = authHeader.substring(7);

    // Verify session
    const session = await prisma.session.findUnique({
      where: { sessionToken },
    });

    if (!session || session.expires < new Date()) {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    const json = await request.json();
    const parsed = createContactSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, walletAddress, notes } = parsed.data;

    // Check if contact already exists for this user (case-insensitive comparison)
    const existingContact = await prisma.contact.findFirst({
      where: {
        userId: session.userId,
        walletAddress: {
          equals: walletAddress,
          mode: 'insensitive',
        },
      },
    });

    if (existingContact) {
      return NextResponse.json(
        { error: "A contact with this address already exists" },
        { status: 409 }
      );
    }

    // Create contact preserving the original address format
    const contact = await prisma.contact.create({
      data: {
        userId: session.userId,
        name,
        walletAddress: walletAddress,
        notes: notes || null,
      },
      select: {
        id: true,
        name: true,
        walletAddress: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Invalidate contacts cache
    const cacheKey = cacheKeys.contacts(session.userId);
    await deleteCached(cacheKey);
    console.log(`[ContactsAPI] Cache invalidated for user ${session.userId}`);

    return NextResponse.json({ success: true, contact }, { status: 201 });
  } catch (error) {
    console.error("Error creating contact:", error);
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
  }
}

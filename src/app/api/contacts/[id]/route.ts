import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAddress } from "viem";
import { deleteCached, cacheKeys } from "@/lib/cache/redis";

// PATCH /api/contacts/[id] - Update a contact
const updateContactSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long").optional(),
  walletAddress: z
    .string()
    .refine((addr) => isAddress(addr), {
      message: "Invalid Ethereum address",
    })
    .optional(),
  notes: z.string().max(500, "Notes are too long").optional().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
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
    const parsed = updateContactSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // Check if contact exists and belongs to user
    const existingContact = await prisma.contact.findFirst({
      where: {
        id,
        userId: session.userId,
      },
    });

    if (!existingContact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    const updateData: {
      name?: string;
      walletAddress?: string;
      notes?: string | null;
    } = {};

    if (parsed.data.name !== undefined) {
      updateData.name = parsed.data.name;
    }
    if (parsed.data.walletAddress !== undefined) {
      // Check if new address conflicts with existing contact (case-insensitive)
      const conflictingContact = await prisma.contact.findFirst({
        where: {
          userId: session.userId,
          walletAddress: {
            equals: parsed.data.walletAddress,
            mode: 'insensitive',
          },
          id: {
            not: id,
          },
        },
      });

      if (conflictingContact) {
        return NextResponse.json(
          { error: "A contact with this address already exists" },
          { status: 409 }
        );
      }

      updateData.walletAddress = parsed.data.walletAddress;
    }
    if (parsed.data.notes !== undefined) {
      updateData.notes = parsed.data.notes;
    }

    // Update contact
    const contact = await prisma.contact.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json({ success: true, contact });
  } catch (error) {
    console.error("Error updating contact:", error);
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
  }
}

// DELETE /api/contacts/[id] - Delete a contact
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
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

    // Check if contact exists and belongs to user
    const existingContact = await prisma.contact.findFirst({
      where: {
        id,
        userId: session.userId,
      },
    });

    if (!existingContact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    // Delete contact
    await prisma.contact.delete({
      where: { id },
    });

    // Invalidate contacts cache
    const cacheKey = cacheKeys.contacts(session.userId);
    await deleteCached(cacheKey);
    console.log(`[ContactsAPI] Cache invalidated for user ${session.userId}`);

    return NextResponse.json({ success: true, message: "Contact deleted successfully" });
  } catch (error) {
    console.error("Error deleting contact:", error);
    return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 });
  }
}

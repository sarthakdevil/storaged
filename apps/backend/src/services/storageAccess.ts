import { prisma } from "../utils/prisma";
class StorageAccessError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}
export async function storageManagementScope(userId: string) {
  if (!userId) throw new StorageAccessError("Authentication is required.", 401);
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isActive: true },
  });
  if (!user?.isActive)
    throw new StorageAccessError("Account is unavailable.", 403);
  return user.role === "ADMIN" ? {} : { ownerId: userId };
}
export async function requireStorageAccess(userId: string, bucketId: string) {
  const scope = await storageManagementScope(userId);
  const bucket = await prisma.bucket.findFirst({
    where: { id: bucketId, ...scope },
    select: { id: true },
  });
  if (!bucket)
    throw new StorageAccessError("Storage connection not found.", 404);
}

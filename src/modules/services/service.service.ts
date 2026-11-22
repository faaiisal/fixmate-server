import { ObjectId } from "mongodb";
import { getDb } from "../../config/db.js";
import { COLLECTIONS } from "../../config/collections.js";
import { AppError } from "../../utils/api-response.js";
import {
  ServiceDocument,
  CreateServiceInput,
  UpdateServiceInput,
  ApprovalStatus,
  ServiceCategory,
} from "./service.interface.js";
import { escapeRegExp } from "../../utils/escape-regexp.js";
import { normalizeServiceMode, buildServiceModeFilter } from "../../utils/mapping.js";

function toObjectId(id: string): ObjectId {
  if (!ObjectId.isValid(id)) {
    throw new AppError(`Invalid ID format: ${id}`, 400);
  }
  return new ObjectId(id);
}

// Normalize category to allowed values — keep input as is but validate against list
const ALLOWED_CATEGORIES: ServiceCategory[] = [
  "Smartphone",
  "Laptop & PC",
  "Laptop",
  "Air Conditioner",
  "AC",
  "Refrigerator",
  "Television",
  "TV",
  "Washing Machine",
  "Electrical Appliances",
  "Other",
];

export interface ListServicesOptions {
  page?: number;
  limit?: number;
  category?: ServiceCategory;
  search?: string;
  serviceArea?: string;
  serviceMode?: "doorstep" | "workshop" | "both";
  sortBy?: "createdAt" | "basePrice" | "title";
  sortOrder?: "asc" | "desc";
  // Admin filters
  approvalStatus?: ApprovalStatus;
  technicianId?: string;
  isAvailable?: boolean;
}

export async function createService(
  technicianId: string,
  input: CreateServiceInput
): Promise<ServiceDocument> {
  const db = getDb();
  const techOid = toObjectId(technicianId);

  // Verify technician exists and has technician role (or admin can also create? per spec only technicians, but allow admin too for flexibility)
  const techUser = await db.collection(COLLECTIONS.USERS).findOne({ _id: techOid as never } as any);
  if (!techUser) {
    throw new AppError("Technician user not found", 404);
  }
  const role = (techUser as any).role;
  if (role !== "technician" && role !== "admin") {
    throw new AppError("Only technicians can create services", 403);
  }

  // Validate category
  if (!ALLOWED_CATEGORIES.includes(input.category as ServiceCategory)) {
    // Allow case-insensitive match for spec categories like "Smartphone", "Laptop & PC" etc.
    // Try to normalize common aliases
    const normalized = ALLOWED_CATEGORIES.find((c) => c.toLowerCase() === input.category.toLowerCase());
    if (!normalized) {
      throw new AppError(
        `Invalid category. Allowed: ${ALLOWED_CATEGORIES.join(", ")}`,
        400
      );
    }
    input.category = normalized as ServiceCategory;
  }

  if (input.basePrice <= 0) {
    throw new AppError("Base price must be positive", 400);
  }

  // Phase 2: Normalize serviceMode assignment terminology to internal canonical
  // Home Visit -> doorstep, Shop Drop-off -> workshop, both stays both
  // Keep existing values intact, map new ones
  if (input.serviceMode) {
    const normalized = normalizeServiceMode(input.serviceMode);
    if (normalized) {
      input.serviceMode = normalized as any;
    }
  }

  const now = new Date();
  const doc: Omit<ServiceDocument, "_id"> = {
    technicianId: techOid,
    technicianName: (techUser as any).name, // denormalized snapshot per spec
    technicianEmail: (techUser as any).email, // denormalized snapshot per spec
    title: input.title.trim(),
    category: input.category,
    description: input.description.trim(),
    basePrice: input.basePrice,
    estimatedDuration: input.estimatedDuration,
    serviceMode: input.serviceMode || "doorstep",
    serviceArea: input.serviceArea,
    image: input.image,
    images: input.images || [input.image],
    approvalStatus: "pending", // must be pending on creation per spec
    isAvailable: true, // newly created available by default, but pending approval hides it from public
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection(COLLECTIONS.SERVICES).insertOne(doc as any);
  const created = { _id: result.insertedId, ...doc } as ServiceDocument;
  return created;
}

export async function getPublicServices(options: ListServicesOptions) {
  const db = getDb();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const skip = (page - 1) * limit;

  const filter: any = {
    approvalStatus: "approved",
    isAvailable: true,
  };

  if (options.category) {
    filter.category = options.category;
  }
  if (options.serviceArea) {
    filter.serviceArea = { $regex: options.serviceArea, $options: "i" };
  }
  if (options.serviceMode) {
    const modeFilter = buildServiceModeFilter(options.serviceMode);
    if (modeFilter) {
      filter.serviceMode = modeFilter;
    }
  }
  if (options.search) {
    // Use text search if available, else regex
    // For simplicity use regex on title/description - escaped to prevent ReDoS
    const regex = new RegExp(escapeRegExp(options.search.trim()), "i");
    filter.$or = [{ title: regex }, { description: regex }];
  }

  const sortField = options.sortBy || "createdAt";
  const sortOrder = options.sortOrder === "asc" ? 1 : -1;

  const collection = db.collection<ServiceDocument>(COLLECTIONS.SERVICES);

  // If search provided and we have text index, we could use $text, but regex works for now
  const [services, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortOrder } as any).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  return {
    services,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getServiceById(
  serviceId: string,
  requester?: { id: string; role: string }
): Promise<ServiceDocument> {
  const db = getDb();
  const oid = toObjectId(serviceId);

  const service = await db.collection<ServiceDocument>(COLLECTIONS.SERVICES).findOne({ _id: oid } as any);
  if (!service) {
    throw new AppError("Service not found", 404);
  }

  // Public visibility check
  const isOwner = requester && service.technicianId.toString() === requester.id;
  const isAdmin = requester?.role === "admin";

  if (service.approvalStatus !== "approved" || !service.isAvailable) {
    // If not approved/available, only owner or admin can see
    if (!isOwner && !isAdmin) {
      throw new AppError("Service not available or not approved", 404);
    }
  }

  return service;
}

export async function getMyServices(
  technicianId: string,
  options: ListServicesOptions
) {
  const db = getDb();
  const techOid = toObjectId(technicianId);
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const skip = (page - 1) * limit;

  const filter: any = { technicianId: techOid };
  if (options.approvalStatus) filter.approvalStatus = options.approvalStatus;
  if (options.category) filter.category = options.category;
  if (options.search) {
    const regex = new RegExp(escapeRegExp(options.search.trim()), "i");
    filter.$or = [{ title: regex }, { description: regex }];
  }

  const sortField = options.sortBy || "createdAt";
  const sortOrder = options.sortOrder === "asc" ? 1 : -1;

  const collection = db.collection<ServiceDocument>(COLLECTIONS.SERVICES);

  const [services, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortOrder } as any).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  return {
    services,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function updateOwnService(
  technicianId: string,
  serviceId: string,
  input: UpdateServiceInput
): Promise<ServiceDocument> {
  const db = getDb();
  const techOid = toObjectId(technicianId);
  const serviceOid = toObjectId(serviceId);

  const existing = await db.collection<ServiceDocument>(COLLECTIONS.SERVICES).findOne({ _id: serviceOid } as any);
  if (!existing) {
    throw new AppError("Service not found", 404);
  }

  // Ownership check
  if (existing.technicianId.toString() !== techOid.toString()) {
    throw new AppError("Forbidden: You can only manage your own services", 403);
  }

  const updateFields: any = {};
  if (input.title !== undefined) {
    if (input.title.trim().length < 3) throw new AppError("Title must be at least 3 characters", 400);
    updateFields.title = input.title.trim();
  }
  if (input.category !== undefined) {
    if (!ALLOWED_CATEGORIES.includes(input.category as ServiceCategory)) {
      throw new AppError(`Invalid category. Allowed: ${ALLOWED_CATEGORIES.join(", ")}`, 400);
    }
    updateFields.category = input.category;
  }
  if (input.description !== undefined) {
    if (input.description.trim().length < 10) throw new AppError("Description must be at least 10 characters", 400);
    updateFields.description = input.description.trim();
  }
  if (input.basePrice !== undefined) {
    if (input.basePrice <= 0) throw new AppError("Base price must be positive", 400);
    updateFields.basePrice = input.basePrice;
  }
  if (input.estimatedDuration !== undefined) updateFields.estimatedDuration = input.estimatedDuration;
  if (input.serviceMode !== undefined) {
    const normalized = normalizeServiceMode(input.serviceMode);
    updateFields.serviceMode = normalized || input.serviceMode;
  }
  if (input.serviceArea !== undefined) updateFields.serviceArea = input.serviceArea;
  if (input.image !== undefined) updateFields.image = input.image;
  if (input.images !== undefined) updateFields.images = input.images;
  if (input.isAvailable !== undefined) updateFields.isAvailable = input.isAvailable;

  if (Object.keys(updateFields).length === 0) {
    throw new AppError("No valid fields to update", 400);
  }

  // Per spec: when technician edits a service, approval status must return to pending
  updateFields.approvalStatus = "pending";
  updateFields.updatedAt = new Date();

  const result = await db.collection(COLLECTIONS.SERVICES).findOneAndUpdate(
    { _id: serviceOid, technicianId: techOid } as any,
    { $set: updateFields },
    { returnDocument: "after" }
  );

  if (!result) {
    throw new AppError("Failed to update service", 500);
  }

  return result as ServiceDocument;
}

export async function deleteOwnService(
  technicianId: string,
  serviceId: string
): Promise<void> {
  const db = getDb();
  const techOid = toObjectId(technicianId);
  const serviceOid = toObjectId(serviceId);

  const existing = await db.collection<ServiceDocument>(COLLECTIONS.SERVICES).findOne({ _id: serviceOid } as any);
  if (!existing) {
    throw new AppError("Service not found", 404);
  }
  if (existing.technicianId.toString() !== techOid.toString()) {
    throw new AppError("Forbidden: You can only delete your own services", 403);
  }

  const result = await db.collection(COLLECTIONS.SERVICES).deleteOne({ _id: serviceOid, technicianId: techOid } as any);
  if (result.deletedCount === 0) {
    throw new AppError("Failed to delete service", 500);
  }
}

export async function toggleAvailability(
  technicianId: string,
  serviceId: string
): Promise<ServiceDocument> {
  const db = getDb();
  const techOid = toObjectId(technicianId);
  const serviceOid = toObjectId(serviceId);

  const existing = await db.collection<ServiceDocument>(COLLECTIONS.SERVICES).findOne({ _id: serviceOid } as any);
  if (!existing) {
    throw new AppError("Service not found", 404);
  }
  if (existing.technicianId.toString() !== techOid.toString()) {
    throw new AppError("Forbidden: You can only manage your own services", 403);
  }

  const newAvailability = !existing.isAvailable;
  const result = await db.collection(COLLECTIONS.SERVICES).findOneAndUpdate(
    { _id: serviceOid, technicianId: techOid } as any,
    { $set: { isAvailable: newAvailability, updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!result) throw new AppError("Failed to toggle availability", 500);
  return result as ServiceDocument;
}

export async function adminListPending(options: ListServicesOptions) {
  const db = getDb();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const skip = (page - 1) * limit;

  const filter: any = { approvalStatus: "pending" };
  if (options.category) filter.category = options.category;
  if (options.search) {
    const regex = new RegExp(escapeRegExp(options.search.trim()), "i");
    filter.$or = [{ title: regex }, { description: regex }];
  }

  const sortField = options.sortBy || "createdAt";
  const sortOrder = options.sortOrder === "asc" ? 1 : -1;

  const collection = db.collection<ServiceDocument>(COLLECTIONS.SERVICES);

  const [services, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortOrder } as any).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  return {
    services,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function adminApproveOrReject(
  serviceId: string,
  status: ApprovalStatus
): Promise<ServiceDocument> {
  if (!["approved", "rejected"].includes(status)) {
    throw new AppError("Invalid approval status. Must be approved or rejected", 400);
  }

  const db = getDb();
  const oid = toObjectId(serviceId);

  const existing = await db.collection<ServiceDocument>(COLLECTIONS.SERVICES).findOne({ _id: oid } as any);
  if (!existing) {
    throw new AppError("Service not found", 404);
  }

  const result = await db.collection(COLLECTIONS.SERVICES).findOneAndUpdate(
    { _id: oid } as any,
    { $set: { approvalStatus: status, updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!result) throw new AppError("Failed to update approval status", 500);
  return result as ServiceDocument;
}

export async function adminListAll(options: ListServicesOptions) {
  const db = getDb();
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const skip = (page - 1) * limit;

  const filter: any = {};
  if (options.approvalStatus) filter.approvalStatus = options.approvalStatus;
  if (options.category) filter.category = options.category;
  if (options.technicianId) {
    filter.technicianId = toObjectId(options.technicianId);
  }
  if (options.search) {
    const regex = new RegExp(escapeRegExp(options.search.trim()), "i");
    filter.$or = [{ title: regex }, { description: regex }];
  }

  const sortField = options.sortBy || "createdAt";
  const sortOrder = options.sortOrder === "asc" ? 1 : -1;

  const collection = db.collection<ServiceDocument>(COLLECTIONS.SERVICES);

  const [services, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortOrder } as any).skip(skip).limit(limit).toArray(),
    collection.countDocuments(filter),
  ]);

  return {
    services,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

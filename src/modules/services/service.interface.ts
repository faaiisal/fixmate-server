import { ObjectId } from "mongodb";

export type ServiceCategory =
  | "Smartphone"
  | "Laptop & PC"
  | "Laptop"
  | "Air Conditioner"
  | "AC"
  | "Refrigerator"
  | "Television"
  | "TV"
  | "Washing Machine"
  | "Electrical Appliances"
  | "Other";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type ServiceMode = "doorstep" | "workshop" | "both";

export interface ServiceDocument {
  _id: ObjectId;
  technicianId: ObjectId;
  technicianName?: string; // denormalized snapshot per spec
  technicianEmail?: string; // denormalized snapshot per spec
  title: string;
  category: ServiceCategory;
  description: string;
  basePrice: number;
  estimatedDuration?: string; // e.g. "2-3 hours", "45 mins"
  serviceMode: ServiceMode; // doorstep visit, workshop, both
  serviceArea?: string; // e.g. "San Francisco, Bay Area"
  image: string; // primary image URL (ImgBB)
  images?: string[]; // optional additional images for frontend compatibility
  approvalStatus: ApprovalStatus;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateServiceInput {
  title: string;
  category: ServiceCategory;
  description: string;
  basePrice: number;
  estimatedDuration?: string;
  serviceMode?: ServiceMode; // default doorstep
  serviceArea?: string;
  image: string;
  images?: string[];
}

export interface UpdateServiceInput {
  title?: string;
  category?: ServiceCategory;
  description?: string;
  basePrice?: number;
  estimatedDuration?: string;
  serviceMode?: ServiceMode;
  serviceArea?: string;
  image?: string;
  images?: string[];
  isAvailable?: boolean; // toggle availability
}

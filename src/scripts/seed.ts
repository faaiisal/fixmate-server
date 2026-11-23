/**
 * FixMate Development Seed Data - Repeatable, Safe, Preserves Existing Records
 * 
 * Requirements:
 * - At least 2 technicians, 2 customers
 * - At least 12 approved and available services across 7 categories
 * - Several bookings with different statuses
 * - Payment records only where consistent
 * - Never delete existing records, safe to run more than once, prevent duplicates via upsert
 * - Use existing password hashing mechanism (BetterAuth scrypt)
 * - Do not create admin via public registration, follow secure admin provisioning
 * 
 * Usage:
 * npm run seed (or tsx src/scripts/seed.ts)
 * npm run build && node dist/scripts/seed.js
 */

import { ObjectId } from "mongodb";
import { connectDB, closeDB } from "../config/db.js";
import { COLLECTIONS } from "../config/collections.js";
import { ensureIndexes } from "../config/indexes.js";
import { scryptAsync } from "@noble/hashes/scrypt.js";

// Hex encoding helpers (matching @better-auth/utils hex)
function hexEncode(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexDecode(hexStr: string): Uint8Array {
  const bytes = new Uint8Array(hexStr.length / 2);
  for (let i = 0; i < hexStr.length; i += 2) {
    bytes[i / 2] = parseInt(hexStr.substring(i, i + 2), 16);
  }
  return bytes;
}

// BetterAuth password hashing config (from @better-auth/utils/dist/password.mjs)
const PASSWORD_CONFIG = {
  N: 16384,
  r: 16,
  p: 1,
  dkLen: 64,
  maxmem: 128 * 16384 * 16 * 2, // 64MB
};

async function hashPassword(password: string): Promise<string> {
  // Generate 16 random bytes for salt
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  const saltHex = hexEncode(saltBytes);
  
  // Generate key using scrypt with salt as hex string (matching BetterAuth)
  const keyBytes = await scryptAsync(password.normalize("NFKC"), saltHex, {
    N: PASSWORD_CONFIG.N,
    r: PASSWORD_CONFIG.r,
    p: PASSWORD_CONFIG.p,
    dkLen: PASSWORD_CONFIG.dkLen,
    maxmem: PASSWORD_CONFIG.maxmem,
  });
  
  const keyHex = hexEncode(keyBytes);
  return `${saltHex}:${keyHex}`;
}

// Stable seed identifiers - use email as unique key for users, title+technician for services
const SEED_USERS = [
  // Additional Technicians (need at least 2 total, we have 1 Mobarak, so add 2 more)
  {
    email: "technician.seed1@fixmate.dev",
    name: "Alice Johnson",
    role: "technician" as const,
    phone: "+8801711111111",
    address: "Dhaka, Bangladesh - Tech Zone",
    bio: "Certified smartphone and laptop repair expert with 8+ years experience. Samsung and Apple certified.",
    profileImage: "https://i.ibb.co/placeholder/alice.jpg",
  },
  {
    email: "technician.seed2@fixmate.dev",
    name: "Bob Smith",
    role: "technician" as const,
    phone: "+8801722222222",
    address: "Chittagong, Bangladesh - Service Hub",
    bio: "HVAC and home appliance specialist. Daikin, LG, Samsung certified for AC, Refrigerator, Washing Machine.",
    profileImage: "https://i.ibb.co/placeholder/bob.jpg",
  },
  // Additional Customers (need at least 2 total, we have 1 Robart, so add 2 more)
  {
    email: "customer.seed1@fixmate.dev",
    name: "Emma Wilson",
    role: "customer" as const,
    phone: "+8801733333333",
    address: "Gulshan, Dhaka, Bangladesh",
    bio: "Regular customer with multiple appliances",
    profileImage: "https://i.ibb.co/placeholder/emma.jpg",
  },
  {
    email: "customer.seed2@fixmate.dev",
    name: "David Lee",
    role: "customer" as const,
    phone: "+8801744444444",
    address: "Dhanmondi, Dhaka, Bangladesh",
    bio: "Tech enthusiast, frequent service user",
    profileImage: "https://i.ibb.co/placeholder/david.jpg",
  },
];

const SEED_SERVICES = [
  // Smartphone - 2 services
  {
    title: "iPhone 14 Pro Max Screen Replacement - OEM OLED",
    category: "Smartphone" as const,
    description: "Original OLED display replacement for iPhone 14 Pro Max with True Tone calibration, Face ID retention, and IP68 waterproof resealing. Includes 90-day warranty on parts and labor.",
    basePrice: 299,
    estimatedDuration: "1-2 hours",
    serviceMode: "doorstep" as const,
    serviceArea: "Dhaka, Bangladesh",
    image: "https://i.ibb.co/smartphone/iphone14.jpg",
    seedId: "seed-service-smartphone-1",
  },
  {
    title: "Samsung Galaxy S23 Battery Replacement - Genuine",
    category: "Smartphone" as const,
    description: "Genuine Samsung battery replacement for Galaxy S23 series. Includes battery health check, charging port clean, and 6-month battery warranty. Doorstep service with safe battery disposal.",
    basePrice: 89,
    estimatedDuration: "45-60 mins",
    serviceMode: "doorstep" as const,
    serviceArea: "Dhaka, Bangladesh",
    image: "https://i.ibb.co/smartphone/galaxy-battery.jpg",
    seedId: "seed-service-smartphone-2",
  },
  // Laptop & PC - 2 services
  {
    title: "MacBook Pro 16 M2 Logic Board Microsoldering Repair",
    category: "Laptop & PC" as const,
    description: "Advanced microsoldering repair for MacBook Pro logic board issues. Fixes no power, no display, liquid damage. Includes microscope SMD inspection, shorted power rail repair, ultrasonic cleaning, and thermal upgrade.",
    basePrice: 450,
    estimatedDuration: "3-4 hours",
    serviceMode: "workshop" as const,
    serviceArea: "Dhaka, Bangladesh - Lab",
    image: "https://i.ibb.co/laptop/macbook-logic.jpg",
    seedId: "seed-service-laptop-1",
  },
  {
    title: "Dell XPS 15 Keyboard Replacement - Backlit",
    category: "Laptop & PC" as const,
    description: "Original backlit keyboard replacement for Dell XPS 15. Includes keycap alignment, backlight test, palmrest cleaning, and 90-day warranty. Fixes stuck keys, no backlight, liquid spill damage.",
    basePrice: 120,
    estimatedDuration: "2 hours",
    serviceMode: "both" as const,
    serviceArea: "Dhaka, Bangladesh",
    image: "https://i.ibb.co/laptop/dell-keyboard.jpg",
    seedId: "seed-service-laptop-2",
  },
  // Air Conditioner - 2 services
  {
    title: "Daikin Inverter AC Gas Refill - R32 & Deep Cleaning",
    category: "Air Conditioner" as const,
    description: "Complete R32 gas refill for Daikin inverter AC with deep chemical wash. Includes high-pressure jet wash, antimicrobial coil conditioning, digital manifold pressure test, leak detection and fix. 90-day cooling warranty.",
    basePrice: 180,
    estimatedDuration: "2-3 hours",
    serviceMode: "doorstep" as const,
    serviceArea: "Dhaka, Chittagong, Bangladesh",
    image: "https://i.ibb.co/ac/daikin-gas.jpg",
    seedId: "seed-service-ac-1",
  },
  {
    title: "LG Split AC PCB Repair - Inverter Board Fix",
    category: "Air Conditioner" as const,
    description: "Inverter PCB repair for LG split AC. Fixes no cooling, error codes, compressor not starting. Includes PCB component testing, relay replacement, sensor calibration, and 6-month warranty on board repair.",
    basePrice: 220,
    estimatedDuration: "3 hours",
    serviceMode: "doorstep" as const,
    serviceArea: "Dhaka, Bangladesh",
    image: "https://i.ibb.co/ac/lg-pcb.jpg",
    seedId: "seed-service-ac-2",
  },
  // Refrigerator - 1 more (we have 1 existing, need at least 2 total for category)
  {
    title: "LG Smart Inverter Refrigerator Compressor Repair",
    category: "Refrigerator" as const,
    description: "Smart inverter compressor repair for LG refrigerators. Fixes no cooling, noise, high electricity bill. Includes compressor testing, overload relay replacement, refrigerant recharge, and 1-year compressor warranty.",
    basePrice: 350,
    estimatedDuration: "3-4 hours",
    serviceMode: "doorstep" as const,
    serviceArea: "Dhaka, Bangladesh",
    image: "https://i.ibb.co/refrigerator/lg-compressor.jpg",
    seedId: "seed-service-refrigerator-2",
  },
  // Television - 2 services
  {
    title: "Sony Bravia 4K TV Panel Repair - Backlight Fix",
    category: "Television" as const,
    description: "Backlight and panel repair for Sony Bravia 4K TVs. Fixes no picture but sound, dark spots, flickering. Includes LED strip replacement, power board testing, and 6-month warranty. OEM parts.",
    basePrice: 280,
    estimatedDuration: "2-3 hours",
    serviceMode: "workshop" as const,
    serviceArea: "Dhaka, Bangladesh - Lab",
    image: "https://i.ibb.co/tv/sony-panel.jpg",
    seedId: "seed-service-tv-1",
  },
  {
    title: "Samsung QLED TV Motherboard Repair - No Power",
    category: "Television" as const,
    description: "Motherboard repair for Samsung QLED TVs with no power issue. Includes power supply testing, capacitor replacement, firmware reflash, and 90-day warranty. Fixes dead TV, boot loop, HDMI no signal.",
    basePrice: 200,
    estimatedDuration: "2 hours",
    serviceMode: "both" as const,
    serviceArea: "Dhaka, Bangladesh",
    image: "https://i.ibb.co/tv/samsung-motherboard.jpg",
    seedId: "seed-service-tv-2",
  },
  // Washing Machine - 2 services
  {
    title: "LG Front Load Washing Machine Drum Bearing Replacement",
    category: "Washing Machine" as const,
    description: "Drum bearing and seal replacement for LG front load washing machines. Fixes loud noise, vibration, water leakage. Includes bearing kit, seal, drum balancing, and 6-month warranty. Doorstep service.",
    basePrice: 150,
    estimatedDuration: "2-3 hours",
    serviceMode: "doorstep" as const,
    serviceArea: "Dhaka, Bangladesh",
    image: "https://i.ibb.co/washing/lg-bearing.jpg",
    seedId: "seed-service-washing-1",
  },
  {
    title: "Samsung Top Load Washer Motor Replacement - Inverter",
    category: "Washing Machine" as const,
    description: "Inverter motor replacement for Samsung top load washing machines. Fixes no spin, weak spin, error codes. Includes motor testing, coupling replacement, and 1-year motor warranty. Genuine Samsung parts.",
    basePrice: 180,
    estimatedDuration: "2 hours",
    serviceMode: "doorstep" as const,
    serviceArea: "Dhaka, Bangladesh",
    image: "https://i.ibb.co/washing/samsung-motor.jpg",
    seedId: "seed-service-washing-2",
  },
  // Electrical Appliances - 2 services
  {
    title: "Microwave Oven Magnetron Replacement - All Brands",
    category: "Electrical Appliances" as const,
    description: "Magnetron replacement for microwave ovens (Samsung, LG, Panasonic, etc.). Fixes no heating, sparking, noise. Includes high-voltage capacitor test, door switch check, and 6-month warranty. Doorstep service with genuine parts.",
    basePrice: 90,
    estimatedDuration: "1-2 hours",
    serviceMode: "doorstep" as const,
    serviceArea: "Dhaka, Bangladesh",
    image: "https://i.ibb.co/electrical/microwave-magnetron.jpg",
    seedId: "seed-service-electrical-1",
  },
  {
    title: "RO Water Purifier Full Service - Filter & Membrane",
    category: "Electrical Appliances" as const,
    description: "Complete RO water purifier service with filter and membrane replacement. Includes sediment, carbon, RO membrane replacement, booster pump check, TDS calibration, and 90-day service warranty. All brands serviced.",
    basePrice: 75,
    estimatedDuration: "1-2 hours",
    serviceMode: "doorstep" as const,
    serviceArea: "Dhaka, Bangladesh",
    image: "https://i.ibb.co/electrical/ro-filter.jpg",
    seedId: "seed-service-electrical-2",
  },
];

const SEED_BOOKINGS = [
  // Requested - 2 bookings
  {
    seedId: "seed-booking-requested-1",
    customerEmail: "customer.seed1@fixmate.dev",
    serviceSeedId: "seed-service-smartphone-1",
    phone: "+8801733333333",
    address: "Gulshan, Dhaka, Bangladesh - House 12, Road 5",
    preferredDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    problemDescription: "iPhone 14 Pro Max screen cracked after drop, touch not working in top right corner. Need OEM OLED replacement with True Tone.",
    status: "requested" as const,
    paymentStatus: "pending" as const,
  },
  {
    seedId: "seed-booking-requested-2",
    customerEmail: "customer.seed2@fixmate.dev",
    serviceSeedId: "seed-service-ac-1",
    phone: "+8801744444444",
    address: "Dhanmondi, Dhaka, Bangladesh - House 45, Road 2",
    preferredDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    problemDescription: "Daikin AC not cooling, gas pressure low shown on remote, need R32 refill and deep cleaning of coils.",
    status: "requested" as const,
    paymentStatus: "pending" as const,
  },
  // Accepted - 1 booking
  {
    seedId: "seed-booking-accepted-1",
    customerEmail: "customer.seed1@fixmate.dev",
    serviceSeedId: "seed-service-laptop-1",
    phone: "+8801733333333",
    address: "Gulshan, Dhaka - House 12",
    preferredDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
    problemDescription: "MacBook Pro 16 M2 not powering on after coffee spill, need logic board microsoldering and ultrasonic cleaning.",
    status: "accepted" as const,
    paymentStatus: "pending" as const,
  },
  // In-Progress - 1 booking
  {
    seedId: "seed-booking-inprogress-1",
    customerEmail: "customer.seed2@fixmate.dev",
    serviceSeedId: "seed-service-washing-1",
    phone: "+8801744444444",
    address: "Dhanmondi, Dhaka - House 45",
    preferredDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // yesterday, already started
    problemDescription: "LG washing machine making loud noise during spin, likely drum bearing failure, need bearing replacement.",
    status: "in-progress" as const,
    paymentStatus: "pending" as const,
  },
  // Completed with payment pending - 1 booking (for Pay Now testing)
  {
    seedId: "seed-booking-completed-pending-1",
    customerEmail: "customer.seed1@fixmate.dev",
    serviceSeedId: "seed-service-tv-1",
    phone: "+8801733333333",
    address: "Gulshan, Dhaka",
    preferredDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    problemDescription: "Sony TV no picture but sound working, backlight issue, need LED strip replacement.",
    status: "completed" as const,
    paymentStatus: "pending" as const,
    finalAmount: 300,
  },
  // Completed with payment paid - 1 booking (with payment record)
  {
    seedId: "seed-booking-completed-paid-1",
    customerEmail: "customer.seed2@fixmate.dev",
    serviceSeedId: "seed-service-refrigerator-2",
    phone: "+8801744444444",
    address: "Dhanmondi, Dhaka",
    preferredDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    problemDescription: "LG refrigerator not cooling properly, compressor making noise, need compressor repair and gas refill.",
    status: "completed" as const,
    paymentStatus: "paid" as const,
    finalAmount: 380,
  },
  // Rejected - 1 booking
  {
    seedId: "seed-booking-rejected-1",
    customerEmail: "customer.seed1@fixmate.dev",
    serviceSeedId: "seed-service-electrical-1",
    phone: "+8801733333333",
    address: "Gulshan, Dhaka",
    preferredDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    problemDescription: "Microwave not heating, need magnetron replacement check.",
    status: "rejected" as const,
    paymentStatus: "pending" as const,
  },
  // Cancelled - 1 booking
  {
    seedId: "seed-booking-cancelled-1",
    customerEmail: "customer.seed2@fixmate.dev",
    serviceSeedId: "seed-service-electrical-2",
    phone: "+8801744444444",
    address: "Dhanmondi, Dhaka",
    preferredDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    problemDescription: "RO water purifier filter replacement needed, but customer rescheduled.",
    status: "cancelled" as const,
    paymentStatus: "pending" as const,
  },
];

async function main() {
  console.log("🌱 Starting FixMate Development Seed Data...");
  console.log("   Safe, repeatable, preserves existing records, prevents duplicates via upsert");

  const { db } = await connectDB();
  await ensureIndexes(db);

  console.log("\n📊 Existing Data Before Seed:");
  const existingUsers = await db.collection(COLLECTIONS.USERS).countDocuments();
  const existingServices = await db.collection(COLLECTIONS.SERVICES).countDocuments();
  const existingBookings = await db.collection(COLLECTIONS.BOOKINGS).countDocuments();
  const existingPayments = await db.collection(COLLECTIONS.PAYMENTS).countDocuments();
  console.log(`   Users: ${existingUsers}, Services: ${existingServices}, Bookings: ${existingBookings}, Payments: ${existingPayments}`);

  // Default password for seeded users (hashed, not plaintext stored)
  const DEFAULT_PASSWORD = "Password123!";
  const hashedPassword = await hashPassword(DEFAULT_PASSWORD);
  console.log(`\n🔐 Default password for seeded users: ${DEFAULT_PASSWORD} (hashed, not stored plaintext)`);

  // 1. Seed Users - Upsert by email (unique index)
  console.log("\n👥 Seeding Users (2 technicians, 2 customers)...");
  let techniciansSeeded = 0;
  let customersSeeded = 0;
  const technicianIds: ObjectId[] = [];
  const customerIds: { id: ObjectId; email: string; name: string }[] = [];

  // First, get existing technicians and customers for reference
  const existingTechs = await db.collection(COLLECTIONS.USERS).find({ role: "technician" }).toArray();
  const existingCustomers = await db.collection(COLLECTIONS.USERS).find({ role: "customer" }).toArray();
  console.log(`   Existing technicians: ${existingTechs.length}, customers: ${existingCustomers.length}`);

  // Collect existing technician IDs for service assignment
  existingTechs.forEach((tech: any) => technicianIds.push(tech._id));

  for (const seedUser of SEED_USERS) {
    const now = new Date();
    const existing = await db.collection(COLLECTIONS.USERS).findOne({ email: seedUser.email } as any);

    let userId: ObjectId;
    if (existing) {
      console.log(`   ⏭️  User ${seedUser.email} already exists (${existing._id}) - skipping creation, updating profile`);
      userId = existing._id;
      // Update profile but preserve role if already exists (don't downgrade)
      await db.collection(COLLECTIONS.USERS).updateOne(
        { email: seedUser.email } as any,
        {
          $set: {
            name: seedUser.name,
            phone: seedUser.phone,
            address: seedUser.address,
            bio: seedUser.bio,
            profileImage: seedUser.profileImage,
            image: seedUser.profileImage,
            updatedAt: now,
          },
          $setOnInsert: {
            emailVerified: false,
            createdAt: now,
          },
        }
      );
    } else {
      // Create new user with deterministic _id? Use new ObjectId for new users
      userId = new ObjectId();
      const userDoc = {
        _id: userId,
        name: seedUser.name,
        email: seedUser.email,
        role: seedUser.role,
        phone: seedUser.phone,
        address: seedUser.address,
        bio: seedUser.bio,
        profileImage: seedUser.profileImage,
        image: seedUser.profileImage,
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      };

      try {
        await db.collection(COLLECTIONS.USERS).insertOne(userDoc as any);
        console.log(`   ✅ Created user ${seedUser.email} (${seedUser.role}) with ID ${userId}`);

        // Create corresponding account with hashed password
        const accountId = new ObjectId();
        const accountDoc = {
          _id: accountId,
          accountId: userId.toString(),
          providerId: "credential",
          userId: userId,
          password: hashedPassword,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        };

        try {
          await db.collection(COLLECTIONS.ACCOUNTS).insertOne(accountDoc as any);
          console.log(`      ✅ Created account for ${seedUser.email} with hashed password`);
        } catch (accErr: any) {
          if (accErr.code === 11000) {
            console.log(`      ⏭️  Account for ${seedUser.email} already exists - skipping`);
          } else {
            throw accErr;
          }
        }

        if (seedUser.role === "technician") techniciansSeeded++;
        if (seedUser.role === "customer") customersSeeded++;
      } catch (err: any) {
        if (err.code === 11000) {
          console.log(`   ⏭️  User ${seedUser.email} already exists (duplicate email) - skipping`);
          // Try to get the existing user ID
          const existingUser = await db.collection(COLLECTIONS.USERS).findOne({ email: seedUser.email } as any);
          if (existingUser) {
            userId = existingUser._id;
          }
        } else {
          throw err;
        }
      }
    }

    // Collect IDs
    if (seedUser.role === "technician") {
      if (!technicianIds.some((id) => id.toString() === userId.toString())) {
        technicianIds.push(userId);
      }
    }
    if (seedUser.role === "customer") {
      if (!customerIds.some((c) => c.id.toString() === userId.toString())) {
        customerIds.push({ id: userId, email: seedUser.email, name: seedUser.name });
      }
    }
  }

  // Also add existing customers to customerIds list for booking assignment
  for (const cust of existingCustomers) {
    if (!customerIds.some((c) => c.id.toString() === cust._id.toString())) {
      customerIds.push({ id: cust._id, email: cust.email, name: cust.name });
    }
  }

  console.log(`   Seeded technicians: ${techniciansSeeded} new, total technicians in DB will be >= ${technicianIds.length}`);
  console.log(`   Seeded customers: ${customersSeeded} new, total customers in DB will be >= ${customerIds.length}`);

  // 2. Seed Services - Upsert by seedId or title+technicianId to prevent duplicates
  console.log("\n🔧 Seeding Services (12+ approved and available across 7 categories)...");
  let servicesSeeded = 0;
  const serviceMap = new Map<string, ObjectId>(); // seedId -> ObjectId

  // Get existing services count
  const existingServicesByTitle = await db.collection(COLLECTIONS.SERVICES).find({}).project({ title: 1, technicianId: 1 }).toArray();
  const existingServiceTitles = new Set(existingServicesByTitle.map((s: any) => `${s.title}-${s.technicianId}`));

  for (let i = 0; i < SEED_SERVICES.length; i++) {
    const seedService = SEED_SERVICES[i];
    // Assign technician in round-robin fashion from available technicians
    const techId = technicianIds[i % technicianIds.length];
    if (!techId) {
      console.warn(`   ⚠️ No technician available for service ${seedService.title} - skipping`);
      continue;
    }

    const now = new Date();
    const existing = await db.collection(COLLECTIONS.SERVICES).findOne({
      $or: [
        { seedId: seedService.seedId } as any,
        { title: seedService.title, technicianId: techId } as any,
      ],
    } as any);

    let serviceId: ObjectId;
    if (existing) {
      console.log(`   ⏭️  Service ${seedService.title} already exists (${existing._id}) - updating to approved and available`);
      serviceId = existing._id;
      await db.collection(COLLECTIONS.SERVICES).updateOne(
        { _id: existing._id } as any,
        {
          $set: {
            title: seedService.title,
            category: seedService.category,
            description: seedService.description,
            basePrice: seedService.basePrice,
            estimatedDuration: seedService.estimatedDuration,
            serviceMode: seedService.serviceMode,
            serviceArea: seedService.serviceArea,
            image: seedService.image,
            images: [seedService.image],
            approvalStatus: "approved" as const, // Must be approved and available per requirements
            isAvailable: true,
            technicianId: techId,
            updatedAt: now,
            seedId: seedService.seedId,
          },
          $setOnInsert: {
            createdAt: now,
          },
        }
      );
    } else {
      serviceId = new ObjectId();
      const serviceDoc = {
        _id: serviceId,
        technicianId: techId,
        title: seedService.title,
        category: seedService.category,
        description: seedService.description,
        basePrice: seedService.basePrice,
        estimatedDuration: seedService.estimatedDuration,
        serviceMode: seedService.serviceMode,
        serviceArea: seedService.serviceArea,
        image: seedService.image,
        images: [seedService.image],
        approvalStatus: "approved" as const,
        isAvailable: true,
        createdAt: now,
        updatedAt: now,
        seedId: seedService.seedId, // For idempotency
      };

      try {
        await db.collection(COLLECTIONS.SERVICES).insertOne(serviceDoc as any);
        console.log(`   ✅ Created service ${seedService.title} (${seedService.category}) with ID ${serviceId} for technician ${techId}`);
        servicesSeeded++;
      } catch (err: any) {
        if (err.code === 11000) {
          console.log(`   ⏭️  Service ${seedService.title} already exists (duplicate) - skipping`);
          // Try to get existing ID
          const existingService = await db.collection(COLLECTIONS.SERVICES).findOne({ title: seedService.title, technicianId: techId } as any);
          if (existingService) {
            serviceId = existingService._id;
          } else {
            continue;
          }
        } else {
          throw err;
        }
      }
    }

    serviceMap.set(seedService.seedId, serviceId);
  }

  // Also include existing service (Samsung Refrigerator) in map for bookings
  const existingService = await db.collection(COLLECTIONS.SERVICES).findOne({ title: /Samsung Refrigerator/ } as any);
  if (existingService) {
    serviceMap.set("existing-service-1", existingService._id);
  }

  console.log(`   Seeded services: ${servicesSeeded} new, total approved and available will be >= 12`);

  // 3. Seed Bookings - Upsert by seedId to prevent duplicates, with different statuses
  console.log("\n📅 Seeding Bookings with different statuses (requested, accepted, in-progress, completed, rejected, cancelled)...");
  let bookingsSeeded = 0;
  const bookingMap = new Map<string, ObjectId>();

  for (const seedBooking of SEED_BOOKINGS) {
    // Find customer by email
    const customer = customerIds.find((c) => c.email === seedBooking.customerEmail) || customerIds[0];
    if (!customer) {
      console.warn(`   ⚠️ No customer found for booking ${seedBooking.seedId} - skipping`);
      continue;
    }

    // Find service by seedId
    const serviceId = serviceMap.get(seedBooking.serviceSeedId);
    if (!serviceId) {
      console.warn(`   ⚠️ No service found for seedId ${seedBooking.serviceSeedId} for booking ${seedBooking.seedId} - skipping`);
      continue;
    }

    // Get service to get technicianId and basePrice
    const service = await db.collection(COLLECTIONS.SERVICES).findOne({ _id: serviceId } as any);
    if (!service) {
      console.warn(`   ⚠️ Service ${serviceId} not found for booking ${seedBooking.seedId} - skipping`);
      continue;
    }

    const now = new Date();
    const existing = await db.collection(COLLECTIONS.BOOKINGS).findOne({ seedId: seedBooking.seedId } as any);

    let bookingId: ObjectId;
    if (existing) {
      console.log(`   ⏭️  Booking ${seedBooking.seedId} already exists (${existing._id}) - updating status to ${seedBooking.status}`);
      bookingId = existing._id;
      await db.collection(COLLECTIONS.BOOKINGS).updateOne(
        { _id: existing._id } as any,
        {
          $set: {
            customerId: customer.id,
            technicianId: service.technicianId,
            serviceId: serviceId,
            customerName: customer.name,
            customerEmail: customer.email,
            phone: seedBooking.phone,
            address: seedBooking.address,
            preferredDate: seedBooking.preferredDate,
            problemDescription: seedBooking.problemDescription,
            status: seedBooking.status as any,
            basePrice: service.basePrice,
            finalAmount: (seedBooking as any).finalAmount || undefined,
            paymentStatus: seedBooking.paymentStatus as any,
            updatedAt: now,
            seedId: seedBooking.seedId,
          },
          $setOnInsert: {
            createdAt: now,
          },
        }
      );
    } else {
      bookingId = new ObjectId();
      const bookingDoc = {
        _id: bookingId,
        customerId: customer.id,
        technicianId: service.technicianId,
        serviceId: serviceId,
        customerName: customer.name,
        customerEmail: customer.email,
        phone: seedBooking.phone,
        address: seedBooking.address,
        preferredDate: seedBooking.preferredDate,
        problemDescription: seedBooking.problemDescription,
        status: seedBooking.status as any,
        basePrice: service.basePrice,
        finalAmount: (seedBooking as any).finalAmount || undefined,
        paymentStatus: seedBooking.paymentStatus as any,
        createdAt: now,
        updatedAt: now,
        seedId: seedBooking.seedId,
      };

      try {
        await db.collection(COLLECTIONS.BOOKINGS).insertOne(bookingDoc as any);
        console.log(`   ✅ Created booking ${seedBooking.seedId} (${seedBooking.status}) for customer ${customer.email} with service ${service.title} - ID ${bookingId}`);
        bookingsSeeded++;
      } catch (err: any) {
        if (err.code === 11000) {
          console.log(`   ⏭️  Booking ${seedBooking.seedId} already exists (duplicate) - skipping`);
          continue;
        } else {
          throw err;
        }
      }
    }

    bookingMap.set(seedBooking.seedId, bookingId);
  }

  console.log(`   Seeded bookings: ${bookingsSeeded} new`);

  // 4. Seed Payments - Only for completed bookings with paymentStatus paid/pending consistent
  console.log("\n💳 Seeding Payments (only for completed bookings, consistent with payment rules)...");
  let paymentsSeeded = 0;

  for (const seedBooking of SEED_BOOKINGS) {
    if (seedBooking.status !== "completed") continue; // Only create payments for completed bookings

    const bookingId = bookingMap.get(seedBooking.seedId);
    if (!bookingId) {
      // Try to find existing booking by seedId
      const existingBooking = await db.collection(COLLECTIONS.BOOKINGS).findOne({ seedId: seedBooking.seedId } as any);
      if (!existingBooking) continue;
      // Use existing booking ID
      const bId = existingBooking._id;
      // Check if payment already exists for this booking
      const existingPayment = await db.collection(COLLECTIONS.PAYMENTS).findOne({ bookingId: bId } as any);
      if (existingPayment) {
        console.log(`   ⏭️  Payment for booking ${seedBooking.seedId} already exists (${existingPayment._id}) - skipping`);
        continue;
      }

      // Only create payment if booking is completed and paymentStatus is paid (or pending for Pay Now testing)
      // For completed with paymentStatus paid, create paid payment
      // For completed with paymentStatus pending, create pending payment (for Pay Now testing)
      if (seedBooking.paymentStatus === "paid" || seedBooking.paymentStatus === "pending") {
        const booking = existingBooking as any;
        const amount = booking.finalAmount || booking.basePrice;
        const now = new Date();
        const paymentId = new ObjectId();
        const sessionId = `seed_mock_${paymentId.toString()}_${Date.now()}`;
        const isPaid = seedBooking.paymentStatus === "paid";

        const paymentDoc = {
          _id: paymentId,
          bookingId: bId,
          customerId: booking.customerId,
          technicianId: booking.technicianId,
          amount: amount,
          currency: "usd",
          paymentProvider: "stripe" as const,
          sessionId: sessionId,
          transactionId: isPaid ? `seed_mock_txn_${Date.now()}_${paymentId.toString().slice(-6)}` : undefined,
          paymentStatus: seedBooking.paymentStatus as any,
          paidAt: isPaid ? now : undefined,
          createdAt: now,
          seedId: `${seedBooking.seedId}-payment`,
        };

        try {
          await db.collection(COLLECTIONS.PAYMENTS).insertOne(paymentDoc as any);
          console.log(`   ✅ Created payment for booking ${seedBooking.seedId} (${seedBooking.paymentStatus}) amount $${amount} - ID ${paymentId}`);
          paymentsSeeded++;
        } catch (err: any) {
          if (err.code === 11000) {
            console.log(`   ⏭️  Payment for booking ${seedBooking.seedId} already exists (duplicate bookingId) - skipping`);
          } else {
            throw err;
          }
        }
      }
    } else {
      // New booking case - we have bookingId from map
      const booking = await db.collection(COLLECTIONS.BOOKINGS).findOne({ _id: bookingId } as any);
      if (!booking) continue;

      const existingPayment = await db.collection(COLLECTIONS.PAYMENTS).findOne({ bookingId: bookingId } as any);
      if (existingPayment) {
        console.log(`   ⏭️  Payment for booking ${seedBooking.seedId} already exists (${existingPayment._id}) - skipping`);
        continue;
      }

      if (seedBooking.paymentStatus === "paid" || seedBooking.paymentStatus === "pending") {
        const amount = (booking as any).finalAmount || (booking as any).basePrice;
        const now = new Date();
        const paymentId = new ObjectId();
        const sessionId = `seed_mock_${paymentId.toString()}_${Date.now()}`;
        const isPaid = seedBooking.paymentStatus === "paid";

        const paymentDoc = {
          _id: paymentId,
          bookingId: bookingId,
          customerId: (booking as any).customerId,
          technicianId: (booking as any).technicianId,
          amount: amount,
          currency: "usd",
          paymentProvider: "stripe" as const,
          sessionId: sessionId,
          transactionId: isPaid ? `seed_mock_txn_${Date.now()}_${paymentId.toString().slice(-6)}` : undefined,
          paymentStatus: seedBooking.paymentStatus as any,
          paidAt: isPaid ? now : undefined,
          createdAt: now,
          seedId: `${seedBooking.seedId}-payment`,
        };

        try {
          await db.collection(COLLECTIONS.PAYMENTS).insertOne(paymentDoc as any);
          console.log(`   ✅ Created payment for booking ${seedBooking.seedId} (${seedBooking.paymentStatus}) amount $${amount} - ID ${paymentId}`);
          paymentsSeeded++;
        } catch (err: any) {
          if (err.code === 11000) {
            console.log(`   ⏭️  Payment for booking ${seedBooking.seedId} already exists - skipping`);
          } else {
            throw err;
          }
        }
      }
    }
  }

  console.log(`   Seeded payments: ${paymentsSeeded} new`);

  // 5. Final counts and integrity verification
  console.log("\n📊 Final Data After Seed:");
  const finalUsers = await db.collection(COLLECTIONS.USERS).countDocuments();
  const finalTechs = await db.collection(COLLECTIONS.USERS).countDocuments({ role: "technician" } as any);
  const finalCustomers = await db.collection(COLLECTIONS.USERS).countDocuments({ role: "customer" } as any);
  const finalAdmins = await db.collection(COLLECTIONS.USERS).countDocuments({ role: "admin" } as any);
  const finalServices = await db.collection(COLLECTIONS.SERVICES).countDocuments();
  const finalApprovedServices = await db.collection(COLLECTIONS.SERVICES).countDocuments({ approvalStatus: "approved", isAvailable: true } as any);
  const finalBookings = await db.collection(COLLECTIONS.BOOKINGS).countDocuments();
  const finalPayments = await db.collection(COLLECTIONS.PAYMENTS).countDocuments();

  console.log(`   Users: ${finalUsers} (Technicians: ${finalTechs}, Customers: ${finalCustomers}, Admins: ${finalAdmins})`);
  console.log(`   Services: ${finalServices} (Approved & Available: ${finalApprovedServices})`);
  console.log(`   Bookings: ${finalBookings}`);
  console.log(`   Payments: ${finalPayments}`);

  // Verify services have valid technician ownership
  console.log("\n🔍 Integrity Verification:");
  const servicesWithInvalidTech = await db.collection(COLLECTIONS.SERVICES).aggregate([
    {
      $lookup: {
        from: COLLECTIONS.USERS,
        localField: "technicianId",
        foreignField: "_id",
        as: "technician",
      },
    },
    {
      $match: {
        technician: { $size: 0 },
      },
    },
  ]).toArray();

  if (servicesWithInvalidTech.length === 0) {
    console.log("   ✅ All services have valid technician ownership");
  } else {
    console.warn(`   ⚠️ Found ${servicesWithInvalidTech.length} services with invalid technician ownership:`, servicesWithInvalidTech.map((s: any) => s.title));
  }

  // Verify bookings reference valid customers and services
  const bookingsWithInvalidCustomer = await db.collection(COLLECTIONS.BOOKINGS).aggregate([
    {
      $lookup: {
        from: COLLECTIONS.USERS,
        localField: "customerId",
        foreignField: "_id",
        as: "customer",
      },
    },
    {
      $match: {
        customer: { $size: 0 },
      },
    },
  ]).toArray();

  const bookingsWithInvalidService = await db.collection(COLLECTIONS.BOOKINGS).aggregate([
    {
      $lookup: {
        from: COLLECTIONS.SERVICES,
        localField: "serviceId",
        foreignField: "_id",
        as: "service",
      },
    },
    {
      $match: {
        service: { $size: 0 },
      },
    },
  ]).toArray();

  if (bookingsWithInvalidCustomer.length === 0) {
    console.log("   ✅ All bookings reference valid customers");
  } else {
    console.warn(`   ⚠️ Found ${bookingsWithInvalidCustomer.length} bookings with invalid customer reference`);
  }

  if (bookingsWithInvalidService.length === 0) {
    console.log("   ✅ All bookings reference valid services");
  } else {
    console.warn(`   ⚠️ Found ${bookingsWithInvalidService.length} bookings with invalid service reference`);
  }

  // Verify bookings by status
  const bookingsByStatus = await db.collection(COLLECTIONS.BOOKINGS).aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]).toArray();

  console.log("\n   Bookings by status:");
  bookingsByStatus.forEach((item: any) => {
    console.log(`      ${item._id}: ${item.count}`);
  });

  // Verify payments consistency
  const paymentsByStatus = await db.collection(COLLECTIONS.PAYMENTS).aggregate([
    {
      $group: {
        _id: "$paymentStatus",
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
      },
    },
  ]).toArray();

  console.log("\n   Payments by status:");
  paymentsByStatus.forEach((item: any) => {
    console.log(`      ${item._id}: ${item.count} (total $${item.totalAmount})`);
  });

  // Check for inconsistent payments (payment for non-completed booking)
  const inconsistentPayments = await db.collection(COLLECTIONS.PAYMENTS).aggregate([
    {
      $lookup: {
        from: COLLECTIONS.BOOKINGS,
        localField: "bookingId",
        foreignField: "_id",
        as: "booking",
      },
    },
    {
      $unwind: "$booking",
    },
    {
      $match: {
        "booking.status": { $ne: "completed" },
        paymentStatus: "paid",
      },
    },
  ]).toArray();

  if (inconsistentPayments.length === 0) {
    console.log("   ✅ No inconsistent payments (paid payments only for completed bookings)");
  } else {
    console.warn(`   ⚠️ Found ${inconsistentPayments.length} inconsistent payments (paid but booking not completed)`);
  }

  console.log("\n🎉 Seed completed successfully!");
  console.log("   Safe to run again - duplicate prevention via upsert by email/title/seedId");
  console.log("   Existing records preserved, no deletions");
  console.log(`   Default password for seeded users: ${DEFAULT_PASSWORD} (hashed with BetterAuth scrypt)`);
}

main()
  .then(() => {
    console.log("\n✅ Seed script finished");
    return closeDB();
  })
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    console.error(err.stack);
    closeDB().then(() => process.exit(1));
  });

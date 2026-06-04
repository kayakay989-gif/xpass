import { adminProcedure } from "../../../create-context";
import { z } from "zod";
import { firestoreGyms, firestoreGymOwners } from "@/backend/lib/firestore-admin";
import { Gym, GymCategory, SubscriptionTier, GymOwner } from "@/types";
import { randomUUID } from "crypto";
import { hashPassword } from "@/backend/lib/password";
import {
  buildGymOwnerDefaultPassword,
  buildGymOwnerUsername,
  normalizeGymOwnerUsername,
} from "@/lib/gym-owner-username";

export default adminProcedure
  .input(z.object({
    name: z.string(),
    address: z.string(),
    city: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    category: z.enum(['standard', 'premium', 'diamond', 'elite']),
    amenities: z.array(z.string()).optional(),
    hours: z.string().optional(),
    imageUrl: z.string().optional(),
    allowedTiers: z.array(z.enum(['silver', 'gold', 'diamond', 'elite'])).optional(),
    email: z.string().optional(),
    ownerName: z.string().optional(),
  }))
  .mutation(async ({ input }) => {
    // Generate unique ID for the gym
    const gymId = randomUUID();
    
    // Set default values
    const defaultAllowedTiers: SubscriptionTier[] = 
      input.category === 'elite' ? ['elite'] :
      input.category === 'diamond' ? ['diamond', 'elite'] :
      input.category === 'premium' ? ['gold', 'diamond', 'elite'] :
      ['silver', 'gold', 'diamond', 'elite'];
    
    const newGym: Gym = {
      id: gymId,
      name: input.name,
      address: input.address,
      city: input.city,
      latitude: input.latitude,
      longitude: input.longitude,
      category: input.category as GymCategory,
      amenities: input.amenities || [],
      hours: input.hours || '6:00 AM - 10:00 PM',
      imageUrl: input.imageUrl || 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800',
      allowedTiers: input.allowedTiers || defaultAllowedTiers,
    };
    
    // Save to Firestore
    await firestoreGyms.create(newGym);
    
    const username = buildGymOwnerUsername(gymId, input.name);
    const defaultPassword = buildGymOwnerDefaultPassword(gymId);

    const gymOwner: GymOwner = {
      id: randomUUID(),
      gymId: gymId,
      username,
      usernameNormalized: normalizeGymOwnerUsername(username),
      passwordHash: hashPassword(defaultPassword),
      email: input.email || undefined,
      name: input.ownerName || input.name + ' Owner',
      createdAt: new Date(),
    };
    
    await firestoreGymOwners.create(gymOwner);
    
    return {
      ...newGym,
      ownerCredentials: {
        username,
        password: defaultPassword,
      },
    };
  });

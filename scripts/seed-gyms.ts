/**
 * Seed script to populate Firestore with sample gyms
 * Run with: bun run seed-gyms
 * or: bun scripts/seed-gyms.ts
 */

import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, doc, getDocs, setDoc, serverTimestamp } from 'firebase/firestore';
import { MOCK_GYMS } from '../mocks/gyms';
import { Gym } from '../types';

// Firebase configuration (env-driven)
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY || "REPLACE_ME",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || "REPLACE_ME",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "REPLACE_ME",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET || "REPLACE_ME",
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID || "REPLACE_ME",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID || "REPLACE_ME",
};

async function seedGyms() {
  try {
    console.log('🌱 Starting gym seeding process...');
    
    // Initialize Firebase if not already initialized
    let app;
    const existingApps = getApps();
    if (existingApps.length > 0) {
      app = existingApps[0];
      console.log('✅ Using existing Firebase app');
    } else {
      app = initializeApp(firebaseConfig);
      console.log('✅ Initialized Firebase app');
    }

    // Get Firestore instance
    const db = getFirestore(app);
    console.log('✅ Connected to Firestore');

    // Check existing gyms
    const gymsCollection = collection(db, 'gyms');
    const existingSnapshot = await getDocs(gymsCollection);
    const existingGyms = existingSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Gym[];
    
    console.log(`📊 Found ${existingGyms.length} existing gyms in Firestore`);

    // Seed gyms
    let added = 0;
    let skipped = 0;
    let errors = 0;

    for (const gym of MOCK_GYMS) {
      // Check if gym already exists
      const existingGym = existingGyms.find(g => g.id === gym.id);
      
      if (existingGym) {
        console.log(`⏭️  Skipping ${gym.name} (already exists)`);
        skipped++;
      } else {
        try {
          await setDoc(doc(db, 'gyms', gym.id), {
            ...gym,
            createdAt: serverTimestamp(),
          });
          console.log(`✅ Added ${gym.name}`);
          added++;
        } catch (error: any) {
          console.error(`❌ Error adding ${gym.name}:`, error.message);
          errors++;
        }
      }
    }

    console.log('\n📈 Seeding Summary:');
    console.log(`   ✅ Added: ${added}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    if (errors > 0) {
      console.log(`   ❌ Errors: ${errors}`);
    }
    console.log(`   📊 Total: ${MOCK_GYMS.length}`);
    console.log('\n🎉 Seeding completed successfully!');
    
    // Get final count
    const finalSnapshot = await getDocs(gymsCollection);
    console.log(`\n📊 Total gyms in Firestore: ${finalSnapshot.size}`);
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error seeding gyms:', error);
    process.exit(1);
  }
}

// Run the seed function
seedGyms();


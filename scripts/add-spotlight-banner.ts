/**
 * Script to add the Gold's Gym spotlight banner
 * Run with: npx tsx scripts/add-spotlight-banner.ts
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { randomUUID } from 'crypto';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyB5Sa5PqdEWbUPI-tyBLyywcLM6DbmTkDc",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "xpass-rork-1e6ad.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "xpass-rork-1e6ad",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "xpass-rork-1e6ad.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "40764236173",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:40764236173:web:your-app-id",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function addGoldsGymBanner() {
  try {
    // Check if banner already exists
    const bannersRef = collection(db, 'spotlightBanners');
    const q = query(bannersRef, where('title', '==', 'Gold\'s Gym'));
    const existing = await getDocs(q);
    
    if (!existing.empty) {
      console.log('Gold\'s Gym banner already exists');
      return;
    }

    // Add the Gold's Gym banner
    // NOTE: You need to upload the Gold's Gym banner image and update the imageUrl below
    const bannerId = randomUUID();
    const banner = {
      id: bannerId,
      imageUrl: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/golds-gym-spotlight-banner', // TODO: Upload the actual Gold's Gym banner image and update this URL
      title: 'ELITE',
      linkUrl: '', // Optional: add link URL if needed (e.g., external website or internal route)
      isActive: true,
      order: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, 'spotlightBanners', bannerId), banner);
    console.log('Gold\'s Gym banner added successfully!');
  } catch (error) {
    console.error('Error adding banner:', error);
  }
}

addGoldsGymBanner();

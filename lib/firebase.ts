import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
	apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBrMX64__snkPKZ57MMfac169vgN-yf5gU",
	authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "protrack-f6ca4.firebaseapp.com",
	projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "protrack-f6ca4",
	storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "protrack-f6ca4.firebasestorage.app",
	messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "816264038583",
	appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:816264038583:web:2cb1317f8c85631fcbe532",
};
const isConfigured = Object.values(firebaseConfig).every(Boolean);
export const firebaseConfigured = isConfigured;
export const app = isConfigured ? (getApps().length ? getApp() : initializeApp(firebaseConfig)) : null;
export const db = app ? getFirestore(app) : null;
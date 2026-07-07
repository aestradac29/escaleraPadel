import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Production Firebase Configuration provided by user
const prodConfig = {
  apiKey: "AIzaSyDvttaNfcpMIyLAxNKBWo5NgbnDeHaSB4M",
  authDomain: "escalera-padel-pro.firebaseapp.com",
  projectId: "escalera-padel-pro",
  storageBucket: "escalera-padel-pro.firebasestorage.app",
  messagingSenderId: "458024789436",
  appId: "1:458024789436:web:3c9c7aa25478b8b23f77b9",
  measurementId: "G-B02P2FFD31",
  firestoreDatabaseId: ""
};

// Check if running in production (either built for production, or hosted on production domains)
const isProduction = !!(
  (import.meta as any).env?.PROD || (
    typeof window !== 'undefined' && 
    window.location.hostname !== 'localhost' && 
    window.location.hostname !== '127.0.0.1' && 
    (window.location.hostname.includes('ais-pre-') || !window.location.hostname.includes('run.app'))
  )
);

// Choose config dynamically
const activeConfig = isProduction ? prodConfig : firebaseConfig;

export const dbName = activeConfig.projectId;
export const isProdDb = isProduction;

// Initialize Firebase App
const app = initializeApp(activeConfig);

// Initialize Firestore with custom Database ID if present (not empty or default)
export const db = activeConfig.firestoreDatabaseId && activeConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, activeConfig.firestoreDatabaseId)
  : getFirestore(app);

// Initialize Authentication
export const auth = getAuth(app);

// Authentication Provider
export const googleProvider = new GoogleAuthProvider();

// Error Handler conformant to FirestoreErrorInfo spec in SKILL.md
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Simple test correlation function to prove database connectivity
export async function testConnection() {
  try {
    const { doc, getDocFromServer } = await import('firebase/firestore');
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

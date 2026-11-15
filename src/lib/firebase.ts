import { FirebaseApp, initializeApp } from 'firebase/app';
import {
  Auth,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { doc, Firestore, getDocFromServer, getFirestore } from 'firebase/firestore';

interface FirebaseClientConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  firestoreDatabaseId?: string;
}

const localConfigModules = import.meta.glob('/firebase-applet-config.json', {
  eager: true,
}) as Record<string, { default?: FirebaseClientConfig } | FirebaseClientConfig>;

const rawLocalModule = localConfigModules['/firebase-applet-config.json'];
const localFileConfig: FirebaseClientConfig =
  rawLocalModule && 'default' in rawLocalModule && rawLocalModule.default
    ? rawLocalModule.default
    : (rawLocalModule as FirebaseClientConfig) || {};

const firebaseConfig: FirebaseClientConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string) || localFileConfig.apiKey || '',
  authDomain:
    (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string) || localFileConfig.authDomain || '',
  projectId:
    (import.meta.env.VITE_FIREBASE_PROJECT_ID as string) || localFileConfig.projectId || '',
  storageBucket:
    (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string) || localFileConfig.storageBucket || '',
  messagingSenderId:
    (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string) ||
    localFileConfig.messagingSenderId ||
    '',
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string) || localFileConfig.appId || '',
  firestoreDatabaseId:
    (import.meta.env.VITE_FIREBASE_DATABASE_ID as string) ||
    localFileConfig.firestoreDatabaseId ||
    '',
};

export const isFirebaseConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/gmail.send',
] as const;

let app: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  const databaseId =
    firebaseConfig.firestoreDatabaseId || 'ai-studio-e247321c-cae3-405c-a8b6-8a1c6e82f52f';
  firestoreInstance = getFirestore(app, databaseId);
  authInstance = getAuth(app);
}

export const db = firestoreInstance as Firestore;
export const auth = authInstance as Auth;

const provider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({ prompt: 'select_account' });

let isSigningIn = false;
// Strictly in-memory OAuth token cache (never localStorage or sessionStorage)
let cachedAccessToken: string | null = null;

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
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const currentUser = authInstance?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<boolean> {
  if (!firestoreInstance) return false;
  try {
    await getDocFromServer(doc(firestoreInstance, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Firestore offline — check Firebase configuration.');
      return false;
    }
    return true;
  }
}

export function initAuth(
  onAuthChange: (user: User | null, accessToken: string | null) => void
) {
  if (!authInstance) {
    onAuthChange(null, null);
    return () => {};
  }
  return onAuthStateChanged(authInstance, (user) => {
    if (!user) {
      cachedAccessToken = null;
      onAuthChange(null, null);
    } else if (!isSigningIn) {
      onAuthChange(user, cachedAccessToken);
    }
  });
}

export async function googleSignIn(): Promise<{
  user: User;
  accessToken: string | null;
}> {
  if (!authInstance) {
    throw new Error('Firebase authentication is not configured in this environment.');
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(authInstance, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken ?? null;
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export async function getWorkspaceAccessToken(): Promise<string | null> {
  return cachedAccessToken;
}

export async function googleSignOut(): Promise<void> {
  cachedAccessToken = null;
  if (authInstance) {
    await signOut(authInstance);
  }
}

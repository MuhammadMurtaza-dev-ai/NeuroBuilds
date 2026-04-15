// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  signInWithPopup,
  GoogleAuthProvider,
  updateProfile
} from "firebase/auth";
import type { UserCredential, User } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCsBcgqaDwWRuilTuG6kfnSXcQcACxJC14",
  authDomain: "neurobuilds-dea37.firebaseapp.com",
  projectId: "neurobuilds-dea37",
  storageBucket: "neurobuilds-dea37.firebasestorage.app",
  messagingSenderId: "946745015004",
  appId: "1:946745015004:web:288fe48c4f7e35fea7d219"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication
export const auth = getAuth(app);

// Firebase Auth Methods
export const firebaseAuth = {
  register: (email: string, password: string) => 
    createUserWithEmailAndPassword(auth, email, password),
  
  login: (email: string, password: string) => 
    signInWithEmailAndPassword(auth, email, password),
  
  googleSignIn: async () => {
    const provider = new GoogleAuthProvider();
    return signInWithPopup(auth, provider);
  },
  
  logout: () => signOut(auth),
  
  updateUserProfile: (user: User, displayName: string, photoURL?: string) => 
    updateProfile(user, { displayName, photoURL }),
  
  getCurrentUser: () => auth.currentUser,
  
  onAuthStateChange: (callback: (user: User | null) => void) => 
    auth.onAuthStateChanged(callback)
};

export type { UserCredential };
export default app;
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { AppState } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  userState: AppState | null;
  refreshUserState: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  userState: null,
  refreshUserState: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userState, setUserState] = useState<AppState | null>(null);

  const fetchUserState = async (uid: string) => {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      setUserState(userDoc.data() as AppState);
    } else {
      setUserState(null);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        try {
          await fetchUserState(user.uid);
        } catch (err) {
          console.error("Failed to fetch user state:", err);
          setUserState(null);
        }
      } else {
        setUserState(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const refreshUserState = async () => {
    if (user) {
      await fetchUserState(user.uid);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, userState, refreshUserState }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { isAdminEmail, normalizeRole } from '../utils/roles';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  signInWithPopup,
} from 'firebase/auth';
import { auth, googleProvider, githubProvider } from '../config/firebase';

const AuthContext = createContext(null);

const AUTH_USERS_STORAGE_KEY = 'cm-auth-users';
const AUTH_SESSION_STORAGE_KEY = 'cm-auth-session';
const ADMIN_SETTINGS_STORAGE_KEY = 'cm-admin-settings';
const PASSWORD_RESETS_STORAGE_KEY = 'cm-auth-password-resets';
const AUTH_SYNC_STORAGE_KEY = 'cm-auth-sync';

const DEFAULT_PROFILE = {
  role: 'learner',
  totalPoints: 0,
  streak: 0,
  problemsSolved: 0,
  bio: '',
  organization: '',
  availability: '',
  title: '',
  company: '',
  location: '',
  avatar: 'https://api.dicebear.com/7.x/thumbs/svg?seed=CodeMastery',
  preferences: {
    emailNotifications: true,
    theme: 'light',
  },
  security: {
    rememberMe: true,
    lastPasswordChangedAt: null,
    lastLoginAt: null,
  },
  bookmarkedProblems: [],
  learningProgress: {
    solvedProblems: {},
    assessmentHistory: {},
  },
  adminSettings: {
    managedUsers: [],
    metrics: {
      problemsCreated: 0,
      contestsCreated: 0,
      testcasesDesigned: 0,
      questionsAdded: 0,
    },
    contestActivity: [],
  },
};

const REVIEW_INTERVALS_DAYS = [3, 7, 14, 30];

const readJsonFromStorage = (storage, storageKey, fallback) => {
  try {
    const raw = storage.getItem(storageKey);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const writeJsonToStorage = (storage, storageKey, value) => {
  try {
    if (value == null) {
      storage.removeItem(storageKey);
      return;
    }

    storage.setItem(storageKey, JSON.stringify(value));
  } catch {}
};

const readJson = (storageKey, fallback) => readJsonFromStorage(localStorage, storageKey, fallback);
const writeJson = (storageKey, value) => writeJsonToStorage(localStorage, storageKey, value);

const readUsers = () => readJson(AUTH_USERS_STORAGE_KEY, []);
const writeUsers = (users) => writeJson(AUTH_USERS_STORAGE_KEY, users);

const readPasswordResets = () => readJson(PASSWORD_RESETS_STORAGE_KEY, []);
const writePasswordResets = (requests) => writeJson(PASSWORD_RESETS_STORAGE_KEY, requests);

const broadcastAuthEvent = (payload) => {
  try {
    localStorage.setItem(
      AUTH_SYNC_STORAGE_KEY,
      JSON.stringify({
        ...payload,
        at: new Date().toISOString(),
      })
    );
  } catch {}
};

const readStoredSession = () => {
  const persistentSession = readJsonFromStorage(localStorage, AUTH_SESSION_STORAGE_KEY, null);
  if (persistentSession) {
    return {
      session: persistentSession,
      rememberMe: true,
    };
  }

  const temporarySession = readJsonFromStorage(sessionStorage, AUTH_SESSION_STORAGE_KEY, null);
  if (temporarySession) {
    return {
      session: temporarySession,
      rememberMe: false,
    };
  }

  return {
    session: null,
    rememberMe: true,
  };
};

const writeStoredSession = (session, rememberMe = true, broadcast = true) => {
  writeJsonToStorage(localStorage, AUTH_SESSION_STORAGE_KEY, rememberMe ? session : null);
  writeJsonToStorage(sessionStorage, AUTH_SESSION_STORAGE_KEY, rememberMe ? null : session);

  if (broadcast) {
    broadcastAuthEvent({
      type: 'session:update',
      rememberMe,
      session,
    });
  }
};

const clearStoredSession = (broadcast = true) => {
  try {
    localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  } catch {}

  if (broadcast) {
    broadcastAuthEvent({
      type: 'session:clear',
    });
  }
};

const readAdminSettings = () => {
  const parsed = readJson(ADMIN_SETTINGS_STORAGE_KEY, null);
  return {
    ...DEFAULT_PROFILE.adminSettings,
    ...(parsed || {}),
    metrics: {
      ...DEFAULT_PROFILE.adminSettings.metrics,
      ...(parsed?.metrics || {}),
    },
    managedUsers: parsed?.managedUsers || [],
    contestActivity: parsed?.contestActivity || [],
  };
};

const writeAdminSettings = (adminSettings) => writeJson(ADMIN_SETTINGS_STORAGE_KEY, adminSettings);

const getNextReviewAt = (reviewCount = 0, fromDate = new Date()) => {
  const nextDate = new Date(fromDate);
  const days = REVIEW_INTERVALS_DAYS[Math.min(reviewCount, REVIEW_INTERVALS_DAYS.length - 1)];
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate.toISOString();
};

const getAvatarForEmail = (email) =>
  `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(email || 'CodeMastery')}`;

const getAuthApiBaseUrl = () =>
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:4000/api/auth'
    : '/api/auth';

const createUsernameFromSignup = (name, email) => {
  const baseCandidate = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const emailPrefix = String(email || '').split('@')[0]?.toLowerCase() || 'user';
  const fallbackCandidate = emailPrefix.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const base = (baseCandidate || fallbackCandidate || 'user').slice(0, 70);

  return `${base}_${Date.now()}`;
};

const getDisplayNameFromUsername = (username, email) => {
  const cleanedUsername = String(username || '')
    .trim()
    .replace(/_\d{10,}$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();

  if (cleanedUsername) {
    return cleanedUsername;
  }

  return String(email || '').split('@')[0] || 'User';
};

const buildBackendAccount = (backendUser, password = '') => ({
  id: backendUser.id,
  email: backendUser.email,
  name: getDisplayNameFromUsername(backendUser.username, backendUser.email),
  password,
  username: backendUser.username,
  role: backendUser.role,
  createdAt: backendUser.created_at || new Date().toISOString(),
  avatar: backendUser.avatar || getAvatarForEmail(backendUser.email),
  profile: {
    ...DEFAULT_PROFILE,
    id: backendUser.id,
    email: backendUser.email,
    name: getDisplayNameFromUsername(backendUser.username, backendUser.email),
    avatar: backendUser.avatar || getAvatarForEmail(backendUser.email),
    createdAt: backendUser.created_at || new Date().toISOString(),
    role: backendUser.role || 'learner',
    bio: backendUser.bio || '',
    security: {
      ...DEFAULT_PROFILE.security,
    },
  },
});

const deriveRole = (storedProfile, email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const adminSettings = readAdminSettings();

  if (isAdminEmail(normalizedEmail)) {
    return 'admin';
  }

  const managedRole = adminSettings.managedUsers.find(
    (entry) => String(entry.email || '').trim().toLowerCase() === normalizedEmail
  )?.role;

  return normalizeRole(managedRole || storedProfile?.role || DEFAULT_PROFILE.role);
};

const buildProfileFromAccount = (account) => {
  const base = {
    ...DEFAULT_PROFILE,
    ...(account?.profile || {}),
    id: account.id,
    email: account.email,
    name: account.name || account.email?.split('@')[0] || 'User',
    avatar: account.profile?.avatar || account.avatar || getAvatarForEmail(account.email),
    createdAt: account.profile?.createdAt || account.createdAt || new Date().toISOString(),
    security: {
      ...DEFAULT_PROFILE.security,
      ...(account?.profile?.security || {}),
    },
    adminSettings: readAdminSettings(),
  };

  base.role = deriveRole(base, base.email);
  return base;
};

const mergeProfileUpdates = (prev, updates = {}) => {
  const next = {
    ...prev,
    ...updates,
    role: normalizeRole(updates?.role || prev.role),
    preferences: {
      ...(prev.preferences || {}),
      ...(updates?.preferences || {}),
    },
    security: {
      ...(prev.security || DEFAULT_PROFILE.security),
      ...(updates?.security || {}),
    },
    learningProgress: {
      ...(prev.learningProgress || DEFAULT_PROFILE.learningProgress),
      ...(updates?.learningProgress || {}),
      solvedProblems: {
        ...(prev.learningProgress?.solvedProblems || {}),
        ...(updates?.learningProgress?.solvedProblems || {}),
      },
      assessmentHistory: {
        ...(prev.learningProgress?.assessmentHistory || {}),
        ...(updates?.learningProgress?.assessmentHistory || {}),
      },
    },
    adminSettings: {
      ...(prev.adminSettings || DEFAULT_PROFILE.adminSettings),
      ...(updates?.adminSettings || {}),
      metrics: {
        ...(prev.adminSettings?.metrics || DEFAULT_PROFILE.adminSettings.metrics),
        ...(updates?.adminSettings?.metrics || {}),
      },
      managedUsers: updates?.adminSettings?.managedUsers || prev.adminSettings?.managedUsers || [],
      contestActivity: updates?.adminSettings?.contestActivity || prev.adminSettings?.contestActivity || [],
    },
  };

  next.role = deriveRole(next, next.email);
  return next;
};

const buildRegisteredUsers = () => {
  const users = readUsers();
  const adminSettings = readAdminSettings();

  return users
    .map((account) => {
      const profile = buildProfileFromAccount(account);
      const managedRecord = adminSettings.managedUsers.find(
        (entry) => String(entry.email || '').trim().toLowerCase() === String(account.email || '').trim().toLowerCase()
      );

      return {
        id: account.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        createdAt: profile.createdAt,
        lastLoginAt: profile.security?.lastLoginAt || null,
        lastPasswordChangedAt: profile.security?.lastPasswordChangedAt || null,
        rememberMe: profile.security?.rememberMe ?? true,
        problemsSolved: Object.keys(profile.learningProgress?.solvedProblems || {}).length,
        managedByAdmin: Boolean(managedRecord),
      };
    })
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
};

export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const initializeDemoUsers = () => {
    const existingUsers = readUsers();
    // Only initialize if no users exist
    if (existingUsers.length === 0) {
      const demoUsers = [
        {
          id: 1,
          email: 'admin@codemastery.com',
          name: 'Admin User',
          password: 'admin123456',
          createdAt: new Date().toISOString(),
          avatar: 'https://api.dicebear.com/7.x/avatars/svg?seed=admin',
          profile: {
            id: 1,
            name: 'Admin User',
            email: 'admin@codemastery.com',
            role: 'admin',
            createdAt: new Date().toISOString(),
            totalPoints: 0,
            streak: 0,
            problemsSolved: 0,
            bio: 'System Administrator',
            avatar: 'https://api.dicebear.com/7.x/avatars/svg?seed=admin'
          }
        },
        {
          id: 2,
          email: 'user@codemastery.com',
          name: 'Demo User',
          password: 'demo123456',
          createdAt: new Date().toISOString(),
          avatar: 'https://api.dicebear.com/7.x/avatars/svg?seed=user',
          profile: {
            id: 2,
            name: 'Demo User',
            email: 'user@codemastery.com',
            role: 'learner',
            createdAt: new Date().toISOString(),
            totalPoints: 0,
            streak: 0,
            problemsSolved: 0,
            bio: 'Demo Learning Account',
            avatar: 'https://api.dicebear.com/7.x/avatars/svg?seed=user'
          }
        },
        {
          id: 3,
          email: 'interviewer@codemastery.com',
          name: 'Interviewer',
          password: 'interview123456',
          createdAt: new Date().toISOString(),
          avatar: 'https://api.dicebear.com/7.x/avatars/svg?seed=interviewer',
          profile: {
            id: 3,
            name: 'Interviewer',
            email: 'interviewer@codemastery.com',
            role: 'interviewer',
            createdAt: new Date().toISOString(),
            totalPoints: 0,
            streak: 0,
            problemsSolved: 0,
            bio: 'Interview Panel Coordinator',
            avatar: 'https://api.dicebear.com/7.x/avatars/svg?seed=interviewer'
          }
        }
      ];
      writeUsers(demoUsers);
      console.log('✅ Demo users initialized');
    }
  };

  const hydrateFromStorage = () => {
    const { session } = readStoredSession();
    const users = readUsers();
    const account = users.find((entry) => entry.id === session?.userId);
    setProfile(account ? buildProfileFromAccount(account) : null);
  };

  useEffect(() => {
    initializeDemoUsers();
    hydrateFromStorage();
    setIsLoading(false);

    // Firebase Auth State Listener
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in
        const users = readUsers();
        let localUser = users.find((u) => u.id === firebaseUser.uid);
        
        if (!localUser) {
          // Create a new local user based on Firebase user
          localUser = {
            id: firebaseUser.uid,
            email: firebaseUser.email,
            name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
            password: '', // Firebase manages passwords, not stored locally
            createdAt: new Date(firebaseUser.metadata.creationTime).toISOString(),
            avatar: firebaseUser.photoURL || getAvatarForEmail(firebaseUser.email),
            profile: {
              ...DEFAULT_PROFILE,
              id: firebaseUser.uid,
              email: firebaseUser.email,
              name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
              avatar: firebaseUser.photoURL || getAvatarForEmail(firebaseUser.email),
              createdAt: new Date(firebaseUser.metadata.creationTime).toISOString(),
            },
          };
          users.push(localUser);
          writeUsers(users);
        }
        
        setProfile(buildProfileFromAccount(localUser));
      } else {
        // User is signed out
        setProfile(null);
      }
    });

    const handleStorage = (event) => {
      if (event.key === AUTH_SYNC_STORAGE_KEY && event.newValue) {
        try {
          const payload = JSON.parse(event.newValue);

          if (payload.type === 'session:update') {
            writeStoredSession(payload.session, payload.rememberMe, false);
          }

          if (payload.type === 'session:clear') {
            clearStoredSession(false);
          }
        } catch {}
      }

      if (
        !event.key ||
        [
          AUTH_USERS_STORAGE_KEY,
          AUTH_SESSION_STORAGE_KEY,
          ADMIN_SETTINGS_STORAGE_KEY,
          AUTH_SYNC_STORAGE_KEY,
          PASSWORD_RESETS_STORAGE_KEY,
        ].includes(event.key)
      ) {
        hydrateFromStorage();
      }
    };

    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
      unsubscribe();
    };
  }, []);

  const persistProfile = (nextProfile, options = {}) => {
    const {
      nextPassword = null,
      rememberMe = readStoredSession().rememberMe,
      persistSession = true,
      loginTimestamp = null,
    } = options;

    const users = readUsers();
    const index = users.findIndex((entry) => entry.id === nextProfile.id);
    const existingAccount = index === -1 ? null : users[index];
    const nextStoredProfile = {
      ...nextProfile,
      adminSettings: readAdminSettings(),
      security: {
        ...DEFAULT_PROFILE.security,
        ...(nextProfile.security || {}),
        rememberMe,
        lastLoginAt:
          loginTimestamp != null
            ? loginTimestamp
            : nextProfile.security?.lastLoginAt || existingAccount?.profile?.security?.lastLoginAt || null,
      },
    };

    const account = {
      id: nextStoredProfile.id,
      email: nextStoredProfile.email,
      name: nextStoredProfile.name,
      password: nextPassword ?? existingAccount?.password ?? '',
      createdAt: nextStoredProfile.createdAt,
      avatar: nextStoredProfile.avatar,
      profile: nextStoredProfile,
    };

    if (index === -1) {
      users.push(account);
    } else {
      users[index] = account;
    }

    writeUsers(users);

    if (persistSession) {
      writeStoredSession({ userId: nextStoredProfile.id }, rememberMe);
    }

    setProfile(nextStoredProfile);
  };

  const signup = async ({ name, email, password, rememberMe = true }) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const trimmedPassword = String(password || '');
    const trimmedName = String(name || '').trim();

    if (!normalizedEmail || !trimmedPassword) {
      throw new Error('Email and password are required.');
    }

    try {
      // Create user with Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, trimmedPassword);
      const firebaseUser = userCredential.user;
      
      // Get Firebase ID token
      const idToken = await firebaseUser.getIdToken();

      // Sync with backend database
      const apiBaseUrl = getAuthApiBaseUrl();
      const syncResponse = await fetch(`${apiBaseUrl}/firebase-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firebaseUid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: trimmedName,
        }),
      });

      if (!syncResponse.ok) {
        throw new Error('Failed to sync with backend');
      }

      const syncData = await syncResponse.json();

      const loginTimestamp = new Date().toISOString();
      
      // Build profile with Firebase user data
      const firebaseAccount = {
        id: firebaseUser.uid,
        email: firebaseUser.email,
        name: trimmedName || firebaseUser.email?.split('@')[0] || 'User',
        password: trimmedPassword,
        createdAt: new Date(firebaseUser.metadata.creationTime).toISOString(),
        avatar: getAvatarForEmail(firebaseUser.email),
        profile: {
          ...DEFAULT_PROFILE,
          id: firebaseUser.uid,
          email: firebaseUser.email,
          name: trimmedName || firebaseUser.email?.split('@')[0] || 'User',
          avatar: getAvatarForEmail(firebaseUser.email),
          createdAt: new Date(firebaseUser.metadata.creationTime).toISOString(),
          role: 'learner',
          security: {
            rememberMe,
            lastLoginAt: loginTimestamp,
            lastPasswordChangedAt: loginTimestamp,
          },
        },
      };

      const nextProfile = mergeProfileUpdates(buildProfileFromAccount(firebaseAccount), {
        name: trimmedName || firebaseAccount.name,
        security: {
          rememberMe,
          lastLoginAt: loginTimestamp,
          lastPasswordChangedAt: loginTimestamp,
        },
      });

      persistProfile(nextProfile, {
        nextPassword: trimmedPassword,
        rememberMe,
        loginTimestamp,
      });

      // Store Firebase ID token
      localStorage.setItem('firebase-id-token', idToken);
      localStorage.setItem('firebase-uid', firebaseUser.uid);
      localStorage.setItem('auth-token', syncData.token);
    } catch (firebaseError) {
      console.error('Firebase signup error:', firebaseError);
      
      // Map Firebase error codes to user-friendly messages
      let errorMessage = 'Unable to create account.';
      if (firebaseError.code === 'auth/email-already-in-use') {
        errorMessage = 'Email is already registered. Please sign in or use a different email.';
      } else if (firebaseError.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use at least 6 characters.';
      } else if (firebaseError.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      } else {
        errorMessage = firebaseError.message || 'Unable to create account.';
      }
      
      throw new Error(errorMessage);
    }
  };

  const login = async ({ email, password, rememberMe = true }) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    
    if (!normalizedEmail || !password) {
      throw new Error('Email and password are required.');
    }

    try {
      // Sign in with Firebase Authentication
      const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const firebaseUser = userCredential.user;
      
      // Get Firebase ID token
      const idToken = await firebaseUser.getIdToken();

      // Sync with backend database
      const apiBaseUrl = getAuthApiBaseUrl();
      const syncResponse = await fetch(`${apiBaseUrl}/firebase-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firebaseUid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
        }),
      });

      if (!syncResponse.ok) {
        console.warn('Failed to sync with backend, continuing anyway');
      }

      const syncData = syncResponse.ok ? await syncResponse.json() : { token: null };

      const loginTimestamp = new Date().toISOString();
      
      // Build profile with Firebase user data
      const firebaseAccount = {
        id: firebaseUser.uid,
        email: firebaseUser.email,
        name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
        password,
        createdAt: new Date(firebaseUser.metadata.creationTime).toISOString(),
        avatar: firebaseUser.photoURL || getAvatarForEmail(firebaseUser.email),
        profile: {
          ...DEFAULT_PROFILE,
          id: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          avatar: firebaseUser.photoURL || getAvatarForEmail(firebaseUser.email),
          createdAt: new Date(firebaseUser.metadata.creationTime).toISOString(),
          role: 'learner',
          security: {
            rememberMe,
            lastLoginAt: loginTimestamp,
          },
        },
      };

      const nextProfile = mergeProfileUpdates(buildProfileFromAccount(firebaseAccount), {
        security: {
          rememberMe,
          lastLoginAt: loginTimestamp,
        },
      });

      persistProfile(nextProfile, {
        rememberMe,
        loginTimestamp,
        nextPassword: password,
      });
      
      // Store Firebase ID token and UID
      localStorage.setItem('firebase-id-token', idToken);
      localStorage.setItem('firebase-uid', firebaseUser.uid);
      
      // Store backend JWT token if available
      if (syncData.token) {
        localStorage.setItem('auth-token', syncData.token);
      }
    } catch (firebaseError) {
      console.error('Firebase login error:', firebaseError);
      
      // Map Firebase error codes to user-friendly messages
      let errorMessage = 'Unable to sign in.';
      if (firebaseError.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email. Please sign up first.';
      } else if (firebaseError.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password. Please try again.';
      } else if (firebaseError.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      } else if (firebaseError.code === 'auth/user-disabled') {
        errorMessage = 'This account has been disabled.';
      } else if (firebaseError.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed login attempts. Please try again later.';
      } else {
        errorMessage = firebaseError.message || 'Unable to sign in.';
      }
      
      throw new Error(errorMessage);
    }
  };

  const updateUser = (updates) => {
    setProfile((prev) => {
      if (!prev) return prev;

      const next = mergeProfileUpdates(prev, updates);
      persistProfile(next);
      return next;
    });
  };

  const changePassword = async ({ currentPassword, newPassword }) => {
    if (!profile) {
      throw new Error('You must be signed in to change your password.');
    }

    const trimmedCurrent = String(currentPassword || '');
    const trimmedNext = String(newPassword || '');

    if (!trimmedNext || trimmedNext.length < 6) {
      throw new Error('Use at least 6 characters for the new password.');
    }

    const users = readUsers();
    const account = users.find((entry) => entry.id === profile.id);

    if (!account || account.password !== trimmedCurrent) {
      throw new Error('Current password is incorrect.');
    }

    const changedAt = new Date().toISOString();
    const nextProfile = mergeProfileUpdates(buildProfileFromAccount(account), {
      security: {
        lastPasswordChangedAt: changedAt,
      },
    });

    persistProfile(nextProfile, {
      nextPassword: trimmedNext,
    });
  };

  const requestPasswordReset = async (identifier) => {
    const normalizedIdentifier = String(identifier || '').trim();
    const apiBaseUrl = getAuthApiBaseUrl();

    if (!normalizedIdentifier) {
      throw new Error('Enter your email address.');
    }

    const response = await fetch(`${apiBaseUrl}/forgot-password/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: normalizedIdentifier }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Unable to send OTP.');
    }

    return data;
  };

  const resetPasswordForDev = async ({ identifier, email, resetCode, newPassword }) => {
    const normalizedIdentifier = String(identifier || email || '').trim();
    const trimmedCode = String(resetCode || '').trim();
    const trimmedPassword = String(newPassword || '');
    const apiBaseUrl = getAuthApiBaseUrl();

    if (!trimmedPassword || trimmedPassword.length < 6) {
      throw new Error('Use at least 6 characters for the new password.');
    }

    const response = await fetch(`${apiBaseUrl}/forgot-password/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: normalizedIdentifier,
        otp: trimmedCode,
        newPassword: trimmedPassword,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'Unable to reset password.');
    }

    return data;
  };

  const toggleBookmark = (problemId) => {
    setProfile((prev) => {
      if (!prev) return prev;
      const normalizedId = String(problemId);
      const existingBookmarks = (prev.bookmarkedProblems || []).map((id) => String(id));
      const exists = existingBookmarks.includes(normalizedId);
      const next = {
        ...prev,
        bookmarkedProblems: exists
          ? existingBookmarks.filter((id) => id !== normalizedId)
          : [...existingBookmarks, normalizedId],
      };
      persistProfile(next);
      return next;
    });
  };

  const isBookmarked = (problemId) =>
    (profile?.bookmarkedProblems || []).map((id) => String(id)).includes(String(problemId));
  const isProblemSolved = (problemId) => Boolean(profile?.learningProgress?.solvedProblems?.[problemId]);

  const markProblemSolved = (problem) => {
    setProfile((prev) => {
      if (!prev || !problem?.id) return prev;

      const existingEntry = prev.learningProgress?.solvedProblems?.[problem.id];
      const reviewCount = existingEntry?.reviewCount || 0;
      const solvedAt = existingEntry?.solvedAt || new Date().toISOString();
      const solvedProblems = {
        ...(prev.learningProgress?.solvedProblems || {}),
        [problem.id]: {
          id: problem.id,
          title: problem.title,
          difficulty: problem.difficulty,
          categories: problem.category || [],
          solvedAt,
          lastSolvedAt: new Date().toISOString(),
          lastReviewedAt: existingEntry?.lastReviewedAt || null,
          nextReviewAt: getNextReviewAt(reviewCount, new Date()),
          reviewCount,
          successfulSubmissions: (existingEntry?.successfulSubmissions || 0) + 1,
        },
      };

      const next = {
        ...prev,
        totalPoints: (prev.totalPoints || 0) + (existingEntry ? 5 : 50),
        problemsSolved: Object.keys(solvedProblems).length,
        learningProgress: {
          ...(prev.learningProgress || DEFAULT_PROFILE.learningProgress),
          solvedProblems,
          assessmentHistory: {
            ...(prev.learningProgress?.assessmentHistory || {}),
          },
        },
      };

      persistProfile(next);
      return next;
    });
  };

  const saveAssessmentResult = ({ topicSlug, questionIds = [] }) => {
    setProfile((prev) => {
      if (!prev || !topicSlug) return prev;

      const currentHistory = prev.learningProgress?.assessmentHistory?.[topicSlug] || [];
      const solvedProblems = { ...(prev.learningProgress?.solvedProblems || {}) };
      const now = new Date();

      questionIds.forEach((problemId) => {
        const existingEntry = solvedProblems[problemId];
        if (!existingEntry) return;

        const nextReviewCount = (existingEntry.reviewCount || 0) + 1;
        solvedProblems[problemId] = {
          ...existingEntry,
          reviewCount: nextReviewCount,
          lastReviewedAt: now.toISOString(),
          nextReviewAt: getNextReviewAt(nextReviewCount, now),
        };
      });

      const next = {
        ...prev,
        learningProgress: {
          ...(prev.learningProgress || DEFAULT_PROFILE.learningProgress),
          solvedProblems,
          assessmentHistory: {
            ...(prev.learningProgress?.assessmentHistory || {}),
            [topicSlug]: [
              {
                completedAt: now.toISOString(),
                questionIds,
              },
              ...currentHistory,
            ].slice(0, 10),
          },
        },
      };

      persistProfile(next);
      return next;
    });
  };

  const assignManagedUserRole = ({ email, role, name = '' }) => {
    setProfile((prev) => {
      if (!prev || prev.role !== 'admin' || !email) return prev;

      const normalizedEmail = String(email).trim().toLowerCase();
      const existingUsers = readAdminSettings().managedUsers || [];
      const withoutCurrent = existingUsers.filter((entry) => entry.email !== normalizedEmail);
      const nextRole = normalizeRole(role);

      const nextManagedUsers =
        nextRole === 'learner'
          ? withoutCurrent
          : [
              ...withoutCurrent,
              {
                email: normalizedEmail,
                role: nextRole,
                name: name || normalizedEmail.split('@')[0],
                updatedAt: new Date().toISOString(),
              },
            ];

      const nextAdminSettings = {
        ...(prev.adminSettings || DEFAULT_PROFILE.adminSettings),
        managedUsers: nextManagedUsers,
        metrics: {
          ...(prev.adminSettings?.metrics || DEFAULT_PROFILE.adminSettings.metrics),
        },
        contestActivity: prev.adminSettings?.contestActivity || [],
      };

      writeAdminSettings(nextAdminSettings);
      broadcastAuthEvent({ type: 'admin-settings:update' });

      const next = {
        ...prev,
        adminSettings: nextAdminSettings,
      };

      persistProfile(next);
      return next;
    });
  };

  const bumpAdminMetric = (metricKey, amount = 1, metadata = null) => {
    setProfile((prev) => {
      if (!prev) return prev;

      const nextMetrics = {
        ...(prev.adminSettings?.metrics || DEFAULT_PROFILE.adminSettings.metrics),
        [metricKey]: (prev.adminSettings?.metrics?.[metricKey] || 0) + amount,
      };

      const nextContestActivity = metadata
        ? [
            {
              id: `${metricKey}-${Date.now()}`,
              type: metricKey,
              createdAt: new Date().toISOString(),
              ...metadata,
            },
            ...(prev.adminSettings?.contestActivity || []),
          ].slice(0, 12)
        : prev.adminSettings?.contestActivity || [];

      const nextAdminSettings = {
        ...(prev.adminSettings || DEFAULT_PROFILE.adminSettings),
        managedUsers: readAdminSettings().managedUsers || [],
        metrics: nextMetrics,
        contestActivity: nextContestActivity,
      };

      writeAdminSettings(nextAdminSettings);
      broadcastAuthEvent({ type: 'admin-settings:update' });

      const next = {
        ...prev,
        adminSettings: nextAdminSettings,
      };

      persistProfile(next);
      return next;
    });
  };

  const logout = async () => {
    clearStoredSession();
    try {
      // Sign out from Firebase
      await signOut(auth);
      localStorage.removeItem('auth-token');
      localStorage.removeItem('firebase-id-token');
      localStorage.removeItem('firebase-uid');
    } catch (error) {
      console.error('Logout error:', error);
    }
    setProfile(null);
  };

  const signInWithGoogle = async ({ rememberMe = true } = {}) => {
    try {
      const userCredential = await signInWithPopup(auth, googleProvider);
      const firebaseUser = userCredential.user;
      const idToken = await firebaseUser.getIdToken();
      const loginTimestamp = new Date().toISOString();

      // Sync with backend database
      const apiBaseUrl = getAuthApiBaseUrl();
      const syncResponse = await fetch(`${apiBaseUrl}/firebase-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firebaseUid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
        }),
      });

      if (!syncResponse.ok) {
        throw new Error('Failed to sync with backend');
      }

      const syncData = await syncResponse.json();

      const firebaseAccount = {
        id: firebaseUser.uid,
        email: firebaseUser.email,
        name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
        password: '',
        createdAt: new Date(firebaseUser.metadata.creationTime).toISOString(),
        avatar: firebaseUser.photoURL || getAvatarForEmail(firebaseUser.email),
        profile: {
          ...DEFAULT_PROFILE,
          id: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          avatar: firebaseUser.photoURL || getAvatarForEmail(firebaseUser.email),
          createdAt: new Date(firebaseUser.metadata.creationTime).toISOString(),
          role: 'learner',
          security: {
            rememberMe,
            lastLoginAt: loginTimestamp,
          },
        },
      };

      const nextProfile = mergeProfileUpdates(buildProfileFromAccount(firebaseAccount), {
        security: {
          rememberMe,
          lastLoginAt: loginTimestamp,
        },
      });

      persistProfile(nextProfile, {
        rememberMe,
        loginTimestamp,
      });

      localStorage.setItem('firebase-id-token', idToken);
      localStorage.setItem('firebase-uid', firebaseUser.uid);
      localStorage.setItem('auth-token', syncData.token);
    } catch (error) {
      console.error('Google sign-in error:', error);
      let errorMessage = 'Unable to sign in with Google.';
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Sign-in popup was closed.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please try again.';
      }
      throw new Error(errorMessage);
    }
  };

  const signInWithGithub = async ({ rememberMe = true } = {}) => {
    try {
      const userCredential = await signInWithPopup(auth, githubProvider);
      const firebaseUser = userCredential.user;
      const idToken = await firebaseUser.getIdToken();
      const loginTimestamp = new Date().toISOString();

      // Sync with backend database
      const apiBaseUrl = getAuthApiBaseUrl();
      const syncResponse = await fetch(`${apiBaseUrl}/firebase-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firebaseUid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
        }),
      });

      if (!syncResponse.ok) {
        throw new Error('Failed to sync with backend');
      }

      const syncData = await syncResponse.json();

      const firebaseAccount = {
        id: firebaseUser.uid,
        email: firebaseUser.email,
        name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
        password: '',
        createdAt: new Date(firebaseUser.metadata.creationTime).toISOString(),
        avatar: firebaseUser.photoURL || getAvatarForEmail(firebaseUser.email),
        profile: {
          ...DEFAULT_PROFILE,
          id: firebaseUser.uid,
          email: firebaseUser.email,
          name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
          avatar: firebaseUser.photoURL || getAvatarForEmail(firebaseUser.email),
          createdAt: new Date(firebaseUser.metadata.creationTime).toISOString(),
          role: 'learner',
          security: {
            rememberMe,
            lastLoginAt: loginTimestamp,
          },
        },
      };

      const nextProfile = mergeProfileUpdates(buildProfileFromAccount(firebaseAccount), {
        security: {
          rememberMe,
          lastLoginAt: loginTimestamp,
        },
      });

      persistProfile(nextProfile, {
        rememberMe,
        loginTimestamp,
      });

      localStorage.setItem('firebase-id-token', idToken);
      localStorage.setItem('firebase-uid', firebaseUser.uid);
      localStorage.setItem('auth-token', syncData.token);
    } catch (error) {
      console.error('GitHub sign-in error:', error);
      let errorMessage = 'Unable to sign in with GitHub.';
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = 'Sign-in popup was closed.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please try again.';
      }
      throw new Error(errorMessage);
    }
  };

  const registeredUsers = useMemo(() => buildRegisteredUsers(), [profile]);
  const sessionInfo = useMemo(() => readStoredSession(), [profile]);

  const value = useMemo(
    () => ({
      user: profile,
      profile,
      isAuthenticated: Boolean(profile),
      isLoading,
      login,
      signup,
      logout,
      signInWithGoogle,
      signInWithGithub,
      toggleBookmark,
      isBookmarked,
      isProblemSolved,
      updateUser,
      changePassword,
      requestPasswordReset,
      resetPasswordForDev,
      markProblemSolved,
      saveAssessmentResult,
      assignManagedUserRole,
      bumpAdminMetric,
      registeredUsers,
      sessionInfo: {
        rememberMe: sessionInfo.rememberMe,
        isPersistent: sessionInfo.rememberMe,
      },
    }),
    [profile, isLoading, registeredUsers, sessionInfo]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

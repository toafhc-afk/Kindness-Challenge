/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Home, 
  Map as MapIcon, 
  Camera, 
  Compass, 
  User, 
  Leaf, 
  Cloud, 
  Flame, 
  Users, 
  Lock, 
  CheckCircle2, 
  Check, 
  Info,
  ChevronRight,
  ChevronLeft,
  Heart,
  Bell,
  MessageCircle,
  Star,
  Search,
  LogOut,
  LogIn,
  Trash2,
  X,
  Gift,
  Award,
  Download,
  RefreshCw
} from 'lucide-react';
import { useAuth } from './lib/AuthContext';
import { loginWithGoogle, loginAnonymously, googleProvider, auth, db, storage } from './lib/firebase';
import { signOut, linkWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit, onSnapshot, deleteDoc, arrayUnion, where } from 'firebase/firestore';
import { TRACK_DATA, LEVELS_EXP_REQ, TITLES, TITLES_BY_TRACK, BADGES, DAILY_RANDOM_TASKS } from './constants';
import { View, Track, Task, AppState, Badge } from './types';
import { cn, calculateLevel, getLevelForTrack } from './lib/utils';
import { generateCertificate } from './lib/certificate';
import { playSound, unlockAudio } from './lib/sound';

// Helper to fetch stable daily random task index based on date string
const getDailyTask = () => {
  const dayStr = new Date().toDateString();
  let hash = 0;
  for (let i = 0; i < dayStr.length; i++) {
    hash = dayStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % DAILY_RANDOM_TASKS.length;
  return DAILY_RANDOM_TASKS[idx];
};


enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const { user, loading: authLoading, userState: firebaseState, refreshUserState } = useAuth();
  
  // Local state for UI responsiveness, initialized from Firebase if available
  const [localState, setLocalState] = useState<AppState | null>(null);
  
  const defaultState: AppState = {
    hasSeenPreview: false,
    track: null,
    level: 1,
    exp: 0,
    streak: 0,
    checkInCount: 0,
    co2Saved: 0,
    unlockedBadges: [],
    badgeUnlockDates: {},
    claimedRewards: [],
    lastCheckInDate: null,
    hasCompletedTutorial: false,
  };

  const state = { ...defaultState, ...(localState || firebaseState || {}) };
  // Ensure nested objects are initialized if undefined in existing state
  if (!state.badgeUnlockDates) state.badgeUnlockDates = {};
  if (!state.claimedRewards) state.claimedRewards = [];
  if (!state.unlockedBadges) state.unlockedBadges = [];

  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [tempTrack, setTempTrack] = useState<Track | null>(null);
  const [previewTab, setPreviewTab] = useState<'veg' | 'plastic'>('veg');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isMapLeveledUp, setIsMapLeveledUp] = useState(false);
  const [isRankLeveledUp, setIsRankLeveledUp] = useState(false);
  const [globalFeed, setGlobalFeed] = useState<any[]>([]);
  const [feedLimit, setFeedLimit] = useState(10);
  const [newUnlockedBadges, setNewUnlockedBadges] = useState<Badge[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [showRewardModal, setShowRewardModal] = useState<Track | null>(null);
  const [certificateImageUrl, setCertificateImageUrl] = useState<string | null>(null);
  const [showTrackSwitcherModal, setShowTrackSwitcherModal] = useState(false);

  const lastScrollY = React.useRef(0);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const [isNavVisible, setIsNavVisible] = useState(true);

  // Form states lifted to prevent unmounting resetting during scrolling
  const [checkinText, setCheckinText] = useState('');
  const [checkinSelectedFile, setCheckinSelectedFile] = useState<File | null>(null);
  const [checkinPreviewUrl, setCheckinPreviewUrl] = useState<string | null>(null);
  const [checkinIsUploading, setCheckinIsUploading] = useState(false);
  const [checkinSelectedOptions, setCheckinSelectedOptions] = useState<string[]>([]);

  // Feed Comments states
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
  const [commentInputText, setCommentInputText] = useState('');

  // Editing comments state
  const [editingCommentIndex, setEditingCommentIndex] = useState<{postId: string, commentIdx: number} | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // Profile reset state
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [tutorialSlide, setTutorialSlide] = useState(0);
  const [profileTab, setProfileTab] = useState<'badges' | 'settings'>('badges');
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [quizRecommendation, setQuizRecommendation] = useState<Track | null>(null);
  const [dashboardGuideStep, setDashboardGuideStep] = useState<number | null>(null);
  const [checkinGuideStep, setCheckinGuideStep] = useState<number | null>(null);
  const [profileGuideStep, setProfileGuideStep] = useState<number | null>(null);

  // Profile Setup states
  const [profileSetupName, setProfileSetupName] = useState('');
  const [profileSetupAvatar, setProfileSetupAvatar] = useState('Felix');
  const [profileCustomAvatarText, setProfileCustomAvatarText] = useState('');

  // Notifications states
  const [notifications, setNotifications] = useState<any[]>([]);
  const unreadCount = notifications.filter(n => !n.read).length;
  const lastUnreadCount = React.useRef(0);

  // Helper for centering elements inside scrollable container with retry fallback for lazy render
  const smoothScrollToElement = (elementOrSelector: Element | string | null, block: 'center' | 'top' = 'center', retryCount = 0) => {
    let element: Element | null = null;
    if (typeof elementOrSelector === 'string') {
      element = document.querySelector(elementOrSelector);
    } else {
      element = elementOrSelector;
    }

    if (!element) {
      if (retryCount < 15 && typeof elementOrSelector === 'string') {
        setTimeout(() => {
          smoothScrollToElement(elementOrSelector, block, retryCount + 1);
        }, 80);
      }
      return;
    }

    const container = element.closest('.overflow-y-auto') as HTMLDivElement | null;
    if (!container) {
      if (retryCount < 15) {
        setTimeout(() => {
          smoothScrollToElement(element, block, retryCount + 1);
        }, 80);
      }
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    
    // If layout hasn't settled yet (rect width/height are 0), retry
    if (elementRect.height === 0 || containerRect.height === 0) {
      if (retryCount < 15) {
        setTimeout(() => {
          smoothScrollToElement(element, block, retryCount + 1);
        }, 80);
      }
      return;
    }

    const relativeTop = elementRect.top - containerRect.top + container.scrollTop;
    let targetScrollTop = relativeTop;
    if (block === 'center') {
      targetScrollTop = relativeTop - (containerRect.height / 2) + (elementRect.height / 2);
    }
    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: 'smooth'
    });
  };

  // Map interactive state
  const [selectedMapTaskIndex, setSelectedMapTaskIndex] = useState<number | null>(null);

  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isFB = /FBAN|FBAV/i.test(ua);
    const isIG = /Instagram/i.test(ua);
    const isWeChat = /MicroMessenger/i.test(ua);
    const isLine = /Line/i.test(ua);

    if (isFB || isIG || isWeChat || isLine) {
      setIsInAppBrowser(true);
    }

    const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOSDevice(ios);
  }, []);

  useEffect(() => {
    setIsNavVisible(true);
    lastScrollY.current = 0;
    // Reset active comment box on view switch
    setActiveCommentPostId(null);
    // Reset comment edit state
    setEditingCommentIndex(null);
    // Reset selected map task on view switch
    setSelectedMapTaskIndex(null);
  }, [currentView]);

  // When entering map, scroll to bottom so level 1 is visible first (if not guided)
  useEffect(() => {
    if (currentView === 'map' && scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      const raf = requestAnimationFrame(() => {
        const showFirstLevelGuide = state?.level === 1 && state?.checkInCount === 0;
        if (!showFirstLevelGuide) {
          el.scrollTop = el.scrollHeight;
        }
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [currentView, state]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (currentView === 'map') return; // always show nav on map
    const currentScrollY = e.currentTarget.scrollTop;
    if (Math.abs(currentScrollY - lastScrollY.current) > 15) {
      if (currentScrollY > lastScrollY.current && currentScrollY > 50) {
        setIsNavVisible(false);
      } else {
        setIsNavVisible(true);
      }
      lastScrollY.current = currentScrollY;
    }
  };

  const handleDeleteComment = async (postId: string, commentIndex: number) => {
    if (!confirm('確定要刪除這則留言嗎？')) return;
    try {
      const post = globalFeed.find(p => p.id === postId);
      if (!post || !post.comments) return;
      const updatedComments = post.comments.filter((_: any, idx: number) => idx !== commentIndex);
      const postRef = doc(db, 'checkins', postId);
      await updateDoc(postRef, { comments: updatedComments });
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  const handleSaveComment = async (postId: string, commentIndex: number) => {
    if (!editingCommentText.trim()) return;
    try {
      const post = globalFeed.find(p => p.id === postId);
      if (!post || !post.comments) return;
      const updatedComments = post.comments.map((c: any, idx: number) => {
        if (idx === commentIndex) {
          return { ...c, text: editingCommentText.trim() };
        }
        return c;
      });
      const postRef = doc(db, 'checkins', postId);
      await updateDoc(postRef, { comments: updatedComments });
      setEditingCommentIndex(null);
    } catch (err) {
      console.error('Failed to update comment:', err);
    }
  };

  // Sync firebase state to local state
  useEffect(() => {
    if (firebaseState) {
      setLocalState(firebaseState);
    } else {
      setLocalState(null);
    }
  }, [firebaseState]);

  // Global click event listener to automatically play sound/vibration on any button tap (cross-device compatibility)
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('[role="button"]') || target.closest('.btn-active')) {
        playSound('click');
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // Initial routing logic: Auto-switch based on user state
  useEffect(() => {
    if (!authLoading && user) {
      const stateToUse = localState || firebaseState;
      const hasCompleted = stateToUse ? stateToUse.hasCompletedTutorial : false;
      
      if (!hasCompleted) {
        if (!showTutorialModal) {
          setShowTutorialModal(true);
          setTutorialSlide(0);
          setCurrentView('preview'); // Set base view behind full-screen onboarding
        }
      } else {
        // If onboarding is completed but track is not selected yet
        if (!stateToUse || !stateToUse.track) {
          if (currentView !== 'select') {
            setCurrentView('select');
          }
        } else {
          // If track is selected, and we are still on preview/select pages, go to dashboard
          if (currentView === 'preview' || currentView === 'select') {
            setCurrentView('dashboard');
          }
        }
      }
    }
  }, [authLoading, user, localState, firebaseState, showTutorialModal, currentView]);

  // Synchronize profile setup states with DB state when loaded
  useEffect(() => {
    if (state.customDisplayName) {
      setProfileSetupName(state.customDisplayName);
    } else if (user) {
      setProfileSetupName(user.displayName || (user.isAnonymous ? '訪客探險家' : '綠色小勇士'));
    }
    
    if (state.customAvatarSeed) {
      setProfileSetupAvatar(state.customAvatarSeed);
      const presets = ['Bella', 'Felix', 'Charlie', 'Daisy', 'Oliver', 'Ruby', 'Sam', 'Leo'];
      if (!presets.includes(state.customAvatarSeed)) {
        setProfileCustomAvatarText(state.customAvatarSeed);
      } else {
        setProfileCustomAvatarText('');
      }
    } else {
      setProfileSetupAvatar('Felix');
      setProfileCustomAvatarText('');
    }
  }, [state.customDisplayName, state.customAvatarSeed, user]);

  // Real-time listener for user notifications
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    const q = query(
      collection(db, 'notifications'),
      where('recipientId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort in-memory to avoid compound index requirements
      list.sort((a: any, b: any) => {
        const timeA = a.timestamp?.seconds || 0;
        const timeB = b.timestamp?.seconds || 0;
        return timeB - timeA;
      });
      setNotifications(list);
    }, (err) => {
      console.error("Notifications listener failed:", err);
    });
    return unsubscribe;
  }, [user]);

  // Play notification sound when a new unread notification arrives
  useEffect(() => {
    const unread = notifications.filter(n => !n.read);
    if (unread.length > lastUnreadCount.current && lastUnreadCount.current > 0) {
      playSound('levelup');
    }
    lastUnreadCount.current = unread.length;
  }, [notifications]);

  // Trigger step-by-step dashboard guide for beginners
  useEffect(() => {
    if (currentView === 'dashboard' && state && state.level === 1 && state.checkInCount === 0) {
      const hasSeenDashboardGuide = localStorage.getItem(`seen_db_guide_${state.track}`);
      if (!hasSeenDashboardGuide && dashboardGuideStep === null) {
        setDashboardGuideStep(1);
      }
    } else {
      setDashboardGuideStep(null);
    }
  }, [currentView, state, dashboardGuideStep]);

  // Smooth scroll to guide elements when step changes
  useEffect(() => {
    if (dashboardGuideStep === 1) {
      setTimeout(() => {
        const forestCard = document.querySelector('[data-guide="forest-card"]');
        if (forestCard) {
          smoothScrollToElement(forestCard, 'center');
        } else {
          scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 100);
    } else if (dashboardGuideStep === 2) {
      setTimeout(() => {
        const switcherCard = document.querySelector('[data-guide="switcher-card"]');
        if (switcherCard) {
          smoothScrollToElement(switcherCard, 'center');
        }
      }, 100);
    } else if (dashboardGuideStep === 3) {
      setTimeout(() => {
        const taskCard = document.querySelector('[data-guide="task-card"]');
        if (taskCard) {
          smoothScrollToElement(taskCard, 'center');
        }
      }, 100);
    }
  }, [dashboardGuideStep]);

  // Smooth scroll to confirm button when a temporary track is selected on track selection screen
  useEffect(() => {
    if (tempTrack && currentView === 'select') {
      setTimeout(() => {
        const confirmBtn = document.querySelector('[data-guide="confirm-track-btn"]');
        if (confirmBtn) {
          smoothScrollToElement(confirmBtn, 'center');
        }
      }, 150);
    }
  }, [tempTrack, currentView]);

  // Trigger step-by-step check-in guide for beginners
  useEffect(() => {
    if (currentView === 'checkin' && state && state.level === 1 && state.checkInCount === 0) {
      const hasSeenCheckinGuide = localStorage.getItem(`seen_checkin_guide_${state.track}`);
      if (!hasSeenCheckinGuide && checkinGuideStep === null) {
        setCheckinGuideStep(1);
      }
    } else {
      setCheckinGuideStep(null);
    }
  }, [currentView, state, checkinGuideStep]);

  // Smooth scroll to checkin guide elements
  useEffect(() => {
    if (checkinGuideStep === 1) {
      setTimeout(() => {
        const checklistSection = document.querySelector('[data-guide="checkin-checklist"]');
        if (checklistSection) {
          smoothScrollToElement(checklistSection, 'center');
        } else {
          scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 100);
    } else if (checkinGuideStep === 2) {
      setTimeout(() => {
        const submitBtn = document.querySelector('[data-guide="checkin-submit-btn"]');
        if (submitBtn) {
          smoothScrollToElement(submitBtn, 'center');
        }
      }, 100);
    }
  }, [checkinGuideStep]);

  // Smooth scroll to the active level node when entering the map view
  useEffect(() => {
    if (currentView === 'map') {
      setTimeout(() => {
        const activeNode = document.querySelector('[data-guide="active-level-node"]');
        if (activeNode) {
          smoothScrollToElement(activeNode, 'center');
        } else {
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
          }
        }
      }, 300);
    }
  }, [currentView]);

  // Trigger step-by-step profile badge guide for first-time badge earners
  useEffect(() => {
    if (currentView === 'profile' && profileTab === 'badges' && state && state.checkInCount === 1) {
      const hasSeenProfileGuide = localStorage.getItem('seen_profile_guide');
      if (!hasSeenProfileGuide && profileGuideStep === null) {
        setProfileGuideStep(1);
      }
    } else {
      setProfileGuideStep(null);
    }
  }, [currentView, profileTab, state, profileGuideStep]);

  // Smooth scroll to newly unlocked badge on profile tab
  useEffect(() => {
    if (profileGuideStep === 1) {
      setTimeout(() => {
        const newBadge = document.querySelector('[data-guide="new-unlocked-badge"]');
        if (newBadge) {
          smoothScrollToElement(newBadge, 'center');
        }
      }, 200);
    }
  }, [profileGuideStep]);

  // Load feed from Firestore
  useEffect(() => {
    if (!user) {
      setGlobalFeed([]);
      return;
    }
    const q = query(collection(db, 'checkins'), orderBy('timestamp', 'desc'), limit(feedLimit));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const feed = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setGlobalFeed(feed);
    }, (error) => {
      if (error.code === 'permission-denied') {
        console.warn('Firestore: Waiting for auth permissions for checkins...');
        return;
      }
      handleFirestoreError(error, OperationType.GET, 'checkins');
    });
    return unsubscribe;
  }, [user, feedLimit]);

  // Generate certificate image when showRewardModal is open
  useEffect(() => {
    if (showRewardModal) {
      setCertificateImageUrl(null);
      const dateStr = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
      const nameStr = state.customDisplayName || user?.displayName || (user?.isAnonymous ? '訪客探險家' : '匿名探險家');
      generateCertificate(showRewardModal, nameStr, dateStr)
        .then(url => {
          setCertificateImageUrl(url);
        })
        .catch(err => {
          console.error('Error generating certificate image:', err);
        });
    }
  }, [showRewardModal, user]);



  const updateFirebaseState = async (updates: Partial<AppState>) => {
    if (!user) return;
    
    // Optimistic Update: Update local state immediately
    setLocalState(prev => {
      const base = { ...defaultState, ...(prev || firebaseState || {}) };
      return { ...base, ...updates };
    });

    const userRef = doc(db, 'users', user.uid);
    try {
      const fullUpdates = {
        ...updates,
        uid: user.uid,
        updatedAt: serverTimestamp(),
      };
      
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        (fullUpdates as any).createdAt = serverTimestamp();
      }

      await setDoc(userRef, fullUpdates, { merge: true });
      await refreshUserState();
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  const handleNav = (target: View) => {
    playSound('click');
    if (!state.track && !['preview', 'select', 'profile'].includes(target)) {
      setCurrentView('select');
      return;
    }
    setCurrentView(target);
  };

  const handleGlobalClick = (e: React.MouseEvent<HTMLDivElement>) => {
    unlockAudio();
    
    let target = e.target as HTMLElement | null;
    while (target && target !== e.currentTarget) {
      const tagName = target.tagName;
      const role = target.getAttribute('role');
      const isButton = tagName === 'BUTTON' || tagName === 'A' || role === 'button';
      const hasPointerClass = target.classList.contains('cursor-pointer') || 
                              target.classList.contains('btn-active') ||
                              target.classList.contains('select-none') ||
                              target.getAttribute('onClick') !== null;
      
      if (isButton || hasPointerClass) {
        playSound('click');
        break;
      }
      target = target.parentElement;
    }
  };

  const currentLevel = calculateLevel(state.exp, LEVELS_EXP_REQ);

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-svh bg-white-main">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
          className="w-10 h-10 border-4 border-green-main border-t-transparent rounded-full mb-4"
        />
        <p className="text-text-sub font-black text-sm">載入冒險中...</p>
      </div>
    );
  }

  // Login view if not authenticated
  if (!user) {
    return (
      <div id="app-container" className="max-w-[400px] mx-auto bg-white-main h-svh relative overflow-hidden flex flex-col shadow-2xl items-center justify-center p-12 text-center">
        {isInAppBrowser && (
          <div className="absolute inset-0 bg-text-main/95 z-50 flex flex-col items-center justify-between p-8 text-white animate-fade-in">
            {/* Top pointing guide for Android / general */}
            {!isIOSDevice ? (
              <div className="self-end flex flex-col items-end gap-2 animate-bounce-slow mt-2">
                <span className="text-sm font-bold bg-green-main text-text-main px-3 py-1 rounded-full shadow-sm">
                  點擊右上角選單 ↗
                </span>
                <svg className="w-8 h-8 text-green-main stroke-[3px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </div>
            ) : (
              <div className="h-10" />
            )}

            <div className="flex-1 flex flex-col items-center justify-center my-auto">
              <div className="w-20 h-20 bg-green-main/20 rounded-full flex items-center justify-center text-4xl mb-6 pulse-glow">
                🌐
              </div>
              <h2 className="text-2xl font-black mb-4 tracking-tight text-green-main">請使用系統瀏覽器開啟</h2>
              <p className="text-xs text-gray-lock leading-relaxed font-semibold mb-6 max-w-[280px]">
                由於 Google 的安全性政策限制，無法在 LINE、Facebook 等 App 的內建瀏覽器中進行登入。
              </p>
              
              <div className="bg-white/5 border border-white/10 rounded-2xl p-4.5 text-left w-full text-xs space-y-3 font-medium">
                <p className="font-bold text-green-main text-sm">💡 開啟步驟：</p>
                {isIOSDevice ? (
                  <p className="leading-relaxed text-gray-300">
                    1. 點擊右下角的 <span className="bg-white/10 px-1.5 py-0.5 rounded font-bold text-white">Safari 瀏覽器圖示</span> 或分享按鈕。<br/>
                    2. 選擇 <span className="text-green-main font-bold">「用 Safari 開啟」</span> 即可順利登入！
                  </p>
                ) : (
                  <p className="leading-relaxed text-gray-300">
                    1. 點擊右上角的 <span className="bg-white/10 px-1.5 py-0.5 rounded font-bold text-white">三個點 ···</span> 選單。<br/>
                    2. 選擇 <span className="text-green-main font-bold">「在 Chrome 中開啟」</span>（或使用預設瀏覽器開啟）即可順利登入！
                  </p>
                )}
              </div>
            </div>

            {/* Bottom pointing guide for iOS */}
            {isIOSDevice ? (
              <div className="self-end flex flex-col items-end gap-2 animate-bounce-slow mb-2">
                <svg className="w-8 h-8 text-green-main stroke-[3px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                <span className="text-sm font-bold bg-green-main text-text-main px-3 py-1 rounded-full shadow-sm">
                  點擊右下角瀏覽器圖示 ↘
                </span>
              </div>
            ) : (
              <div className="h-10" />
            )}
          </div>
        )}
        <div className="w-32 h-32 bg-green-light rounded-full flex items-center justify-center text-6xl mb-8 pulse-glow">🌱</div>
        <h1 className="text-3xl font-black text-text-main mb-4 tracking-tighter">開始你的<br/>永續大挑戰</h1>
        <p className="text-sm text-text-sub mb-10 leading-relaxed font-medium">
          連結你的 Google 帳號，<br/>記錄你的環保足跡與夥伴交流！
        </p>
        <button 
          onClick={loginWithGoogle}
          className="w-full bg-text-main text-white font-black py-5 rounded-2xl btn-active shadow-float flex items-center justify-center gap-3 text-lg"
        >
          <LogIn className="w-6 h-6" /> 使用 Google 登入
        </button>

        <button 
          onClick={async () => {
            const proceed = confirm(
              "💡 溫馨提醒：\n「免登入」可以立即開始體驗，但清除瀏覽器暫存、開啟私密（無痕）瀏覽或更換手機時，進度將會遺失喔！\n\n確定要以訪客身分開始玩嗎？"
            );
            if (!proceed) return;
            try {
              await loginAnonymously();
            } catch (err) {
              alert("免登入失敗，請嘗試使用 Google 登入。");
            }
          }}
          className="w-full mt-4 bg-white border-2 border-gray-line text-text-sub font-black py-4.5 rounded-2xl btn-active flex items-center justify-center gap-2 text-base shadow-sm hover:border-text-main hover:text-text-main transition-all"
        >
          ✨ 免登入訪客體驗 (資料易遺失)
        </button>

        <p className="mt-8 text-[10px] text-gray-lock uppercase tracking-widest font-black">
          Join the mission for a better world
        </p>
      </div>
    );
  }

  // --- View Components ---

  const renderBadgeIcon = (iconStr: string, name: string, isBig = false) => {
    if (iconStr.includes('.') || iconStr.includes('/')) {
      return (
        <img 
          src={iconStr} 
          className={cn(
            "object-contain w-full h-full",
            isBig ? "p-0" : "p-1"
          )} 
          alt={name} 
        />
      );
    }
    return <span className={isBig ? "text-5xl" : "text-xl"}>{iconStr}</span>;
  };

  const renderPreviewView = () => (
    <div className="px-6 py-8">
      <h1 className="text-2xl font-black text-text-main text-center mb-2 tracking-tight">永續大挑戰</h1>
      <p className="text-xs text-text-sub text-center mb-6 font-bold leading-relaxed px-4">
        在這裡，你可以預覽每個軌道完整的 4 個階段挑戰。<br/>
        選定適合你的路線後，即可點選下方開始挑戰！
      </p>

      {/* Tabs */}
      <div className="flex bg-gray-line rounded-full p-1 mb-6">
        <button 
          onClick={() => setPreviewTab('veg')}
          className={cn(
            "flex-1 py-3 text-sm font-black rounded-full transition-all duration-300",
            previewTab === 'veg' ? "bg-white text-green-main shadow-sm" : "text-text-sub"
          )}
        >
          🥬 蔬食任務
        </button>
        <button 
          onClick={() => setPreviewTab('plastic')}
          className={cn(
            "flex-1 py-3 text-sm font-black rounded-full transition-all duration-300",
            previewTab === 'plastic' ? "bg-white text-blue-main shadow-sm" : "text-text-sub"
          )}
        >
          💧 淨塑任務
        </button>
      </div>

      {/* Content */}
      <div className="space-y-4">
        {TRACK_DATA[previewTab === 'veg' ? 'veg' : 'plastic'].tasks.map((task, idx) => (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
            key={task.id}
            className={cn(
              "bg-white p-4.5 rounded-3xl shadow-soft flex items-start gap-4 border transition-all duration-300",
              previewTab === 'veg' ? "border-green-light bg-gradient-to-br from-[#FAFFFD] to-white" : "border-blue-light bg-gradient-to-br from-[#F2F8FF] to-white"
            )}
          >
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 shadow-sm border border-white mt-0.5",
              previewTab === 'veg' ? "bg-green-light text-green-main" : "bg-blue-light text-blue-main"
            )}>
              {task.icon}
            </div>
            <div className="flex-1">
              <div className={cn(
                "text-[10px] font-black uppercase tracking-[0.15em] mb-1",
                previewTab === 'veg' ? "text-green-main" : "text-blue-main"
              )}>
                第 {['一','二','三','四'][idx]} 階段・{task.title}
              </div>
              <div className="font-black text-text-main leading-tight text-sm mb-1">{task.desc}</div>
              <div className="text-[11px] text-text-sub font-semibold leading-relaxed">{task.fullDesc}</div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-8">
        <button 
          onClick={() => {
            updateFirebaseState({ hasSeenPreview: true });
            setCurrentView('select');
          }}
          className="w-full bg-text-main text-white font-bold py-5 rounded-2xl btn-active shadow-float flex items-center justify-center gap-2 group"
        >
          選擇我的軌道 <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );

  const renderSelectView = () => (
    <div className="px-6 py-8">
      <h1 className="text-2xl font-black text-text-main mb-2">選擇你的挑戰軌道</h1>
      <p className="text-sm text-text-sub mb-3 font-medium">選擇適合你的路線，開啟你的永續旅程！</p>

      <div className="flex gap-2.5 mb-6 w-full">
        <button
          onClick={() => {
            playSound('click');
            setShowQuizModal(true);
          }}
          className="flex-1 py-3 px-3 bg-green-light border border-green-main/20 text-green-main rounded-2xl text-[11px] font-black flex items-center justify-center gap-1.5 hover:bg-green-light/80 transition-all btn-active shrink-0"
        >
          🔍 永續屬性快速檢測
        </button>
        <button
          onClick={() => {
            playSound('click');
            setTutorialSlide(0);
            setShowTutorialModal(true);
          }}
          className="flex-1 py-3 px-3 bg-white border border-gray-line text-text-main rounded-2xl text-[11px] font-black flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-all btn-active shrink-0"
        >
          💡 重看玩法教學
        </button>
      </div>

      <div className="space-y-4 mb-8">
        {(['veg', 'plastic', 'dual'] as Track[]).map((t) => {
          const isLocked = t === 'dual' && 
            getLevelForTrack('veg', state.unlockedBadges) < 3 && 
            getLevelForTrack('plastic', state.unlockedBadges) < 3;

          return (
            <motion.div 
              key={t}
              whileTap={isLocked ? {} : { scale: 0.98 }}
              onClick={() => {
                if (isLocked) {
                  alert('🔒 雙軌挑戰尚未解鎖！\n需要將【蔬食任務】或【淨塑任務】挑戰到 Lv.3 (完成前兩關) 後，才能解鎖更具挑戰性的雙軌整合任務喔！加油！');
                  return;
                }
                setTempTrack(t);
              }}
              className={cn(
                "p-5 rounded-2xl border-2 transition-all relative overflow-hidden flex items-center gap-4 bg-white shadow-soft",
                isLocked ? "opacity-60 bg-gray-50 border-gray-line/50 cursor-not-allowed select-none filter grayscale" : 
                tempTrack === t ? "border-text-main shadow-lg cursor-pointer" : "border-transparent cursor-pointer"
              )}
            >
              {isLocked ? (
                <div className="absolute top-0 right-0 bg-gray-lock text-white text-[9px] font-black px-3 py-1.5 rounded-bl-xl shadow-sm flex items-center gap-1">
                  鎖定中 <Lock className="w-2.5 h-2.5" />
                </div>
              ) : t === 'dual' ? (
                <div className="absolute top-0 right-0 bg-[#FFD166] text-text-main text-[10px] font-black px-4 py-1.5 rounded-bl-xl shadow-sm">
                  最高榮耀 👑
                </div>
              ) : quizRecommendation === t ? (
                <div className="absolute top-0 right-0 bg-green-main text-white text-[9px] font-black px-3 py-1.5 rounded-bl-xl shadow-sm animate-pulse flex items-center gap-0.5 z-10">
                  ✨ 推薦起點
                </div>
              ) : null}
              <div className={cn(
                "w-14 h-14 rounded-full flex items-center justify-center text-3xl shrink-0 shadow-inner-soft",
                t === 'veg' ? "bg-green-light text-green-main" : 
                t === 'plastic' ? "bg-blue-light text-blue-main" : 
                "bg-gradient-to-br from-green-light to-blue-light"
              )}>
                {t === 'veg' ? '🥗' : t === 'plastic' ? '💧' : '🌍'}
              </div>
              <div className="flex-1">
                <h3 className="font-black text-lg text-text-main flex items-center gap-1.5">
                  {t === 'veg' ? '蔬食任務' : t === 'plastic' ? '淨塑任務' : '雙軌挑戰'}
                  {isLocked && <span className="text-[10px] font-black text-red-500 bg-red-50 border border-red-200/50 px-2 py-0.5 rounded-lg flex items-center gap-0.5">未解鎖 🔒</span>}
                </h3>
                <p className="text-[11px] text-text-sub mt-1 leading-relaxed font-semibold">
                  {isLocked ? '需蔬食或淨塑挑戰達到 Lv.3 解鎖' : 
                   t === 'veg' ? '從日常餐桌開始，減碳又健康' : 
                   t === 'plastic' ? '減少一次性塑膠，守護海洋' : 
                   '蔬食 × 淨塑，融合高難度挑戰'}
                </p>
              </div>
              {!isLocked && tempTrack === t && (
                <motion.div 
                  initial={{ scale: 0 }} 
                  animate={{ scale: 1 }}
                  className={cn(
                    "text-2xl",
                    t === 'veg' ? "text-green-main" : t === 'plastic' ? "text-blue-main" : "text-text-main"
                  )}
                >
                  <CheckCircle2 className="w-6 h-6 fill-current text-white stroke-[3] stroke-current" />
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className="bg-gray-line/50 p-4 rounded-xl flex gap-3 mb-8">
        <Info className="w-5 h-5 text-gray-lock shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-lock leading-relaxed font-medium">
          你可以隨時切換挑戰軌道，所有軌道的進度皆會自動保留！集齊全部 3 個軌道的所有徽章，即可解鎖最高榮耀【永續守護神】！🏆
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <button 
          data-guide="confirm-track-btn"
          onClick={() => {
            if (tempTrack) {
              const targetLevel = getLevelForTrack(tempTrack, state.unlockedBadges);
              updateFirebaseState({ track: tempTrack, level: targetLevel });
              setCurrentView('dashboard');
            }
          }}
          disabled={!tempTrack}
          className={cn(
            "w-full font-black py-5 rounded-2xl transition-all shadow-float text-lg",
            tempTrack ? "bg-text-main text-white" : "bg-gray-lock text-white/50 cursor-not-allowed"
          )}
        >
          {state.track ? "確認，切換此軌道" : "確認，開始挑戰"}
        </button>
        <button 
          onClick={() => {
            if (state.track) {
              setCurrentView('dashboard');
            } else {
              setCurrentView('preview');
            }
          }}
          className="w-full text-text-sub font-bold py-3 text-sm flex items-center justify-center gap-1 opacity-70 hover:opacity-100 transition-opacity"
        >
          <ChevronLeft className="w-4 h-4" /> {state.track ? "回首頁" : "回去看看任務內容"}
        </button>
      </div>
    </div>
  );

  const renderDashboardView = () => {
    const lv = currentLevel;
    const expReq = LEVELS_EXP_REQ[Math.min(lv, 4)];
    const prevReq = LEVELS_EXP_REQ[lv - 1];
    const progress = ((state.exp - prevReq) / (expReq - prevReq)) * 100;
    
    const track = state.track || 'veg';
    const currentTaskData = TRACK_DATA[track].tasks[Math.min(state.level - 1, 3)];

    // Compute dynamic, real-time social influence partners
    const userPosts = globalFeed.filter(p => p.userId === user?.uid);
    const totalLikes = userPosts.reduce((acc, p) => acc + (p.likes || 0), 0);
    const uniqueCommenters = new Set(
      userPosts
        .flatMap(p => p.comments || [])
        .map(c => c.userId || c.userName)
        .filter(Boolean)
    );
    const influencePartners = (state.checkInCount * 3) + totalLikes + uniqueCommenters.size;

    // Compute Global Carbon Offset for the tree planting progress
    const localTotalSaved = globalFeed.reduce((acc, p) => acc + (p.co2Saved || 0), 0);
    const baseCO2 = 824.5;
    const totalGlobalCO2 = parseFloat((baseCO2 + localTotalSaved).toFixed(1));

    // Track-specific theme colors
    const trackData = TRACK_DATA[track];
    const tc = trackData.themeColor;   // e.g. '#9FD356' / '#3C91E6' / '#FF9F1C'
    const tl = trackData.lightColor;   // light bg variant
    const heroGrad = track === 'veg'
      ? 'from-[#E8F5D8]'
      : track === 'plastic'
      ? 'from-[#DAEEFF]'
      : 'from-[#FFF0D0]';

    return (
      <div className="flex flex-col min-h-full bg-white-main relative">
        {dashboardGuideStep !== null && (
          <div className="absolute inset-0 bg-black/60 z-20 pointer-events-auto rounded-b-[40px] rounded-t-none" />
        )}
        <div className={`bg-gradient-to-b ${heroGrad} to-white-main px-6 pt-10 pb-8 rounded-b-[40px] shadow-sm relative`}>
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-2xl font-black text-text-main flex items-center gap-2 tracking-tight text-left">
                你好，探險家 <motion.span animate={{ rotate: [0, 20, 0] }} transition={{ repeat: Infinity, duration: 2 }}>👋</motion.span>
              </h2>
              <p className="text-sm text-text-sub font-medium opacity-80 text-left">一起讓世界變得更好！</p>
              <button 
                onClick={() => {
                  setTutorialSlide(0);
                  setShowTutorialModal(true);
                }}
                className="mt-2.5 bg-white/85 hover:bg-white text-text-main font-black px-3 py-1.5 rounded-full text-[10px] shadow-sm border border-gray-line/50 flex items-center gap-1 btn-active transition-all"
              >
                <span>💡 玩法教學</span>
              </button>
            </div>
            <div className="flex items-center gap-2.5">
              {/* Bell Notification Button */}
              <button
                onClick={() => handleNav('notifications')}
                className="relative p-2.5 text-text-sub hover:text-text-main transition-all bg-white hover:bg-gray-50 rounded-full border border-gray-line/50 shadow-sm flex items-center justify-center shrink-0 btn-active animate-fade-in"
              >
                <Bell className="w-5.5 h-5.5 text-text-main" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center border border-white shadow-md animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>

              <motion.div 
                onClick={() => handleNav('profile')}
                whileHover={{ scale: 1.05 }}
                className="w-14 h-14 rounded-full bg-white shadow-lg p-1 overflow-hidden border-2 cursor-pointer shrink-0"
                style={{ borderColor: tc }}
              >
                <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${state.customAvatarSeed || state.track || 'anon'}&backgroundColor=transparent`} alt="Avatar" />
              </motion.div>
            </div>
          </div>

          {/* Global Forest Progress Bar Widget */}
          <div 
            data-guide="forest-card"
            className={cn(
              "mb-6 bg-gradient-to-r from-emerald-800 to-emerald-950 rounded-[28px] p-5 text-white shadow-float relative overflow-hidden border border-emerald-700/30 transition-all duration-300",
              dashboardGuideStep === 1 ? "z-30 ring-4 ring-green-400" : "z-10"
            )}
          >
            {/* Background elements */}
            <div className="absolute right-[-20px] bottom-[-20px] text-8xl opacity-15 select-none pointer-events-none">🌳</div>
            <div className="relative z-10 text-left">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[9px] font-black tracking-widest bg-emerald-700/60 text-emerald-200 px-2 py-0.5 rounded-full uppercase">
                  🌳 全站綠色造林計畫
                </span>
                <span className="text-[10px] font-black text-emerald-300">
                  已種植 {Math.floor(totalGlobalCO2 / 200)} 棵實體樹
                </span>
              </div>
              <h3 className="text-sm font-black tracking-tight leading-snug mb-2.5">
                全站累計減碳 {totalGlobalCO2} kg
              </h3>
              
              {/* Progress Bar Container */}
              <div className="w-full bg-emerald-950/60 rounded-full h-3 p-0.5 border border-emerald-800/40 mb-2">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${((totalGlobalCO2 % 200) / 200) * 100}%` }}
                  transition={{ type: 'spring', damping: 15 }}
                  className="bg-gradient-to-r from-green-light to-emerald-400 h-full rounded-full"
                />
              </div>
              
              <p className="text-[9px] text-emerald-200/90 font-medium">
                還差 <span className="font-black text-white">{(200 - (totalGlobalCO2 % 200)).toFixed(1)} kg</span> 減碳量，慈心就會在地球為大家種下第 <span className="font-black text-white">{Math.floor(totalGlobalCO2 / 200) + 1}</span> 棵真樹！
              </p>
            </div>
          </div>

          {/* Inline Step 1 Tooltip */}
          {dashboardGuideStep === 1 && (
            <div className="mb-6 bg-white text-text-main p-5 rounded-3xl shadow-2xl z-30 border-2 border-green-main flex flex-col gap-3 relative animate-bounce-slow text-left">
              <h4 className="font-black text-sm text-green-main flex items-center gap-1.5">
                <span>🌲 第一步：認識公益造林目標</span>
              </h4>
              <p className="text-xs text-text-sub font-semibold leading-relaxed">
                這是我們大家的共同目標！每當我們累積減碳達 <strong>200 kg</strong>，慈心就會在地球為大家種下一棵實體真樹！一起加油！🌲
              </p>
              <button
                onClick={() => {
                  playSound('click');
                  setDashboardGuideStep(2);
                }}
                className="bg-green-main text-white font-black py-2.5 rounded-xl text-xs btn-active flex items-center justify-center gap-1"
              >
                <span>我知道了，下一個說明 ➔</span>
              </button>
            </div>
          )}

          {/* Quick Track Switcher (Senior Friendly) */}
          <div 
            data-guide="switcher-card"
            className={cn(
              "mb-6 bg-white/95 backdrop-blur-md rounded-[28px] p-4.5 shadow-soft border border-gray-line/40 flex items-center justify-between gap-4 transition-all duration-300",
              dashboardGuideStep === 2 ? "z-30 ring-4 ring-green-400 relative" : "z-10"
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center text-3xl shrink-0 shadow-inner-soft",
                track === 'veg' ? "bg-green-light animate-pulse-slow" : track === 'plastic' ? "bg-blue-light animate-pulse-slow" : "bg-gradient-to-br from-green-light to-blue-light animate-pulse-slow"
              )}>
                {track === 'veg' ? '🥗' : track === 'plastic' ? '💧' : '🌍'}
              </div>
              <div>
                <div className="text-[10px] font-black text-text-sub/80 uppercase tracking-widest">目前挑戰路線</div>
                <div className="text-base font-black text-text-main leading-tight mt-0.5">
                  {track === 'veg' ? '🌱 蔬食低碳' : track === 'plastic' ? '🌊 海岸淨塑' : '🌍 雙軌並進'}
                </div>
              </div>
            </div>
            <motion.button 
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut" }}
              onClick={() => {
                playSound('click');
                setShowTrackSwitcherModal(true);
              }}
              className="text-white hover:bg-black font-black px-4.5 py-3 rounded-2xl text-xs flex items-center gap-1.5 shadow-md btn-active shrink-0 transition-all"
              style={{ backgroundColor: tc }}
            >
              <span>切換路線</span>
              <RefreshCw className="w-3.5 h-3.5" />
            </motion.button>
          </div>

          {/* Inline Step 2 Tooltip */}
          {dashboardGuideStep === 2 && (
            <div className="mb-6 bg-white text-text-main p-5 rounded-3xl shadow-2xl z-30 border-2 border-green-main flex flex-col gap-3 relative animate-bounce-slow text-left">
              <h4 className="font-black text-sm text-green-main flex items-center gap-1.5">
                <span>🔄 第二步：隨時切換挑戰路線</span>
              </h4>
              <p className="text-xs text-text-sub font-semibold leading-relaxed">
                這是你目前的挑戰路線。如果你想體驗其他路線（例如蔬食或淨塑），點選「<strong>切換路線</strong>」按鈕就能隨時切換，所有進度都會自動為你保留喔！
              </p>
              <button
                onClick={() => {
                  playSound('click');
                  setDashboardGuideStep(3);
                }}
                className="bg-green-main text-white font-black py-2.5 rounded-xl text-xs btn-active flex items-center justify-center gap-1"
              >
                <span>我知道了，下一個說明 ➔</span>
              </button>
            </div>
          )}

          {/* Level Card */}
          <div id="tutorial-step1-card" className="bg-white rounded-3xl p-5 shadow-float mb-8 border border-white">
            <div className="flex justify-between items-end mb-3">
              <div className="flex items-center gap-2">
                <div className="text-white text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider" style={{ backgroundColor: tc }}>
                  Lv.{lv}
                </div>
                <span className="font-bold text-text-main text-sm">{(TITLES_BY_TRACK[track] ?? TITLES)[lv - 1]}</span>
              </div>
              <div className="text-[11px] font-bold text-text-sub/70">
                <span className="font-black underline decoration-2 underline-offset-4" style={{ color: tc }}>{state.exp}</span> / {expReq} EXP
              </div>
            </div>
            <div className="bg-gray-line rounded-full h-3 overflow-hidden shadow-inner-soft">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(progress, 100)}%` }}
                className="h-full rounded-full"
                style={{ backgroundColor: tc }}
              />
            </div>
          </div>
          
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <StatCard icon={<Leaf className="w-4 h-4" />} color="green" label="完成關卡" value={state.level - 1} />
            <StatCard icon={<Cloud className="w-4 h-4" />} color="blue" label="減碳量 (kg)" value={state.co2Saved.toFixed(1)} />
            <StatCard icon={<Flame className="w-4 h-4" />} color="orange" label="連續打卡" value={`${state.streak}天`} />
            <StatCard icon={<Users className="w-4 h-4" />} color="cyan" label="影響夥伴" value={influencePartners} />
          </div>

          {state.co2Saved > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-[10px] font-black bg-green-light/40 border border-green-main/10 text-green-main p-3.5 rounded-2xl flex items-start gap-2 leading-relaxed shadow-sm"
            >
              <span className="text-xs shrink-0 mt-0.5">🌲</span>
              <span>
                累計減碳成果相當於種植了 <strong className="underline decoration-2">{(state.co2Saved * 0.08).toFixed(2)} 棵樹</strong> 一整年吸收的 CO₂ 量，或減少駕駛燃油車行駛 <strong className="underline decoration-2">{(state.co2Saved * 5.2).toFixed(1)} 公里</strong> 喔！謝謝你為地球做出的努力！💚
              </span>
            </motion.div>
          )}
        </div>

        <div className="px-6 py-8">
          {/* Current Task or Complete Celebration */}
          {state.unlockedBadges.includes(`${track}_complete`) ? (
            <motion.div 
              whileHover={{ scale: 1.02 }}
              className="bg-white rounded-[32px] p-6 shadow-soft relative overflow-hidden group border-l-[6px]"
              style={{ borderColor: tc }}
            >
              <div className="absolute -right-6 -top-6 text-8xl opacity-[0.03] group-hover:scale-110 transition-transform">🏆</div>
              <span className="text-[10px] font-black px-3 py-1.5 rounded-xl mb-3 inline-block uppercase tracking-widest bg-yellow-100 text-yellow-600">
                榮譽里程碑
              </span>
              <h3 className="font-black text-xl text-text-main mb-1 tracking-tight">
                {track === 'dual' ? "恭喜達成最高榮耀【永續守護神】！ 👑✨" : `恭喜完成${track === 'veg' ? '蔬食' : '淨塑'}任務！✨`}
              </h3>
              <p className="text-[13px] text-text-sub mb-6 leading-relaxed font-medium">
                {track === 'dual' 
                  ? "恭喜您已成功集滿所有挑戰軌道的徽章，榮登永續金榜！點選下方連結，領取您專屬的永續守護神榮譽證書！"
                  : "您已成功集滿本軌道的所有關卡徽章！建議檢視證書或挑戰其他軌道，集齊全部徽章解鎖終極榮耀【永續守護神】吧！"
                }
              </p>
              <div className="flex flex-col gap-2">
                {track === 'dual' ? (
                  <button 
                    onClick={() => setShowRewardModal('dual')} 
                    className="w-full text-white font-black py-4 rounded-2xl text-sm btn-active flex items-center justify-center gap-2 shadow-lg hover:scale-[0.98] transition-transform"
                    style={{ backgroundColor: tc }}
                  >
                    🎓 領取永續守護神證書
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={() => setShowRewardModal(track)} 
                      className="w-full bg-white border border-gray-line text-text-main font-black py-4 rounded-2xl text-sm btn-active flex items-center justify-center gap-2 shadow-sm"
                    >
                      🎓 檢視本軌道證書
                    </button>
                    <button 
                      onClick={() => {
                        playSound('click');
                        setTempTrack(track);
                        setCurrentView('select');
                      }} 
                      className="w-full text-white font-black py-4 rounded-2xl text-sm btn-active flex items-center justify-center gap-2"
                      style={{ backgroundColor: tc }}
                    >
                      挑戰其他軌道 <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}

                {/* Daily Endless Quest Card */}
                <div className="mt-6 border-t border-dashed border-gray-line pt-6 text-left">
                  <span className="text-[10px] font-black px-3 py-1.5 rounded-xl mb-3 inline-block uppercase tracking-widest bg-purple-100 text-purple-600 animate-pulse-slow">
                    🌟 本日隨機修行
                  </span>
                  <div className="bg-[#F9F7FF] rounded-2xl p-4 border border-[#8B5CF6]/15 flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-[#ECE7FF] flex items-center justify-center text-2xl shrink-0">
                      {getDailyTask().icon}
                    </div>
                    <div>
                      <h4 className="font-black text-sm text-text-main leading-tight mb-1">{getDailyTask().title}</h4>
                      <p className="text-[11px] text-text-sub font-semibold leading-normal">{getDailyTask().desc}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => {
                      playSound('click');
                      setCurrentView('checkin');
                    }}
                    className="w-full mt-3 bg-[#8B5CF6] hover:bg-[#7c4ee4] text-white font-black py-3.5 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-md btn-active transition-transform"
                  >
                    <span>實踐打卡此任務 (+20 EXP)</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              whileHover={{ scale: 1.02 }}
              data-guide="task-card"
              className={cn(
                "bg-white rounded-[32px] p-6 shadow-soft relative overflow-hidden group border-l-[6px] transition-all duration-300",
                dashboardGuideStep === 3 ? "z-30 ring-4 ring-green-main" : "z-10"
              )}
              style={{ borderColor: tc }}
            >
              <div className="absolute -right-6 -top-6 text-8xl opacity-[0.03] group-hover:scale-110 transition-transform">🎯</div>
              <span className="text-[10px] font-black px-3 py-1.5 rounded-xl mb-3 inline-block uppercase tracking-widest" style={{ backgroundColor: tl, color: tc }}>
                主線任務
              </span>
              <h3 className="font-black text-xl text-text-main mb-1 tracking-tight">
                關卡{['一','二','三','四'][currentTaskData.id-1]}：{currentTaskData.title}
              </h3>
              <p className="text-[13px] text-text-sub mb-6 leading-relaxed font-medium">
                {currentTaskData.desc}
              </p>
              <motion.button 
                animate={{ scale: [1, 1.02, 1] }}
                transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                onClick={() => {
                  playSound('click');
                  handleNav('map');
                }} 
                className="w-full text-white font-black py-4 rounded-2xl text-sm btn-active flex items-center justify-center gap-2 shadow-md"
                style={{ backgroundColor: tc }}
              >
                前往挑戰地圖 <ChevronRight className="w-4 h-4" />
              </motion.button>
            </motion.div>
          )}

          {/* Inline Step 3 Tooltip */}
          {dashboardGuideStep === 3 && (
            <div className="mt-4 bg-white text-text-main p-5 rounded-3xl shadow-2xl z-30 border-2 border-[#9FD356] flex flex-col gap-3 relative animate-bounce-slow text-left">
              <h4 className="font-black text-sm text-green-main flex items-center gap-1.5">
                <span>🎯 第三步：點選挑戰關卡</span>
              </h4>
              <p className="text-xs text-text-sub font-semibold leading-relaxed">
                這裡是您的主線任務與目前關卡。點選「<strong>前往挑戰地圖</strong>」按鈕，就可以進入地圖開啟第一個日常環保實踐打卡囉！
              </p>
              <button
                onClick={() => {
                  playSound('success');
                  setDashboardGuideStep(null);
                  localStorage.setItem(`seen_db_guide_${state.track}`, 'true');
                }}
                className="bg-text-main text-white font-black py-2.5 rounded-xl text-xs btn-active flex items-center justify-center gap-1"
              >
                <span>我知道了，完成教學 🎉</span>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderMapView = () => {
    const track = state.track || 'veg';
    const data = TRACK_DATA[track];
    const tasks = data.tasks;
    const isTrackCompleted = state.unlockedBadges.includes(`${track}_complete`);
    const tc = data.themeColor;
    const tl = data.lightColor;
    const showFirstLevelGuide = state.level === 1 && state.checkInCount === 0 && selectedMapTaskIndex === null;

    let progressPercent = 0;
    if (isTrackCompleted) {
      progressPercent = 100;
    } else {
      if (state.level === 1) progressPercent = 12;
      else if (state.level === 2) progressPercent = 38;
      else if (state.level === 3) progressPercent = 64;
      else progressPercent = 90;
    }

    return (
      <div 
        className="flex flex-col min-h-full relative transition-all duration-300" 
        style={{ 
          backgroundColor: data.bg,
          backgroundImage: `url(${
            track === 'veg' ? 'veg_map_bg.png' :
            track === 'plastic' ? 'plastic_map_bg.png' :
            'dual_map_bg.png'
          })`,
          backgroundSize: '100% auto',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center top'
        }}
      >
        {/* Dim background spotlight overlay */}
        {showFirstLevelGuide && (
          <div className="absolute inset-0 bg-black/45 z-25 transition-opacity duration-300 pointer-events-none" />
        )}

        <div className="sticky top-0 z-20 px-6 py-6 bg-white/80 backdrop-blur-xl border-b border-gray-line/50 flex items-center justify-between">
          <h2 className="text-xl font-black text-text-main tracking-tight">
            {track === 'veg' ? '田園闖關地圖' : track === 'plastic' ? '海岸淨塑地圖' : '雙軌冒險地圖'}
          </h2>
          <div className="text-[10px] font-black bg-text-main text-white px-3 py-1.5 rounded-full uppercase tracking-widest">
            {state.level} / 4
          </div>
        </div>
        
        <div className="px-6 py-12 relative flex flex-col gap-20" style={{ paddingBottom: 'calc(9rem + env(safe-area-inset-bottom, 0px))' }}>

          {tasks.slice().reverse().map((task, reverseIdx) => {
            const idx = 3 - reverseIdx;
            const status = idx + 1 < state.level ? 'done' : idx + 1 === state.level ? 'active' : 'locked';
            const isLevel1Node = idx === 0;
            const isGuideActive = showFirstLevelGuide && isLevel1Node;
            
            // Dynamically position node based on the S-curve paths in the uploaded backgrounds.
            // plastic is reversed compared to veg and dual.
            const isLeft = track === 'plastic' ? idx % 2 !== 0 : idx % 2 === 0;

            return (
              <motion.div 
                key={task.id}
                data-guide={status === 'active' ? "active-level-node" : undefined}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                whileHover={status !== 'locked' ? { scale: 1.04 } : {}}
                whileTap={status !== 'locked' ? { scale: 0.92 } : {}}
                viewport={{ once: true }}
                className={cn(
                  "relative flex items-center cursor-pointer",
                  isGuideActive ? "z-30" : "z-10",
                  isLeft ? "justify-start pl-[16%] md:pl-[20%]" : "justify-end pr-[16%] md:pr-[20%]"
                )}
                onClick={() => {
                  playSound('click');
                  setSelectedMapTaskIndex(idx);
                }}
              >
                <div className={cn(
                  "flex items-center gap-6",
                  isLeft ? "flex-row" : "flex-row-reverse text-right"
                )}>
                  <div
                    className={cn(
                      "w-20 h-20 rounded-full bg-white flex items-center justify-center text-3xl shadow-float border-4 relative transition-all duration-500",
                      status === 'active' ? `${track === 'plastic' ? 'pulse-glow-blue' : track === 'dual' ? 'pulse-glow-yellow' : 'pulse-glow'} scale-110` :
                      status === 'locked' ? "border-gray-line grayscale opacity-60" : ""
                    )}
                    style={status !== 'locked' ? { borderColor: data.themeColor } : undefined}
                  >
                    {task.icon}
                    {isGuideActive && (
                      <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 bg-white text-text-main text-xs font-black px-4 py-2.5 rounded-2xl shadow-xl whitespace-nowrap border-2 border-text-main flex items-center gap-1.5 animate-bounce z-40">
                        <span>💡 點選這裡開啟第一個挑戰！</span>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-white" />
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-text-main -z-10 translate-y-[2px]" />
                      </div>
                    )}
                    {status === 'done' && (
                      <div
                        className="absolute -bottom-1 -right-1 w-7 h-7 text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white"
                        style={{ backgroundColor: data.themeColor }}
                      >
                        <Check className="w-4 h-4 stroke-[4]" />
                      </div>
                    )}
                    {status === 'locked' && (
                      <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-gray-lock text-white rounded-full flex items-center justify-center shadow-lg border-2 border-white">
                        <Lock className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>
                  
                  <div className="bg-white/90 backdrop-blur-md p-4 rounded-3xl shadow-soft border border-gray-line max-w-[160px]">
                    <div className={cn(
                      "text-[9px] font-black uppercase tracking-[0.15em] mb-1.5",
                      status === 'locked' ? 'text-gray-lock' : `text-[${data.themeColor}]`
                    )}>
                      關卡{['一','二','三','四'][idx]}・{task.title}
                    </div>
                    <div className="text-[13px] font-black text-text-main leading-snug">
                      {task.desc}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
          {/* Spacer so level 1 is always scrollable above nav bar */}
          <div className="h-20 shrink-0" />
        </div>

        {/* Level Detail Bottom Sheet */}
        <AnimatePresence>
          {selectedMapTaskIndex !== null && (
            <>
              {/* Dark backdrop overlay */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedMapTaskIndex(null)}
                className="fixed inset-0 bg-black/40 z-50 max-w-[400px] mx-auto"
              />
              
              {/* Slide up Bottom Sheet */}
              <motion.div 
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[400px] bg-white rounded-t-[40px] shadow-float p-8 z-[60] border-t border-gray-line/50 pb-[calc(2.5rem+env(safe-area-inset-bottom,0px))]"
              >
                {/* Visual drag indicator */}
                <div className="w-12 h-1.5 bg-gray-line/60 rounded-full mx-auto mb-6" />

                {/* Close Button */}
                <button 
                  onClick={() => setSelectedMapTaskIndex(null)}
                  className="absolute top-6 right-6 p-2 text-text-sub hover:text-text-main transition-colors bg-gray-line/30 rounded-full"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                <div className="flex justify-between items-center mb-4">
                  <span className={cn(
                    "text-[10px] font-black uppercase tracking-[0.2em]",
                    track === 'veg' ? 'text-green-main' : track === 'plastic' ? 'text-blue-main' : 'text-[#FF9F1C]'
                  )}>
                    關卡 {['一','二','三','四'][selectedMapTaskIndex]}・{tasks[selectedMapTaskIndex].title}
                  </span>
                  
                  {/* Status Badge */}
                  {selectedMapTaskIndex + 1 < state.level ? (
                    <span className="text-[10px] font-black bg-green-light text-green-main border border-green-main/20 px-3 py-1.5 rounded-full flex items-center gap-1">已完成 ✅</span>
                  ) : selectedMapTaskIndex + 1 === state.level ? (
                    <span className="text-[10px] font-black bg-orange-100 text-[#FF9F1C] border border-orange-200 px-3 py-1.5 rounded-full flex items-center gap-1">挑戰中 ⚡</span>
                  ) : (
                    <span className="text-[10px] font-black bg-gray-line/50 text-gray-lock px-3 py-1.5 rounded-full flex items-center gap-1">尚未解鎖 🔒</span>
                  )}
                </div>

                <h3 className="font-black text-base text-text-main mb-6 leading-relaxed">
                  {tasks[selectedMapTaskIndex].fullDesc}
                </h3>

                {selectedMapTaskIndex + 1 === state.level ? (
                  <button 
                    onClick={() => {
                      setSelectedMapTaskIndex(null);
                      handleNav('checkin');
                    }} 
                    className="w-full text-white font-black py-4 rounded-2xl text-sm btn-active shadow-lg flex items-center justify-center gap-2 hover:scale-[0.98] transition-transform"
                    style={{ backgroundColor: tc, boxShadow: `0 10px 15px -3px ${tc}33` }}
                  >
                    立即打卡行動 <Camera className="w-4 h-4" />
                  </button>
                ) : selectedMapTaskIndex + 1 < state.level ? (
                  <div 
                    className="w-full font-black py-4 rounded-2xl text-sm text-center border shadow-sm flex items-center justify-center gap-2"
                    style={{ backgroundColor: tl, color: tc, borderColor: `${tc}20` }}
                  >
                    你已經順利完成了此關卡！✨
                  </div>
                ) : (
                  <div className="w-full bg-gray-line/40 text-gray-lock font-black py-4 rounded-2xl text-sm text-center border border-gray-line/50 flex items-center justify-center gap-1">
                    完成前一關即可解鎖此任務 🔒
                  </div>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderCheckinView = () => {
    const track = state.track || 'veg';
    const isTrackCompleted = state.unlockedBadges.includes(`${track}_complete`);
    const data = TRACK_DATA[track];
    const dailyTask = getDailyTask();
    const task = isTrackCompleted 
      ? { 
          id: 5, 
          title: dailyTask.title, 
          desc: dailyTask.desc, 
          fullDesc: dailyTask.fullDesc, 
          icon: dailyTask.icon, 
          placeholder: '例如：今天完成了這個每日隨機挑戰！實踐了「' + dailyTask.title + '」，心裡感覺非常富足安祥，很有成就感！', 
          checklist: dailyTask.checklist 
        }
      : data.tasks[Math.min(state.level - 1, 3)];

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setCheckinSelectedFile(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setCheckinPreviewUrl(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    };

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (checkinIsUploading) return;
      
      setCheckinIsUploading(true);
      
      try {
        const oldRankLv = currentLevel;
        const amount = 20;
        let newExp = state.exp + amount;
        let newLevel = state.level;
        let newCo2Count = state.co2Saved;
        let newStreak = state.streak;
        let mapUp = false;

        // Stats calculation
        if (isTrackCompleted) {
          newCo2Count += dailyTask.co2Saved;
        } else {
          if (track === 'veg' || track === 'dual') newCo2Count += 0.8;
          if (track === 'plastic' || track === 'dual') newCo2Count += 0.5;
        }
        
        const today = new Date().toDateString();
        if (state.lastCheckInDate !== today) {
          newStreak += 1;
        }

        // Advance to next task (level) after every check-in
        const totalChecks = state.checkInCount + 1;
        if (!isTrackCompleted && state.level < 4) {
          newLevel += 1;
          newExp += 50; 
          mapUp = true;
        }

        // Badges check (New Logic)
        const newlyUnlocked: Badge[] = [];
        const newBadges = [...state.unlockedBadges];
        const newBadgeUnlockDates = { ...state.badgeUnlockDates };
        
        // 1. Check Level Badges
        const currentLevelBadgeId = `${track}_${Math.min(state.level, 4)}`;
        if (!newBadges.includes(currentLevelBadgeId)) {
          newBadges.push(currentLevelBadgeId);
          newBadgeUnlockDates[currentLevelBadgeId] = new Date().toISOString();
          const b = BADGES.find(b => b.id === currentLevelBadgeId);
          if (b) newlyUnlocked.push(b);
        }

        // 2. Check Track Completion Badge
        const trackLevelBadges = BADGES.filter(b => b.track === track && b.type === 'levelBadge');
        const hasAllTrackBadges = trackLevelBadges.every(b => newBadges.includes(b.id));
        const completeBadgeId = `${track}_complete`;
        
        if (hasAllTrackBadges && !newBadges.includes(completeBadgeId)) {
          newBadges.push(completeBadgeId);
          newBadgeUnlockDates[completeBadgeId] = new Date().toISOString();
          const b = BADGES.find(b => b.id === completeBadgeId);
          if (b) newlyUnlocked.push(b);
        }

        // 1. Upload image if exists (Bypass Firebase Storage using Base64)
        let imageUrl = '';
        if (checkinSelectedFile) {
          try {
            console.log('Compressing image to Base64...');
            imageUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                  const canvas = document.createElement('canvas');
                  const MAX_WIDTH = 800;
                  const MAX_HEIGHT = 800;
                  let width = img.width;
                  let height = img.height;

                  if (width > height) {
                    if (width > MAX_WIDTH) {
                      height *= MAX_WIDTH / width;
                      width = MAX_WIDTH;
                    }
                  } else {
                    if (height > MAX_HEIGHT) {
                      width *= MAX_HEIGHT / height;
                      height = MAX_HEIGHT;
                    }
                  }
                  canvas.width = width;
                  canvas.height = height;
                  const ctx = canvas.getContext('2d');
                  ctx?.drawImage(img, 0, 0, width, height);
                  // Compress aggressively to stay well under Firestore 1MB limit
                  const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                  resolve(dataUrl);
                };
                img.onerror = reject;
                img.src = event.target?.result as string;
              };
              reader.onerror = reject;
              reader.readAsDataURL(checkinSelectedFile);
            });
            console.log('Image compressed successfully.');
          } catch (uploadErr: any) {
            console.error('Image compression failed:', uploadErr);
            const proceed = confirm('照片處理失敗，是否要【不附照片】直接完成打卡？');
            if (!proceed) return;
          }
        }

        // 2. Prepare updates & save in parallel
        const updates: Partial<AppState> = {
          exp: newExp,
          level: newLevel,
          checkInCount: totalChecks,
          co2Saved: newCo2Count,
          streak: newStreak,
          lastCheckInDate: today,
          unlockedBadges: newBadges,
          badgeUnlockDates: newBadgeUnlockDates
        };

        console.log('Saving checkin record and updating state in parallel...');
        await Promise.all([
          addDoc(collection(db, 'checkins'), {
            userId: user?.uid,
            userName: state.customDisplayName || user?.displayName || '匿名探險家',
            userAvatar: state.customAvatarSeed || track || 'anon',
            track,
            level: state.level, // The level they just completed
            text: checkinText,
            imageUrl,
            checklistItems: checkinSelectedOptions,
            timestamp: serverTimestamp(),
            expGained: amount + (mapUp ? 50 : 0),
            likes: 0
          }),
          updateFirebaseState(updates)
        ]);

        // Reset checkin form state
        setCheckinText('');
        setCheckinSelectedFile(null);
        setCheckinPreviewUrl(null);
        setCheckinSelectedOptions([]);

        // 4. Trigger UI
        const nextRankLv = calculateLevel(newExp, LEVELS_EXP_REQ);
        setIsRankLeveledUp(oldRankLv < nextRankLv);
        setIsMapLeveledUp(mapUp);
        
        if (oldRankLv < nextRankLv || mapUp) {
          playSound('levelup');
        } else if (newlyUnlocked.length > 0) {
          playSound('unlock');
        } else {
          playSound('success');
        }
        
        if (newlyUnlocked.length > 0) {
          setNewUnlockedBadges(newlyUnlocked);
          // Modals will handle navigation after closing
        } else {
          // If no badge unlocked, just normal success toast
          alert(`打卡成功！獲得 ${amount + (mapUp ? 50 : 0)} EXP！`);
          setCurrentView('feed');
        }
        console.log('Daily checkin complete!');

      } catch (err) {
        console.error('Checkin process failed:', err);
        alert('打卡過程發生錯誤：\n這通常是因為資料庫/圖片庫尚未開通「測試模式 (Test mode)」，請確認您已在 Firebase 開通 Firestore 與 Storage。');
      } finally {
        setCheckinIsUploading(false);
      }
    };

    const allTrackThemes: Record<string, { bg: string; badge: string; iconBg: string; title: string; shadow: string; }[]> = {
      veg: [
        { bg: 'from-[#FAFFFD] to-white bg-green-light border-green-main/30', badge: 'bg-green-main/10 text-green-main', iconBg: 'bg-green-light border-green-main/10', title: '階段一：察覺觀察', shadow: 'shadow-[0_8px_30px_rgba(159,211,86,0.12)]' },
        { bg: 'from-[#E8F5D8] to-white border-[#84C318]/30', badge: 'bg-[#84C318]/10 text-[#84C318]', iconBg: 'bg-[#E8F5D8] border-[#84C318]/10', title: '階段二：踏出選擇', shadow: 'shadow-[0_8px_30px_rgba(132,195,24,0.12)]' },
        { bg: 'from-[#D4EEB8] to-white border-green-main/40', badge: 'bg-green-main/15 text-green-main', iconBg: 'bg-[#D4EEB8] border-green-main/20', title: '階段三：深化實踐', shadow: 'shadow-[0_8px_30px_rgba(159,211,86,0.18)]' },
        { bg: 'from-[#C8E8A8] to-white border-green-main/50', badge: 'bg-green-main/20 text-green-main', iconBg: 'bg-[#C8E8A8] border-green-main/30', title: '階段四：擴散影響', shadow: 'shadow-[0_8px_30px_rgba(159,211,86,0.22)]' }
      ],
      plastic: [
        { bg: 'from-[#F0F8FF] to-white border-blue-main/20', badge: 'bg-blue-main/8 text-blue-main', iconBg: 'bg-[#F0F8FF] border-blue-main/10', title: '階段一：察覺觀察', shadow: 'shadow-[0_8px_30px_rgba(60,145,230,0.10)]' },
        { bg: 'from-[#E1EEFA] to-white border-blue-main/30', badge: 'bg-blue-main/10 text-blue-main', iconBg: 'bg-blue-light border-blue-main/10', title: '階段二：踏出選擇', shadow: 'shadow-[0_8px_30px_rgba(60,145,230,0.14)]' },
        { bg: 'from-[#CCDFF5] to-white border-blue-main/40', badge: 'bg-blue-main/15 text-blue-main', iconBg: 'bg-[#CCDFF5] border-blue-main/20', title: '階段三：深化實踐', shadow: 'shadow-[0_8px_30px_rgba(60,145,230,0.18)]' },
        { bg: 'from-[#B8D2EE] to-white border-blue-main/50', badge: 'bg-blue-main/20 text-blue-main', iconBg: 'bg-[#B8D2EE] border-blue-main/30', title: '階段四：擴散影響', shadow: 'shadow-[0_8px_30px_rgba(60,145,230,0.22)]' }
      ],
      dual: [
        { bg: 'from-[#FFFDF0] to-white border-[#FF9F1C]/20', badge: 'bg-[#FF9F1C]/8 text-[#c07800]', iconBg: 'bg-[#FFFDF0] border-[#FF9F1C]/10', title: '階段一：察覺觀察', shadow: 'shadow-[0_8px_30px_rgba(255,159,28,0.10)]' },
        { bg: 'from-[#FFF0D0] to-white border-[#FF9F1C]/30', badge: 'bg-[#FF9F1C]/10 text-[#b06800]', iconBg: 'bg-[#FFF0D0] border-[#FF9F1C]/15', title: '階段二：踏出選擇', shadow: 'shadow-[0_8px_30px_rgba(255,159,28,0.14)]' },
        { bg: 'from-[#FFE5A8] to-white border-[#FF9F1C]/40', badge: 'bg-[#FF9F1C]/15 text-[#985800]', iconBg: 'bg-[#FFE5A8] border-[#FF9F1C]/20', title: '階段三：深化實踐', shadow: 'shadow-[0_8px_30px_rgba(255,159,28,0.18)]' },
        { bg: 'from-[#FFD880] to-white border-[#FF9F1C]/50', badge: 'bg-[#FF9F1C]/20 text-[#7d4800]', iconBg: 'bg-[#FFD880] border-[#FF9F1C]/30', title: '階段四：擴散影響', shadow: 'shadow-[0_8px_30px_rgba(255,159,28,0.22)]' }
      ]
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const levelThemesVeg = allTrackThemes.veg;
    const levelThemes = allTrackThemes[track] ?? allTrackThemes.veg;
    const endlessTheme = {
      bg: 'from-[#ECE7FF] to-white border-[#8B5CF6]/30 bg-[#F9F7FF]', 
      badge: 'bg-[#8B5CF6]/10 text-[#8B5CF6]', 
      iconBg: 'bg-[#ECE7FF] border-[#8B5CF6]/10', 
      title: '🌟 每日隨機修煉', 
      shadow: 'shadow-[0_8px_30px_rgba(139,92,246,0.12)]'
    };
    const theme = isTrackCompleted ? endlessTheme : (levelThemes[Math.min(state.level - 1, 3)] || levelThemes[0]);

    return (
      <div className="px-6 py-8 min-h-full flex flex-col pt-12 relative">
        {checkinGuideStep !== null && (
          <div className="absolute inset-0 bg-black/45 z-25 pointer-events-auto rounded-b-[40px] rounded-t-none" />
        )}
        <h2 className="text-2xl font-black text-text-main mb-8 flex items-center gap-2 tracking-tight">
          打卡任務 <span className="text-3xl">📸</span>
        </h2>
        
        <div className={cn(
          "bg-gradient-to-br rounded-[32px] p-6 mb-8 border relative overflow-hidden flex flex-col gap-4.5 transition-all duration-500",
          theme.bg,
          theme.shadow
        )}>
          <div className="absolute right-[-15%] bottom-[-15%] text-9xl opacity-[0.06] transform rotate-12 select-none pointer-events-none">✨</div>
          
          <div className="flex items-center gap-4">
            <div className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shrink-0 shadow-sm border border-white/60",
              theme.iconBg
            )}>
              {task.icon}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn(
                  "text-[11px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider",
                  theme.badge
                )}>
                  第 {['一','二','三','四'][state.level-1]} 關
                </span>
                <span className="text-[10px] font-black text-text-sub uppercase tracking-widest opacity-80">
                  {theme.title}
                </span>
              </div>
              <h4 className="font-black text-text-main text-base mt-1.5 tracking-tight">
                任務目標：{task.title}
              </h4>
            </div>
          </div>

          <div className="h-[1px] bg-black/5 w-full my-0.5"></div>

          <div>
            <h3 className="font-black text-text-main text-lg mb-2.5 leading-snug">
              {task.fullDesc}
            </h3>
            <p className="text-[12px] text-text-sub font-semibold leading-relaxed">
              💡 點擊下方輸入框，我們已為你填入這一關的打卡實用範例囉，隨時都可以修改成你的真實體驗！
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
          {task.checklist && task.checklist.length > 0 && (
            <div 
              data-guide="checkin-checklist"
              id="tutorial-step5-checklist" 
              className={cn(
                "mb-6 bg-white border border-gray-line p-5 rounded-3xl shadow-soft transition-all duration-300",
                checkinGuideStep === 1 ? "z-30 ring-4 ring-green-main relative" : ""
              )}
            >
              <label className="block text-xs font-black text-text-sub uppercase tracking-wider mb-3">
                📋 關卡實踐項目（請勾選至少一項）
              </label>
              <div className="space-y-3">
                {task.checklist.map((item, idx) => {
                  const isChecked = checkinSelectedOptions.includes(item);
                  return (
                    <div 
                      key={idx} 
                      onClick={() => {
                        playSound('click');
                        let nextOptions = [...checkinSelectedOptions];
                        if (isChecked) {
                          nextOptions = checkinSelectedOptions.filter(o => o !== item);
                        } else {
                          nextOptions = [...checkinSelectedOptions, item];
                        }
                        setCheckinSelectedOptions(nextOptions);

                        // Auto-scroll to textarea if they select an option for the first time
                        if (!isChecked && nextOptions.length === 1) {
                          smoothScrollToElement('[data-guide="checkin-textarea"]', 'center');
                        }
                      }}
                      className={cn(
                        "flex items-center gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition-all",
                        isChecked 
                          ? "bg-gradient-to-r from-green-light/20 to-blue-light/20 border-text-main shadow-inner" 
                          : "border-gray-line bg-gray-50/50 hover:bg-gray-50"
                      )}
                    >
                      <div className={cn(
                        "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                        isChecked 
                          ? "bg-text-main border-text-main text-white" 
                          : "border-gray-lock/40 bg-white"
                      )}>
                        {isChecked && <Check className="w-3.5 h-3.5 stroke-[4]" />}
                      </div>
                      <span className={cn(
                        "text-[13px] font-black leading-tight select-none",
                        isChecked ? "text-text-main" : "text-text-sub"
                      )}>
                        {item}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div 
            data-guide="checkin-textarea"
            className={cn(
              "mb-6 transition-all duration-300",
              checkinGuideStep === 1 ? "z-30 ring-4 ring-green-main p-3 bg-white rounded-[24px] relative" : ""
            )}
          >
            <label className="block text-sm font-black text-text-main mb-3">今天做了什麼？有什麼感受？</label>
            <textarea 
              value={checkinText}
              onChange={(e) => setCheckinText(e.target.value)}
              rows={4} 
              className="w-full bg-gray-line/50 border-2 border-transparent rounded-2xl p-4 text-base focus:outline-none focus:border-green-main focus:bg-white transition-all resize-none shadow-inner-soft" 
              placeholder={task.placeholder || "例如：今天中午吃了一間很棒的素食餐廳！"} 
              required
            />
          </div>

          {/* Inline Step 1 Tooltip for Check-in */}
          {checkinGuideStep === 1 && (
            <div className="mb-6 bg-white text-text-main p-5 rounded-3xl shadow-2xl z-30 border-2 border-green-main flex flex-col gap-3 relative animate-bounce-slow text-left">
              <h4 className="font-black text-sm text-green-main flex items-center gap-1.5">
                <span>📋 第一步：勾選項目並寫下感受</span>
              </h4>
              <p className="text-xs text-text-sub font-semibold leading-relaxed">
                點擊上方勾選您今天完成的實踐項目，並在輸入框中寫下心得。我們已經幫您填寫了實用範例，您隨時可以直接送出或修改！
              </p>
              <button
                type="button"
                onClick={() => {
                  playSound('click');
                  setCheckinGuideStep(2);
                }}
                className="bg-green-main text-white font-black py-2.5 rounded-xl text-xs btn-active flex items-center justify-center gap-1"
              >
                <span>我知道了，下一個說明 ➔</span>
              </button>
            </div>
          )}
          
          <div className="mb-10">
            <label className="block text-sm font-black text-text-main mb-3">上傳照片 (選填)</label>
            <input 
              type="file" 
              accept="image/*" 
              id="photo-upload" 
              className="hidden" 
              onChange={handleFileChange}
            />
            <label 
              htmlFor="photo-upload"
              className="w-full h-40 border-2 border-dashed border-gray-lock/40 bg-gray-line/30 rounded-3xl flex flex-col items-center justify-center text-gray-lock hover:bg-gray-line/50 transition-colors group cursor-pointer overflow-hidden relative"
            >
              {checkinPreviewUrl ? (
                <>
                  <img src={checkinPreviewUrl} className="w-full h-full object-cover" alt="Preview" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <Camera className="text-white w-8 h-8" />
                  </div>
                </>
              ) : (
                <>
                  <Camera className="w-8 h-8 mb-3 group-hover:scale-110 transition-transform" />
                  <span className="text-[11px] font-black uppercase tracking-widest">點擊或拖曳上傳</span>
                </>
              )}
            </label>
          </div>

          <div 
            data-guide="checkin-submit-btn"
            className={cn(
              "mt-auto transition-all duration-300",
              checkinGuideStep === 2 ? "z-30 ring-4 ring-green-main relative bg-white p-2 rounded-2xl" : ""
            )}
          >
            <button 
              type="submit" 
              disabled={checkinIsUploading || (task.checklist && task.checklist.length > 0 && checkinSelectedOptions.length === 0)}
              className={cn(
                "w-full text-white font-black py-5 rounded-2xl btn-active shadow-float text-lg mb-8 transition-all flex items-center justify-center gap-2",
                (checkinIsUploading || (task.checklist && task.checklist.length > 0 && checkinSelectedOptions.length === 0))
                  ? "bg-gray-lock cursor-not-allowed opacity-60 shadow-none" 
                  : "bg-text-main"
              )}
            >
              {checkinIsUploading ? (
                <>
                  <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }} className="w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                  上傳中...
                </>
              ) : (task.checklist && task.checklist.length > 0 && checkinSelectedOptions.length === 0) ? (
                "請先勾選上方實踐項目 📋"
              ) : "送出打卡，獲得經驗值！"}
            </button>
          </div>

          {/* Inline Step 2 Tooltip for Check-in */}
          {checkinGuideStep === 2 && (
            <div className="mb-8 bg-white text-text-main p-5 rounded-3xl shadow-2xl z-30 border-2 border-[#9FD356] flex flex-col gap-3 relative animate-bounce-slow text-left">
              <h4 className="font-black text-sm text-green-main flex items-center gap-1.5">
                <span>🚀 第二步：送出打卡累積進度</span>
              </h4>
              <p className="text-xs text-text-sub font-semibold leading-relaxed">
                確認勾選與心得後，點擊這個按鈕即可送出。送出後將會為您解鎖關卡徽章、獲得經驗值，同時推進全站公益造林計畫喔！
              </p>
              <button
                type="button"
                onClick={() => {
                  playSound('success');
                  setCheckinGuideStep(null);
                  localStorage.setItem(`seen_checkin_guide_${state.track}`, 'true');
                }}
                className="bg-text-main text-white font-black py-2.5 rounded-xl text-xs btn-active flex items-center justify-center gap-1"
              >
                <span>我知道了，完成教學 🎉</span>
              </button>
            </div>
          )}
        </form>
      </div>
    );
  };

  const renderFeedView = () => (
    <div className="flex flex-col min-h-full bg-gray-line/20">
      <div className="sticky top-0 z-20 px-6 py-6 bg-white/90 backdrop-blur-xl border-b border-gray-line/50 flex justify-between items-center">
        <h2 className="text-xl font-black text-text-main tracking-tight">探索動態</h2>
        <button
          onClick={() => handleNav('notifications')}
          className="relative p-2.5 text-text-sub hover:text-text-main transition-colors bg-gray-line/35 rounded-full btn-active flex items-center justify-center animate-fade-in"
        >
          <Bell className="w-5.5 h-5.5 text-text-main" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center border border-white shadow-md animate-pulse">
              {unreadCount}
            </span>
          )}
        </button>
      </div>
      
      <div className="px-6 py-8 space-y-6">
        {globalFeed.length === 0 && (
          <div className="text-center py-20 opacity-50">
            <Compass className="w-12 h-12 mx-auto mb-4 animate-pulse" />
            <p className="font-black text-sm">目前還沒有動態，快去打卡吧！</p>
          </div>
        )}
        {globalFeed.map((post, idx) => (
          <motion.div 
            key={post.id}
            id={`post-${post.id}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white rounded-[32px] p-6 shadow-soft border border-gray-line/30"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <img 
                  src={`https://api.dicebear.com/7.x/notionists/svg?seed=${post.userAvatar || post.avatar || 'anon'}&backgroundColor=transparent`} 
                  className="w-11 h-11 rounded-full bg-gray-line shadow-inner"
                />
                <div>
                  <div className="font-black text-sm text-text-main">{post.userName || post.name}</div>
                  <div className="text-[10px] text-text-sub/60 font-medium">
                    {post.timestamp?.toDate ? post.timestamp.toDate().toLocaleTimeString() : post.time || '剛才'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-[9px] font-black px-3 py-1.5 rounded-xl uppercase tracking-widest",
                  post.track === 'veg' ? 'bg-green-light text-green-main' : 
                  post.track === 'plastic' ? 'bg-blue-light text-blue-main' : 
                  'bg-orange-100 text-[#FF9F1C]'
                )}>
                  {post.track === 'veg' ? '蔬食行動' : post.track === 'plastic' ? '淨塑行動' : '雙軌挑戰'}
                </span>
                {post.userId === user?.uid && (
                  <button 
                    onClick={async () => {
                      if (confirm('確定要刪除這則打卡嗎？')) {
                        try {
                          await deleteDoc(doc(db, 'checkins', post.id));
                        } catch (err) {
                          handleFirestoreError(err, OperationType.DELETE, `checkins/${post.id}`);
                        }
                      }
                    }}
                    className="p-2 text-gray-lock hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <p className="text-[14px] text-text-main mb-4 leading-relaxed font-medium">
              {post.text}
            </p>
            {post.checklistItems && post.checklistItems.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {post.checklistItems.map((item: string, i: number) => (
                  <span 
                    key={i} 
                    className={cn(
                      "text-[10px] font-black px-2.5 py-1 rounded-lg border flex items-center gap-1",
                      post.track === 'veg' ? 'bg-green-light/40 text-green-main border-green-main/10' :
                      post.track === 'plastic' ? 'bg-blue-light/40 text-blue-main border-blue-main/10' :
                      'bg-orange-50 text-[#b06800] border-orange-200'
                    )}
                  >
                    <span>✅</span> {item}
                  </span>
                ))}
              </div>
            )}
            {post.imageUrl && (
              <div className="mb-5 rounded-2xl overflow-hidden shadow-sm border border-gray-line/30">
                <img src={post.imageUrl} className="w-full h-auto object-cover max-h-60" alt="Post" />
              </div>
            )}
            <div className="flex justify-between items-center pt-4 border-t border-gray-line/30">
              <button 
                className="flex items-center gap-1.5 text-text-sub text-sm hover:text-red-500 transition-colors group"
                onClick={async (e) => {
                  try {
                    const postRef = doc(db, 'checkins', post.id);
                    await updateDoc(postRef, { likes: (post.likes || 0) + 1 });
                  } catch (err) {
                    handleFirestoreError(err, OperationType.UPDATE, `checkins/${post.id}`);
                  }
                }}
              >
                <Heart className={cn("w-5 h-5 transition-colors", post.likes > 0 && "fill-red-500 text-red-500")} /> 
                <span className="font-black text-xs">{post.likes || 0}</span>
              </button>
              <button 
                onClick={() => {
                  if (activeCommentPostId === post.id) {
                    setActiveCommentPostId(null);
                  } else {
                    setActiveCommentPostId(post.id);
                    setCommentInputText('');
                  }
                }}
                className="flex items-center gap-1.5 text-text-sub hover:text-text-main transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
                <span className="font-black text-xs">留言 ({post.comments?.length || 0})</span>
              </button>
            </div>

            {activeCommentPostId === post.id && (
              <div className="mt-4 pt-4 border-t border-gray-line/30 space-y-3">
                <div className="max-h-40 overflow-y-auto space-y-3 pr-1 hide-scrollbar">
                  {(!post.comments || post.comments.length === 0) ? (
                    <p className="text-[11px] text-gray-lock text-center py-2">還沒有留言，快來留下第一句溫暖的話吧！</p>
                  ) : (
                    post.comments.map((comment: any, cIdx: number) => {
                      const isOwner = comment.userId === user?.uid;
                      const isEditing = editingCommentIndex?.postId === post.id && editingCommentIndex?.commentIdx === cIdx;
                      return (
                        <div key={cIdx} className="flex gap-2 items-start text-xs bg-gray-line/10 p-3 rounded-2xl border border-gray-line/30">
                          <img 
                            src={`https://api.dicebear.com/7.x/notionists/svg?seed=${comment.userAvatar || 'anon'}&backgroundColor=transparent`} 
                            className="w-7 h-7 rounded-full bg-gray-line shadow-inner shrink-0"
                            alt="Avatar"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center mb-0.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-black text-[11px] text-text-main truncate">{comment.userName}</span>
                                {isOwner && <span className="text-[8px] bg-green-light text-green-main border border-green-main/10 px-1.5 py-0.5 rounded font-black shrink-0">我</span>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[9px] text-text-sub/50 font-bold">
                                  {comment.timestamp ? new Date(comment.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '剛剛'}
                                </span>
                                {isOwner && !isEditing && (
                                  <div className="flex items-center gap-1">
                                    <button 
                                      onClick={() => {
                                        setEditingCommentIndex({ postId: post.id, commentIdx: cIdx });
                                        setEditingCommentText(comment.text);
                                      }}
                                      className="p-1 text-gray-lock hover:text-green-main transition-colors"
                                      title="編輯留言"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                      </svg>
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteComment(post.id, cIdx)}
                                      className="p-1 text-gray-lock hover:text-red-500 transition-colors"
                                      title="刪除留言"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                            
                            {isEditing ? (
                              <div className="flex flex-col gap-2 mt-1 w-full">
                                <textarea
                                  value={editingCommentText}
                                  onChange={(e) => setEditingCommentText(e.target.value)}
                                  className="w-full bg-white border border-gray-line rounded-xl p-2 text-base focus:outline-none focus:border-green-main resize-none"
                                  rows={2}
                                />
                                <div className="flex gap-2 justify-end">
                                  <button 
                                    onClick={() => setEditingCommentIndex(null)}
                                    className="px-2.5 py-1 bg-gray-line/40 hover:bg-gray-line/60 rounded-lg text-[10px] font-bold transition-colors"
                                  >
                                    取消
                                  </button>
                                  <button 
                                    onClick={() => handleSaveComment(post.id, cIdx)}
                                    className="px-2.5 py-1 bg-text-main hover:bg-green-main text-white rounded-lg text-[10px] font-bold transition-colors"
                                  >
                                    儲存
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className="text-text-sub font-medium text-[12px] leading-relaxed break-words whitespace-pre-wrap">{comment.text}</p>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!commentInputText.trim()) return;
                    try {
                      const postRef = doc(db, 'checkins', post.id);
                      await updateDoc(postRef, {
                        comments: arrayUnion({
                          userName: state.customDisplayName || user?.displayName || '匿名探險家',
                          userAvatar: state.customAvatarSeed || state.track || 'anon',
                          text: commentInputText.trim(),
                          timestamp: Date.now(),
                          userId: user?.uid
                        })
                      });
                      
                      // Create notification document if commenter is not the post author
                      if (post.userId && post.userId !== user?.uid) {
                        await addDoc(collection(db, 'notifications'), {
                          recipientId: post.userId,
                          senderId: user?.uid,
                          senderName: state.customDisplayName || user?.displayName || '匿名探險家',
                          senderAvatar: state.customAvatarSeed || state.track || 'anon',
                          type: 'comment',
                          postId: post.id,
                          postText: post.text?.slice(0, 30) || '',
                          commentText: commentInputText.trim().slice(0, 100),
                          timestamp: serverTimestamp(),
                          read: false
                        });
                      }

                      setCommentInputText('');
                    } catch (err) {
                      console.error('Failed to add comment:', err);
                    }
                  }} 
                  className="flex gap-2 mt-3"
                >
                  <textarea 
                    value={commentInputText}
                    onChange={(e) => setCommentInputText(e.target.value)}
                    placeholder="寫下你的溫暖回饋..." 
                    rows={1}
                    className="flex-1 bg-gray-line/40 border border-transparent rounded-2xl px-4 py-2.5 text-base focus:outline-none focus:border-green-main focus:bg-white transition-all shadow-inner-soft resize-none min-h-[38px] max-h-20"
                    required
                  />
                  <button type="submit" className="bg-text-main text-white px-4 py-2.5 rounded-2xl text-xs font-black hover:bg-green-main hover:scale-95 transition-all shrink-0 btn-active shadow-sm flex items-center justify-center min-h-[38px]">
                    送出
                  </button>
                </form>
              </div>
            )}
          </motion.div>
        ))}
        {globalFeed.length >= feedLimit && (
          <div className="flex justify-center pt-2 pb-6">
            <button 
              onClick={() => {
                playSound('click');
                setFeedLimit(prev => prev + 10);
              }}
              className="bg-white border border-gray-line text-text-sub hover:text-text-main font-black text-xs px-6 py-3 rounded-2xl shadow-sm hover:shadow transition-all duration-300 btn-active flex items-center gap-1.5"
            >
              🔄 載入更多動態
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderNotificationsView = () => {
    return (
      <div className="flex flex-col min-h-full bg-white relative">
        <div className="sticky top-0 z-20 px-6 pt-12 pb-6 bg-white/95 backdrop-blur-md border-b border-gray-line/50">
          <div className="flex items-center gap-3 mb-1">
            <button 
              onClick={() => handleNav('dashboard')} 
              className="p-2 -ml-2 text-text-sub hover:text-text-main transition-colors"
            >
              <ChevronLeft />
            </button>
            <h1 className="text-2xl font-black text-text-main">通知中心</h1>
          </div>
          <div className="flex justify-between items-center ml-10">
            <p className="text-[11px] text-text-sub font-black uppercase tracking-widest">這裡記錄了夥伴與你的溫暖互動</p>
            {unreadCount > 0 && (
              <button 
                onClick={async () => {
                  playSound('click');
                  const batchPromises = notifications
                    .filter(n => !n.read)
                    .map(n => updateDoc(doc(db, 'notifications', n.id), { read: true }));
                  await Promise.all(batchPromises);
                }}
                className="text-[10px] font-black text-green-main hover:underline"
              >
                全部標記為已讀 ✓
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 pb-32">
          {notifications.length === 0 ? (
            <div className="text-center py-20 opacity-50">
              <Bell className="w-12 h-12 mx-auto mb-4 animate-pulse text-gray-lock" />
              <p className="font-black text-sm">目前還沒有收到任何通知喔！</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div 
                key={notif.id}
                onClick={async () => {
                  playSound('click');
                  if (!notif.read) {
                    await updateDoc(doc(db, 'notifications', notif.id), { read: true });
                  }
                  
                  setCurrentView('feed');
                  setActiveCommentPostId(notif.postId);
                  setTimeout(() => {
                    const postElement = document.getElementById(`post-${notif.postId}`);
                    if (postElement) {
                      smoothScrollToElement(postElement, 'center');
                    }
                  }, 500);
                }}
                className={cn(
                  "p-4 rounded-3xl border transition-all cursor-pointer flex gap-3.5 items-start text-left",
                  notif.read 
                    ? "bg-white border-gray-line/45 opacity-75" 
                    : "bg-green-light/10 border-green-main/20 shadow-sm"
                )}
              >
                <img 
                  src={`https://api.dicebear.com/7.x/notionists/svg?seed=${notif.senderAvatar || 'anon'}&backgroundColor=transparent`} 
                  className="w-11 h-11 rounded-full bg-gray-line shadow-inner shrink-0"
                  alt="Sender Avatar"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-black text-xs text-text-main">{notif.senderName}</span>
                    <span className="text-[9px] text-text-sub/50 font-bold">
                      {notif.timestamp?.seconds 
                        ? new Date(notif.timestamp.seconds * 1000).toLocaleDateString('zh-TW', {month: '2-digit', day: '2-digit'}) + ' ' + new Date(notif.timestamp.seconds * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                        : '剛剛'}
                    </span>
                  </div>
                  <p className="text-xs text-text-sub font-semibold leading-relaxed">
                    {notif.type === 'comment' ? (
                      <>
                        在你的貼文「<span className="italic font-bold text-text-main truncate max-w-[80px] inline-block align-bottom">{notif.postText}</span>」留下回覆：<br/>
                        <span className="text-text-main font-bold">「{notif.commentText}」</span>
                      </>
                    ) : (
                      `讚了你的貼文「${notif.postText}」`
                    )}
                  </p>
                </div>
                {!notif.read && (
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0 self-center" />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const AdminView = () => {
    const [allPosts, setAllPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const q = query(collection(db, 'checkins'), orderBy('timestamp', 'desc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllPosts(posts);
        setLoading(false);
      });
      return unsubscribe;
    }, []);

    return (
      <div className="flex flex-col h-full bg-white relative">
        <div className="sticky top-0 z-20 px-6 pt-12 pb-6 bg-white/95 backdrop-blur-md border-b border-gray-line/50">
           <div className="flex items-center gap-3 mb-1">
             <button onClick={() => setCurrentView('profile')} className="p-2 -ml-2 text-text-sub hover:text-text-main transition-colors"><ChevronLeft /></button>
             <h1 className="text-2xl font-black text-text-main">數據收集後台</h1>
           </div>
           <p className="text-[11px] text-text-sub font-black uppercase tracking-widest ml-10">即時監看使用者的環保行動</p>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
             <div className="text-center py-20 animate-pulse text-sm font-black text-gray-lock uppercase tracking-widest">載入雲端數據中...</div>
          ) : allPosts.length === 0 ? (
             <div className="text-center py-20 text-gray-lock font-bold">目前尚無數據</div>
          ) : allPosts.map(post => (
            <div key={post.id} className="p-5 rounded-3xl border border-gray-line bg-white shadow-soft">
              <div className="flex justify-between items-start mb-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-gray-lock uppercase tracking-tighter mb-1">使用者 ID: {post.userId?.slice(-6)}...</span>
                  <span className="text-[10px] font-bold text-text-sub/60">
                    {post.timestamp?.toDate ? post.timestamp.toDate().toLocaleString('zh-TW') : '時間載入中'}
                  </span>
                </div>
                <div className={cn(
                  "text-[9px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest shadow-sm",
                  post.track === 'veg' ? 'bg-green-light text-green-main border border-green-main/10' : 
                  post.track === 'plastic' ? 'bg-blue-light text-blue-main border border-blue-main/10' :
                  'bg-orange-50 text-orange-500 border border-orange-200'
                )}>
                  {post.track === 'veg' ? '蔬食' : post.track === 'plastic' ? '淨塑' : '雙軌'}
                </div>
              </div>
              <p className="text-sm text-text-main font-medium mb-3 bg-gray-line/20 p-4 rounded-2xl leading-relaxed">{post.text || '(無心得內容)'}</p>
              {post.imageUrl && (
                <div className="mb-2 rounded-2xl overflow-hidden border border-gray-line/50 shadow-inner">
                  <img src={post.imageUrl} className="w-full h-auto" alt="Admin Preview" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderProfileView = () => {
    const lv = currentLevel;
    const expReq = LEVELS_EXP_REQ[Math.min(lv, 4)];
    const prevReq = LEVELS_EXP_REQ[lv-1];
    const progress = ((state.exp - prevReq) / (expReq - prevReq)) * 100;

    const track = state.track || 'veg';
    const data = TRACK_DATA[track];
    const tc = data.themeColor;
    const tl = data.lightColor;

    return (
      <div className="flex flex-col min-h-full bg-white-main relative">
        {profileGuideStep !== null && (
          <div className="absolute inset-0 bg-black/45 z-25 pointer-events-auto rounded-b-[40px] rounded-t-none" />
        )}
        {user?.isAnonymous && (
          <div className="bg-[#FF9F1C] text-white px-6 py-4 flex flex-col gap-2.5 items-center justify-between text-center shadow-md">
            <p className="text-[12px] font-black leading-relaxed flex items-center gap-1.5 justify-center">
              ⚠️ 您目前使用「免登入訪客模式」，進度隨時可能因清除快取而遺失！
            </p>
            <button 
              onClick={async () => {
                const confirmLink = confirm(
                  "📦 連結 Google 帳號備份進度：\n我們將引導您登入 Google 帳號，並將您當前累積的等級、EXP、徽章進度永久同步到該帳號中，確保資料不會遺失！\n\n是否現在進行連結？"
                );
                if (!confirmLink) return;
                try {
                  const provider = googleProvider;
                  const credentialResult = await linkWithPopup(user, provider);
                  alert("🎉 帳號連結成功！您的進度已安全備份至 Google 帳號。");
                  await refreshUserState();
                } catch (linkErr: any) {
                  console.error("Linking failed:", linkErr);
                  if (linkErr.code === 'auth/credential-already-in-use') {
                    alert("❌ 備份失敗：此 Google 帳號已經註冊過其他挑戰進度了。請使用尚未註冊過本遊戲的 Google 帳號進行綁定！");
                  } else {
                    alert("❌ 連結失敗，請稍後再試。");
                  }
                }
              }}
              className="bg-white text-[#FF9F1C] text-xs font-black px-4 py-2 rounded-xl shadow-soft btn-active hover:scale-105 transition-transform"
            >
              🔗 立即連結 Google 帳號備份
            </button>
          </div>
        )}

        <div className="bg-white rounded-b-[48px] shadow-soft px-8 py-12 mb-8 border-b border-gray-line/50">
          <div className="flex items-center gap-6 mb-10">
            <div className="w-24 h-24 rounded-full border-[6px] border-white shadow-float overflow-hidden shrink-0" style={{ backgroundColor: tl }}>
              <img 
                src={`https://api.dicebear.com/7.x/notionists/svg?seed=${state.customAvatarSeed || state.track || 'felix'}&backgroundColor=transparent`} 
                alt="Avatar" 
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h2 className="text-24pt font-black text-text-main tracking-tight leading-tight text-left">
                {state.customDisplayName || (user?.isAnonymous ? '訪客探險家' : (user?.displayName || '匿名探險家'))}
              </h2>
              <div className="flex items-center gap-3 mt-3">
                <span className="text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest" style={{ backgroundColor: tc }}>
                  Lv.{lv}
                </span>
                <span className="text-xs font-black tracking-wide underline decoration-2 underline-offset-4" style={{ color: tc }}>
                  {TITLES[lv - 1]}
                </span>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-line/40 rounded-3xl p-6 shadow-inner-soft">
            <div className="flex justify-between items-center text-[11px] mb-3">
              <span className="font-black text-text-sub uppercase tracking-widest">目前稱號路徑</span>
              <span className="font-black tracking-tighter text-sm" style={{ color: tc }}>{state.exp} / {expReq} EXP</span>
            </div>
            <div className="bg-white rounded-full h-3 overflow-hidden shadow-inner">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(progress, 100)}%` }}
                className="h-full rounded-full shadow-[0_0_10px_rgba(159,211,86,0.4)]"
                style={{ backgroundColor: tc }}
              />
            </div>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="px-8 mb-6">
          <div className="flex bg-gray-line rounded-2xl p-1">
            <button 
              onClick={() => setProfileTab('badges')}
              className={cn(
                "flex-1 py-3 text-xs font-black rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5",
                profileTab === 'badges' ? "bg-white text-text-main shadow-sm" : "text-text-sub"
              )}
            >
              🏆 我的徽章庫
            </button>
            <button 
              onClick={() => setProfileTab('settings')}
              className={cn(
                "flex-1 py-3 text-xs font-black rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5",
                profileTab === 'settings' ? "bg-white text-text-main shadow-sm" : "text-text-sub"
              )}
            >
              ⚙️ 帳號與設定
            </button>
          </div>
        </div>

        {profileTab === 'badges' ? (
          <div className="px-8 flex-1">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-lg text-text-main tracking-tight">徽章收藏庫</h3>
              <div className="text-[10px] font-black text-text-sub uppercase tracking-[0.2em]">
                {state.unlockedBadges.length} / {BADGES.length}
              </div>
            </div>

            {/* Senior Friendly Badges Interaction Tip */}
            <div className="bg-gray-line/35 rounded-2xl p-4.5 flex items-start gap-2.5 mb-8 border border-gray-line/20 shadow-inner-soft">
              <span className="text-xl shrink-0">💡</span>
              <p className="text-[11.5px] text-text-sub font-black leading-relaxed">
                長輩小提示：點擊下方任何一個徽章，就可以看到「任務說明」與「如何拿到」喔！點擊灰色的未解鎖徽章，還能直接帶您前往地圖挑戰！
              </p>
            </div>

            {/* Inline Step 1 Tooltip for Badges Onboarding */}
            {profileGuideStep === 1 && (
              <div className="mb-8 bg-white text-text-main p-5 rounded-3xl shadow-2xl z-30 border-2 border-green-main flex flex-col gap-3 relative animate-bounce-slow text-left">
                <h4 className="font-black text-sm text-green-main flex items-center gap-1.5">
                  <span>✨ 恭喜解鎖第一個徽章！</span>
                </h4>
                <p className="text-xs text-text-sub font-semibold leading-relaxed">
                  看！這就是你剛剛完成挑戰獲得的亮起徽章。👉 <strong>點擊它（或用手指點按）可以放大查看詳細的任務內容喔！</strong>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    playSound('click');
                    setProfileGuideStep(2);
                  }}
                  className="bg-green-main text-white font-black py-2.5 rounded-xl text-xs btn-active flex items-center justify-center gap-1"
                >
                  <span>我懂了，下一個說明 ➔</span>
                </button>
              </div>
            )}

            {[
              { id: 'veg', name: '蔬食行動', color: 'from-[#E8F5D8] to-[#9FD356]', border: 'border-[#9FD356]' },
              { id: 'plastic', name: '淨塑行動', color: 'from-[#E1EEFA] to-[#3C91E6]', border: 'border-[#3C91E6]' },
              { id: 'dual', name: '雙軌挑戰', color: 'from-[#FFF0E5] to-[#FF9F1C]', border: 'border-[#FF9F1C]' }
            ].sort((a, b) => {
              if (a.id === state.track) return -1;
              if (b.id === state.track) return 1;
              return 0;
            }).map(trackInfo => (
              <div key={trackInfo.id} className="mb-12">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-[1px] flex-1 bg-gray-line/50"></div>
                  <span className="text-xs font-black text-text-main tracking-widest">{trackInfo.name}</span>
                  <div className="h-[1px] flex-1 bg-gray-line/50"></div>
                </div>
                
                <div className="grid grid-cols-4 gap-y-6 gap-x-2 mb-6">
                  {BADGES.filter(b => b.track === trackInfo.id && b.type === 'levelBadge').map(badge => {
                    const isUnlocked = state.unlockedBadges.includes(badge.id);
                    const isTargetGuideBadge = badge.id === `${state.track}_1`;
                    return (
                      <motion.div 
                        key={badge.id}
                        data-guide={isTargetGuideBadge ? "new-unlocked-badge" : undefined}
                        onClick={() => setSelectedBadge(badge)}
                        whileHover={isUnlocked ? { y: -2 } : {}}
                        className={cn(
                          "flex flex-col items-center text-center group cursor-pointer transition-all duration-300",
                          (profileGuideStep === 1 && isTargetGuideBadge) ? "z-30 ring-4 ring-green-main p-2 bg-white rounded-3xl relative" : ""
                        )}
                      >
                        <div className={cn(
                          "w-18 h-18 mb-2 flex items-center justify-center transition-all duration-500",
                          isUnlocked ? "filter drop-shadow-md" : "filter grayscale opacity-30 scale-90"
                        )}>
                          {renderBadgeIcon(badge.icon, badge.name)}
                        </div>
                        <div className={cn(
                          "text-[9px] font-black tracking-tighter leading-tight",
                          isUnlocked ? "text-text-main" : "text-gray-lock"
                        )}>
                          {badge.name}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Completion Badge */}
                <div className="flex justify-center">
                  {BADGES.filter(b => b.track === trackInfo.id && b.type === 'completeBadge').map(badge => {
                     const isUnlocked = state.unlockedBadges.includes(badge.id);
                     return (
                      <motion.div 
                        key={badge.id}
                        onClick={() => isUnlocked ? setShowRewardModal(trackInfo.id as Track) : setSelectedBadge(badge)}
                        whileHover={isUnlocked ? { scale: 1.05 } : {}}
                        className="flex flex-col items-center text-center cursor-pointer relative"
                      >
                        <div className={cn(
                          "w-28 h-28 flex items-center justify-center transition-all duration-500 z-10 relative",
                          isUnlocked ? "filter drop-shadow-lg" : "filter grayscale opacity-30 scale-90"
                        )}>
                          {renderBadgeIcon(badge.icon, badge.name, true)}
                          {!isUnlocked && (
                             <div className="absolute inset-0 flex items-center justify-center">
                               <Lock className="w-7 h-7 text-gray-lock/80 drop-shadow-sm" />
                             </div>
                          )}
                        </div>
                        <div className="mt-3 bg-white px-4 py-1.5 rounded-full shadow-sm border border-gray-line/30 z-20">
                          <span className={cn(
                            "text-xs font-black tracking-widest",
                            isUnlocked ? "text-text-main" : "text-gray-lock"
                          )}>
                            {badge.name}
                          </span>
                        </div>
                      </motion.div>
                     )
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-8 pb-32 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5 mb-2">
              <h3 className="font-black text-lg text-text-main tracking-tight">系統設定與操作</h3>
              <p className="text-[11px] text-text-sub font-semibold">在這裡管理您的挑戰進度和帳號設定。</p>
            </div>

            {/* Edit Profile Section */}
            <div className="bg-white rounded-3xl p-5 border border-gray-line/60 shadow-soft flex flex-col gap-4">
              <h4 className="font-black text-sm text-text-main flex items-center gap-1.5">
                👤 編輯個人檔案
              </h4>
              
              <div className="flex gap-4 items-center">
                <div className="w-16 h-16 rounded-full border-2 border-green-light/45 bg-gray-line/30 shadow-inner overflow-hidden shrink-0 flex items-center justify-center">
                  <img 
                    src={`https://api.dicebear.com/7.x/notionists/svg?seed=${profileSetupAvatar || 'anon'}&backgroundColor=transparent`} 
                    className="w-full h-full object-cover"
                    alt="Settings Avatar Preview"
                  />
                </div>
                <div className="flex-1">
                  <span className="text-[10px] font-black text-text-sub uppercase tracking-wider block mb-1">玩家暱稱</span>
                  <input 
                    type="text" 
                    value={profileSetupName}
                    onChange={(e) => setProfileSetupName(e.target.value)}
                    maxLength={15}
                    placeholder="輸入暱稱..."
                    className="w-full bg-gray-line/40 border border-transparent rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-green-main focus:bg-white transition-all shadow-inner-soft font-bold text-text-main"
                  />
                </div>
              </div>

              <div>
                <span className="text-[10px] font-black text-text-sub uppercase tracking-wider block mb-2">選擇頭像</span>
                <div className="grid grid-cols-8 gap-1 mb-2">
                  {['Bella', 'Felix', 'Charlie', 'Daisy', 'Oliver', 'Ruby', 'Sam', 'Leo'].map(seed => {
                    const isSelected = profileSetupAvatar === seed && !profileCustomAvatarText;
                    return (
                      <div 
                        key={seed}
                        onClick={() => {
                          playSound('click');
                          setProfileSetupAvatar(seed);
                          setProfileCustomAvatarText('');
                        }}
                        className={cn(
                          "w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer transition-all bg-gray-50",
                          isSelected ? "border-green-main ring-1 ring-green-main/30 scale-105" : "border-transparent opacity-75 hover:opacity-100"
                        )}
                      >
                        <img 
                          src={`https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=transparent`} 
                          className="w-7 h-7 object-cover"
                          alt={seed}
                        />
                      </div>
                    );
                  })}
                </div>
                
                <input 
                  type="text" 
                  value={profileCustomAvatarText}
                  onChange={(e) => {
                    const val = e.target.value;
                    setProfileCustomAvatarText(val);
                    setProfileSetupAvatar(val.trim() || 'Felix');
                  }}
                  placeholder="或輸入任意文字自訂頭像..."
                  className="w-full bg-gray-line/40 border border-transparent rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-green-main focus:bg-white transition-all shadow-inner-soft text-text-main font-medium"
                />
              </div>

              <button 
                onClick={async () => {
                  if (!profileSetupName.trim()) {
                    alert('請輸入玩家暱稱！');
                    return;
                  }
                  try {
                    await updateFirebaseState({
                      customDisplayName: profileSetupName.trim(),
                      customAvatarSeed: profileSetupAvatar
                    });
                    playSound('success');
                    alert('🎉 個人檔案修改成功！');
                  } catch (err) {
                    console.error('Failed to update profile:', err);
                  }
                }}
                className="w-full bg-green-main text-white font-black py-2.5 rounded-xl text-xs btn-active shadow-sm hover:scale-[0.98] transition-transform"
              >
                儲存個人檔案修改
              </button>
            </div>

            <button 
              onClick={() => {
                setTempTrack(state.track);
                setCurrentView('select');
              }}
              className="w-full bg-white border border-gray-line text-text-main font-black py-4 rounded-2xl btn-active shadow-sm flex items-center justify-center gap-2"
            >
              🔄 切換挑戰軌道
            </button>

            <button 
              onClick={() => signOut(auth)}
              className="w-full bg-text-main text-white font-black py-4 rounded-2xl btn-active shadow-float flex items-center justify-center gap-2"
            >
              <LogOut className="w-5 h-5" /> 登出帳號
            </button>

            {!isConfirmingReset ? (
              <>
                {user?.email === 'toafhc@gmail.com' && (
                  <button 
                    onClick={() => setCurrentView('admin')}
                    className="w-full bg-[#FFD166] text-text-main font-black py-4 rounded-2xl btn-active shadow-lg shadow-orange-200 flex items-center justify-center gap-2 border-b-4 border-orange-300"
                  >
                    <Star className="w-5 h-5 fill-current text-white stroke-orange-400" /> 進入數據收集後台
                  </button>
                )}
                <button 
                  onClick={() => setIsConfirmingReset(true)}
                  className="w-full py-4 rounded-2xl border-2 border-red-100 text-red-400 font-black text-sm hover:bg-red-50 transition-colors btn-active flex items-center justify-center gap-2"
                >
                  重置挑戰進度
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-3 p-4 bg-red-50 rounded-3xl border border-red-100">
                <p className="text-[11px] text-red-500 font-bold text-center leading-relaxed">
                  ⚠️ 確定要重置嗎？<br/>這將會永久刪除您當前的 EXP 經驗值和所有已解鎖的徽章成就，此操作無法還原。
                </p>
                <div className="flex gap-2.5 mt-1">
                  <button 
                    onClick={() => setIsConfirmingReset(false)}
                    className="flex-1 py-3 rounded-xl bg-white border border-gray-line text-text-main font-black text-xs btn-active"
                  >
                    取消
                  </button>
                  <button 
                    onClick={async () => {
                      updateFirebaseState({
                        track: null,
                        level: 1,
                        exp: 0,
                        streak: 0,
                        checkInCount: 0,
                        co2Saved: 0,
                        unlockedBadges: ['novice'],
                        lastCheckInDate: null,
                        hasSeenPreview: false,
                        hasCompletedTutorial: false,
                      });
                      setIsConfirmingReset(false);
                      setProfileTab('badges'); // reset tab
                      setCurrentView('select');
                    }}
                    className="flex-2 py-3 rounded-xl bg-red-500 text-white font-black text-xs btn-active shadow-lg shadow-red-500/20"
                  >
                    是的，我要重置
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div 
      id="app-container" 
      onClick={handleGlobalClick}
      onTouchStart={unlockAudio}
      className="max-w-[400px] mx-auto bg-white-main h-svh relative overflow-hidden flex flex-col shadow-2xl"
    >
      <AnimatePresence mode="wait">
        <motion.div 
          key={currentView}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 400 }}
          ref={scrollContainerRef}
          onScroll={handleScroll}
          onAnimationComplete={() => {
            if (currentView === 'map') {
              const activeNode = document.querySelector('[data-guide="active-level-node"]');
              if (activeNode) {
                smoothScrollToElement(activeNode, 'center');
              } else {
                if (scrollContainerRef.current) {
                  scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
                }
              }
            } else if (currentView === 'checkin') {
              if (checkinGuideStep === 1) {
                const checklistSection = document.querySelector('[data-guide="checkin-checklist"]');
                if (checklistSection) {
                  smoothScrollToElement(checklistSection, 'center');
                }
              } else if (checkinGuideStep === 2) {
                const submitBtn = document.querySelector('[data-guide="checkin-submit-btn"]');
                if (submitBtn) {
                  smoothScrollToElement(submitBtn, 'center');
                }
              }
            } else if (currentView === 'profile') {
              if (profileGuideStep === 1) {
                const newBadge = document.querySelector('[data-guide="new-unlocked-badge"]');
                if (newBadge) {
                  smoothScrollToElement(newBadge, 'center');
                }
              }
            } else if (currentView === 'dashboard') {
              if (dashboardGuideStep === 1) {
                const forestCard = document.querySelector('[data-guide="forest-card"]');
                if (forestCard) {
                  smoothScrollToElement(forestCard, 'center');
                }
              }
            }
          }}
          className="flex-1 overflow-y-auto hide-scrollbar pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))]"
        >
          {currentView === 'preview' && renderPreviewView()}
          {currentView === 'select' && renderSelectView()}
          {currentView === 'dashboard' && renderDashboardView()}
          {currentView === 'map' && renderMapView()}
          {currentView === 'checkin' && renderCheckinView()}
          {currentView === 'feed' && renderFeedView()}
          {currentView === 'profile' && renderProfileView()}
          {currentView === 'admin' && <AdminView />}
          {currentView === 'notifications' && renderNotificationsView()}
        </motion.div>
      </AnimatePresence>

      {checkinIsUploading && (
        <div className="absolute inset-0 z-[120] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center gap-4 text-white p-8 text-center pointer-events-auto rounded-b-none">
          <motion.div 
            animate={{ rotate: 360 }} 
            transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }} 
            className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full shadow-float" 
          />
          <h3 className="font-black text-lg tracking-tight mt-2 animate-pulse">正在上傳您的環保打卡...</h3>
          <p className="text-xs text-white/70 leading-relaxed max-w-[240px]">
            我們正在幫您將照片壓縮上傳至綠色雲端，並累積減碳 EXP 經驗值！請稍候一下喔 🌳
          </p>
        </div>
      )}

      <nav id="bottom-nav" className={cn(
        "absolute bottom-0 left-0 w-full h-[calc(6rem+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)] bg-white/95 backdrop-blur-xl border-t border-gray-line/50 flex justify-around items-center px-4 z-40 transition-all duration-500",
        ['preview', 'select'].includes(currentView) || (!isNavVisible && currentView !== 'map') ? "translate-y-full opacity-0" : "translate-y-0 opacity-100",
        (dashboardGuideStep !== null || profileGuideStep === 1) ? "pointer-events-none opacity-20 filter grayscale" : ""
      )}>
        <NavItem active={currentView === 'dashboard'} onClick={() => handleNav('dashboard')} icon={<Home />} label="首頁" />
        <NavItem active={currentView === 'map'} onClick={() => handleNav('map')} icon={<MapIcon />} label="地圖" />
        
        {/* FAB */}
        <div className="relative -top-6">
          <motion.div 
            whileTap={{ scale: 0.9 }}
            onClick={() => handleNav('checkin')}
            className={cn(
              "w-20 h-20 rounded-full flex items-center justify-center text-white shadow-float border-[6px] border-white transition-all cursor-pointer",
              currentView === 'checkin' ? "scale-110" : ""
            )}
            style={{ background: 'linear-gradient(135deg, #4A9166, #5aab7a)' }}
          >
            <Camera className="w-8 h-8" strokeWidth={2.5} />
          </motion.div>
          <span className="absolute bottom-[-28px] left-1/2 -translate-x-1/2 text-[10px] font-black uppercase tracking-widest" style={{ color: '#4A9166' }}>打卡</span>
        </div>

        <NavItem 
          active={currentView === 'feed'} 
          onClick={() => {
            if (profileGuideStep === 2) {
              playSound('success');
              setProfileGuideStep(null);
              localStorage.setItem('seen_profile_guide', 'true');
            }
            handleNav('feed');
          }} 
          icon={<Compass />} 
          label="探索" 
          dataGuide="nav-feed"
          className={cn(
            "transition-all duration-300",
            profileGuideStep === 2 ? "z-50 ring-4 ring-green-main bg-white rounded-2xl p-2.5 -translate-y-2 relative" : ""
          )}
        />
        <NavItem active={currentView === 'profile'} onClick={() => handleNav('profile')} icon={<User />} label="我的" />
      </nav>

      {/* Step 2 Backdrop Overlay and Tooltip for Profile Onboarding */}
      {profileGuideStep === 2 && (
        <>
          <div className="absolute inset-0 bg-black/45 z-35 pointer-events-auto" />
          <div className="absolute bottom-[calc(7rem+env(safe-area-inset-bottom,0px))] left-6 right-6 bg-white text-text-main p-5 rounded-3xl shadow-2xl z-50 border-2 border-[#9FD356] flex flex-col gap-3 animate-bounce-slow text-left">
            <h4 className="font-black text-sm text-green-main flex items-center gap-1.5">
              <span>🌍 第二步：去「探索動態」看大家的打卡！</span>
            </h4>
            <p className="text-xs text-text-sub font-semibold leading-relaxed">
              恭喜您熟悉了徽章！現在點選下方的「<strong>探索</strong>」，去查看您剛剛發佈的打卡，還能看到其他挑戰者的環保心得、按讚互動喔！
            </p>
            <button
              type="button"
              onClick={() => {
                playSound('success');
                setProfileGuideStep(null);
                localStorage.setItem('seen_profile_guide', 'true');
                handleNav('feed');
              }}
              className="bg-text-main text-white font-black py-2.5 rounded-xl text-xs btn-active flex items-center justify-center gap-1"
            >
              <span>前往探索動態 🎉</span>
            </button>
          </div>
        </>
      )}

      {currentView === 'admin' && (
        <div className="absolute inset-0 z-50 bg-white">
          <AdminView />
        </div>
      )}

      {/* 1. Badge Detail Modal */}
      <AnimatePresence>
        {selectedBadge && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center p-8">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-text-main/70 backdrop-blur-sm"
              onClick={() => setSelectedBadge(null)}
            />
            <motion.div 
              initial={{ scale: 0.8, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.8, opacity: 0, y: 20 }}
              className="bg-white rounded-[40px] p-8 w-full max-w-sm text-center relative overflow-hidden shadow-2xl"
            >
              <button onClick={() => setSelectedBadge(null)} className="absolute top-6 right-6 text-gray-lock hover:text-text-main transition-colors">
                <X className="w-6 h-6" />
              </button>
              
              <div className={cn(
                "w-48 h-48 mx-auto flex items-center justify-center mb-6 relative",
                state.unlockedBadges.includes(selectedBadge.id) ? "animate-bounce-slow" : "filter grayscale opacity-30"
              )}>
                {state.unlockedBadges.includes(selectedBadge.id) && (
                  <div className="absolute inset-4 rounded-full bg-gradient-to-br from-[#FFF0E5]/60 to-[#FFD166]/40 blur-xl opacity-60 pointer-events-none" />
                )}
                <div className="w-44 h-44 flex items-center justify-center z-10 relative">
                  {renderBadgeIcon(selectedBadge.largeIcon || selectedBadge.icon, selectedBadge.name, true)}
                </div>
              </div>
              
              <h2 className="text-2xl font-black text-text-main mb-2 tracking-tight">{selectedBadge.name}</h2>
              <div className="bg-gray-line/30 rounded-xl py-2 px-4 mb-6 inline-block">
                <span className="text-[11px] font-black text-text-sub uppercase tracking-widest">
                  解鎖條件：{selectedBadge.condition}
                </span>
              </div>
              <p className="text-sm text-text-main mb-8 leading-relaxed font-medium">
                {selectedBadge.desc}
              </p>
              
              {state.unlockedBadges.includes(selectedBadge.id) ? (
                <div className="space-y-4">
                  <div className="text-[10px] font-black text-green-main tracking-widest uppercase bg-green-light/50 py-3 rounded-2xl border border-green-main/20">
                    已於 {state.badgeUnlockDates[selectedBadge.id] ? new Date(state.badgeUnlockDates[selectedBadge.id]).toLocaleDateString() : '未知時間'} 達成
                  </div>
                  {(selectedBadge.largeIcon || selectedBadge.icon).includes('.') && (
                    <a
                      href={selectedBadge.largeIcon || selectedBadge.icon}
                      download={`${selectedBadge.name}.png`}
                      className="w-full bg-green-main text-white font-black py-4 rounded-2xl btn-active shadow-float flex items-center justify-center gap-2 text-sm hover:bg-green-main/90 transition-colors"
                    >
                      <Download className="w-4 h-4" /> 儲存徽章到相簿
                    </a>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="text-[10px] font-black text-gray-lock tracking-widest uppercase flex items-center justify-center gap-2 bg-gray-line/45 py-2.5 rounded-xl border border-gray-line/10 shadow-inner">
                    <Lock className="w-3.5 h-3.5" /> 尚未解鎖
                  </div>
                  
                  {/* Senior friendly redirect/action button */}
                  {(() => {
                    const bTrack = selectedBadge.track as Track;
                    const isDualLocked = bTrack === 'dual' && 
                      getLevelForTrack('veg', state.unlockedBadges) < 3 && 
                      getLevelForTrack('plastic', state.unlockedBadges) < 3;
                      
                    if (isDualLocked) {
                      return (
                        <div className="text-xs font-bold text-red-500 bg-red-50 border border-red-200/50 p-3.5 rounded-2xl leading-normal text-center shadow-sm">
                          🔒 此挑戰路線目前處於鎖定狀態。<br />需要將「蔬食」或「淨塑」挑戰到第三關才能開啟喔！
                        </div>
                      );
                    }

                    if (state.track === bTrack) {
                      return (
                        <button
                          onClick={() => {
                            playSound('click');
                            setSelectedBadge(null);
                            handleNav('map');
                          }}
                          className="w-full text-white font-black py-4.5 rounded-2xl text-sm btn-active flex items-center justify-center gap-2 shadow-md hover:scale-[0.98] transition-all"
                          style={{ backgroundColor: TRACK_DATA[bTrack]?.themeColor || '#4A9166' }}
                        >
                          🚀 前往地圖挑戰此關卡
                        </button>
                      );
                    } else {
                      return (
                        <button
                          onClick={async () => {
                            playSound('click');
                            setSelectedBadge(null);
                            
                            // Switch track in state
                            const targetLevel = getLevelForTrack(bTrack, state.unlockedBadges);
                            await updateFirebaseState({ track: bTrack, level: targetLevel });
                            
                            // Navigate to map view
                            handleNav('map');
                          }}
                          className="w-full text-white font-black py-4.5 rounded-2xl text-sm btn-active flex items-center justify-center gap-2 shadow-md hover:scale-[0.98] transition-all"
                          style={{ backgroundColor: TRACK_DATA[bTrack]?.themeColor || '#4A9166' }}
                        >
                          🔄 切換路線並前往地圖挑戰
                        </button>
                      );
                    }
                  })()}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. Badge Celebration Modal (Queue) */}
      <AnimatePresence>
        {newUnlockedBadges.length > 0 && (
          <div className="absolute inset-0 z-[110] flex items-center justify-center p-8">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-text-main/80 backdrop-blur-md"
            />
            {/* Sparkles / Confetti decorations */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-10 flex items-center justify-center">
              <div className="absolute top-10 left-10 text-xl animate-bounce" style={{ animationDelay: '0.2s' }}>✨</div>
              <div className="absolute top-20 right-12 text-2xl animate-bounce" style={{ animationDelay: '0.5s' }}>🎉</div>
              <div className="absolute bottom-24 left-14 text-xl animate-bounce" style={{ animationDelay: '0.8s' }}>🌸</div>
              <div className="absolute bottom-12 right-10 text-2xl animate-bounce" style={{ animationDelay: '0.3s' }}>⭐</div>
              <div className="absolute top-1/2 left-8 text-lg animate-bounce" style={{ animationDelay: '1.1s' }}>🎈</div>
              <div className="absolute top-1/3 right-8 text-xl animate-bounce" style={{ animationDelay: '1.4s' }}>✨</div>
            </div>
            <motion.div 
              key={newUnlockedBadges[0].id}
              initial={{ scale: 0.5, opacity: 0, rotate: -10 }} 
              animate={{ scale: 1, opacity: 1, rotate: 0 }} 
              exit={{ scale: 0.8, opacity: 0, y: -50 }}
              transition={{ type: "spring", damping: 15 }}
              className="bg-white rounded-[48px] p-10 w-full max-w-sm text-center relative overflow-hidden shadow-2xl border-2 border-[#FFD166]/30"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#FF9F1C] to-[#FFD166]" />
              
              <div className="w-48 h-48 mx-auto flex items-center justify-center mb-8 relative">
                <div className="absolute inset-4 rounded-full bg-gradient-to-br from-[#FFF0E5]/60 to-[#FFD166]/45 blur-xl animate-pulse pointer-events-none" />
                <div className="w-44 h-44 flex items-center justify-center z-10 relative">
                  {renderBadgeIcon(newUnlockedBadges[0].largeIcon || newUnlockedBadges[0].icon, newUnlockedBadges[0].name, true)}
                </div>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 }} className="absolute bottom-2 right-2 bg-white rounded-full p-2.5 shadow-float border-2 border-gray-line z-20">
                  <Star className="w-9 h-9 fill-[#FF9F1C] text-[#FF9F1C]" />
                </motion.div>
              </div>

              <div className="text-xs font-black text-[#FF9F1C] uppercase tracking-[0.3em] mb-3">
                {newUnlockedBadges[0].type === 'completeBadge' ? '軌道破關！' : '解鎖新成就！'}
              </div>
              <h2 className="text-3xl font-black text-text-main mb-4 tracking-tighter">
                {newUnlockedBadges[0].name}
              </h2>
              
              {newUnlockedBadges[0].type === 'completeBadge' ? (
                <div className="bg-orange-50 rounded-2xl p-4 mb-8 border border-orange-100">
                  <p className="text-sm text-text-main leading-relaxed font-bold">
                    恭喜解鎖「{newUnlockedBadges[0].name}」！<br/>
                    {newUnlockedBadges[0].desc}
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-[14px] text-text-sub mb-5 leading-relaxed font-medium px-2">
                    這段旅程的小小印記。<br/>謝謝你把善意放進日常。
                  </p>
                  
                  {/* Celebratory Next Steps Guidance */}
                  <div className="bg-green-light rounded-3xl p-5 mb-8 border border-green-main/20 text-left">
                    <div className="text-[10px] font-black text-green-main uppercase tracking-[0.15em] mb-2.5 flex items-center gap-1">
                      <span>✨ 下一步指南</span>
                    </div>
                    <ul className="space-y-2 text-xs font-bold text-text-main leading-relaxed">
                      <li className="flex items-start gap-2">
                        <span className="shrink-0 text-sm">📸</span>
                        <span>您的精采打卡已同步發布至<strong className="text-green-main">「探索動態」</strong>，快去看看大家給你的溫暖留言吧！</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="shrink-0 text-sm">🗺️</span>
                        <span>現在可前往<strong className="text-green-main">「地圖」</strong>點選下一關，解鎖並挑戰新的永續任務！</span>
                      </li>
                    </ul>
                  </div>
                </>
              )}

              <button 
                onClick={() => {
                  const currentBadge = newUnlockedBadges[0];
                  const remaining = newUnlockedBadges.slice(1);
                  setNewUnlockedBadges(remaining);
                  if (remaining.length === 0) {
                    if (currentBadge.type === 'completeBadge') {
                      setShowRewardModal(currentBadge.track);
                    } else {
                      setCurrentView('profile');
                    }
                  }
                }}
                className="w-full bg-text-main text-white font-black py-4.5 rounded-[20px] btn-active shadow-lg shadow-text-main/20 flex items-center justify-center gap-2 text-lg tracking-wide"
              >
                收下這份紀念 <Heart className="w-5 h-5 fill-current" />
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2.5 Senior Friendly Quick Switch Modal */}
      <AnimatePresence>
        {showTrackSwitcherModal && (
          <div className="absolute inset-0 z-[115] flex items-end justify-center">
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTrackSwitcherModal(false)}
              className="absolute inset-0 bg-text-main/65 backdrop-blur-sm"
            />
            {/* Modal Body */}
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              className="bg-white w-full rounded-t-[40px] shadow-2xl p-6 relative border-t border-gray-line/50 pb-[calc(2rem+env(safe-area-inset-bottom,0px))] z-10 max-h-[85vh] overflow-y-auto"
            >
              {/* Drag indicator */}
              <div className="w-12 h-1.5 bg-gray-line/60 rounded-full mx-auto mb-5" />

              {/* Header */}
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-black text-text-main tracking-tight flex items-center gap-2">
                    切換挑戰路線 🔄
                  </h3>
                  <p className="text-xs text-text-sub font-bold mt-1">隨時切換，所有挑戰進度都會為您保留喔！</p>
                </div>
                <button 
                  onClick={() => {
                    playSound('click');
                    setShowTrackSwitcherModal(false);
                  }}
                  className="p-2 text-text-sub hover:text-text-main bg-gray-line/30 rounded-full btn-active"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Track Cards */}
              <div className="flex flex-col gap-4 mb-4">
                {(['veg', 'plastic', 'dual'] as Track[]).map((t) => {
                  const isLocked = t === 'dual' && 
                    getLevelForTrack('veg', state.unlockedBadges) < 3 && 
                    getLevelForTrack('plastic', state.unlockedBadges) < 3;
                    
                  const isActive = state.track === t;
                  const tData = TRACK_DATA[t];

                  return (
                    <motion.button
                      key={t}
                      disabled={isLocked}
                      whileTap={isLocked ? {} : { scale: 0.98 }}
                      onClick={async () => {
                        playSound('click');
                        if (isLocked) {
                          alert('🔒 雙軌挑戰尚未解鎖！\n需要將【蔬食任務】或【淨塑任務】挑戰到 Lv.3 (完成前兩關) 後，才能解鎖雙軌整合挑戰喔！');
                          return;
                        }
                        
                        const targetLevel = getLevelForTrack(t, state.unlockedBadges);
                        await updateFirebaseState({ track: t, level: targetLevel });
                        setShowTrackSwitcherModal(false);
                      }}
                      className={cn(
                        "w-full text-left p-4.5 rounded-3xl border-2 transition-all relative flex items-center gap-4 bg-white shadow-soft",
                        isLocked ? "opacity-60 bg-gray-50 border-gray-line/30 cursor-not-allowed select-none filter grayscale" :
                        isActive ? "border-text-main shadow-md" : "border-gray-line/30 hover:border-gray-line/60"
                      )}
                      style={!isLocked && isActive ? { borderColor: tData.themeColor, borderWidth: '3.5px' } : undefined}
                    >
                      {/* Icon circle */}
                      <div className={cn(
                        "w-13 h-13 rounded-2xl flex items-center justify-center text-3xl shrink-0 shadow-inner-soft",
                        t === 'veg' ? "bg-green-light text-green-main" : 
                        t === 'plastic' ? "bg-blue-light text-blue-main" : 
                        "bg-gradient-to-br from-green-light to-blue-light"
                      )}>
                        {t === 'veg' ? '🥗' : t === 'plastic' ? '💧' : '🌍'}
                      </div>

                      {/* Details */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-[15px] text-text-main">
                            {t === 'veg' ? '🌱 蔬食低碳挑戰' : t === 'plastic' ? '🌊 海岸淨塑挑戰' : '🌍 雙軌並進挑戰'}
                          </span>
                          {isLocked && (
                            <span className="text-[9px] font-black text-red-500 bg-red-50 border border-red-200/50 px-2 py-0.5 rounded-lg flex items-center gap-0.5">未解鎖 🔒</span>
                          )}
                        </div>
                        <p className="text-[11px] text-text-sub font-bold leading-normal mt-0.5">
                          {isLocked ? '需要將「蔬食」或「淨塑」挑戰到第三關才能開啟喔！' :
                           t === 'veg' ? '餐餐多吃蔬果，身體清爽少負擔，還能幫地球減碳！' :
                           t === 'plastic' ? '少用塑膠袋與塑膠杯，愛護地球與海洋生物！' :
                           '「蔬食」與「減塑」同時挑戰，永續環保的最高境界！'}
                        </p>
                      </div>

                      {/* Selection indicator */}
                      {!isLocked && isActive && (
                        <div 
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0"
                          style={{ backgroundColor: tData.themeColor }}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[4]" />
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Commemorative Certificate Modal */}
      <AnimatePresence>
        {showRewardModal !== null && (
          <div className="absolute inset-0 z-[120] bg-black/70 backdrop-blur-md flex items-center justify-center p-5 pointer-events-auto">
            <motion.div 
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              className="bg-white w-full max-w-[340px] rounded-[32px] p-5 shadow-2xl relative border border-gray-line/50 flex flex-col items-center text-center overflow-hidden"
            >
              {certificateImageUrl ? (
                <div className="w-full relative rounded-2xl overflow-hidden border border-gray-line/30 shadow-inner mb-4">
                  <img 
                    src={certificateImageUrl} 
                    alt="電子證書" 
                    className="w-full h-auto object-contain select-none"
                  />
                  <div className="absolute top-2 right-2 bg-text-main/80 backdrop-blur-sm text-white text-[9px] font-black px-2.5 py-1 rounded-lg shadow-sm">
                    📱 長按儲存圖片
                  </div>
                </div>
              ) : (
                <div className="w-full h-[360px] flex flex-col items-center justify-center gap-4 mb-4 bg-gray-line/20 rounded-2xl">
                  <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                    className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full"
                  />
                  <p className="text-xs text-text-sub font-black">正在為您製作專屬證書...</p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="w-full flex flex-col gap-2">
                <button 
                  onClick={() => {
                    playSound('click');
                    if (certificateImageUrl) {
                      const link = document.createElement('a');
                      link.href = certificateImageUrl;
                      link.download = `永續大挑戰_${
                        showRewardModal === 'veg' ? '蔬食守護者' : 
                        showRewardModal === 'plastic' ? '淨塑守護者' : 
                        '地球友善勇士'
                      }_證書.png`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      alert('🎉 開始下載您的榮譽證書！\n如果手機瀏覽器未自動下載，您也可以直接「長按證書圖片」來儲存它喔！');
                    } else {
                      alert('💡 證書還在製作中，請稍候再試！');
                    }
                  }}
                  className="w-full bg-[#FFD166] text-text-main font-black py-3 rounded-2xl text-xs btn-active flex items-center justify-center gap-1.5 shadow-md shadow-orange-200 border-b-4 border-orange-300"
                >
                  <Download className="w-3.5 h-3.5" /> 儲存證書至手機
                </button>
                <button 
                  onClick={() => {
                    playSound('click');
                    setShowRewardModal(null);
                  }}
                  className="w-full py-2.5 rounded-xl border border-gray-line text-xs text-text-sub font-black hover:bg-gray-50 transition-colors btn-active"
                >
                  關閉證書
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Personality Quiz Modal */}
      <AnimatePresence>
        {showQuizModal && (
          <div className="absolute inset-0 z-[160] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-auto">
            <motion.div 
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              className="bg-white rounded-[36px] p-8 w-full max-w-[320px] text-center shadow-2xl border-4 border-white flex flex-col items-center relative"
            >
              <div className="text-4xl mb-4 animate-bounce">🔍</div>
              <h3 className="font-black text-text-main text-lg mb-2">永續屬性快速檢測</h3>
              <p className="text-xs text-text-sub font-semibold leading-relaxed mb-6">
                選一個您日常生活中最容易做到的環保小事，我們為您推薦最適合的起點！
              </p>
              
              <div className="flex flex-col gap-3 w-full">
                <button 
                  onClick={() => {
                    setQuizRecommendation('veg');
                    setTempTrack('veg');
                    setShowQuizModal(false);
                    playSound('success');
                  }}
                  className="w-full bg-[#EAF7ED] text-[#2D6A4F] border border-[#2D6A4F]/20 font-black py-4 rounded-2xl text-xs hover:bg-[#D8F3DC] transition-all btn-active"
                >
                  🍱 享用一頓美味的蔬食無肉餐
                </button>
                <button 
                  onClick={() => {
                    setQuizRecommendation('plastic');
                    setTempTrack('plastic');
                    setShowQuizModal(false);
                    playSound('success');
                  }}
                  className="w-full bg-[#E8F1F5] text-[#1D3557] border border-[#1D3557]/20 font-black py-4 rounded-2xl text-xs hover:bg-[#D0E1EA] transition-all btn-active"
                >
                  🛍️ 出門自備購物袋或環保杯
                </button>
                <button 
                  onClick={() => {
                    const isDualUnlocked = getLevelForTrack('veg', state.unlockedBadges) >= 3 || getLevelForTrack('plastic', state.unlockedBadges) >= 3;
                    if (isDualUnlocked) {
                      setQuizRecommendation('dual');
                      setTempTrack('dual');
                      setShowQuizModal(false);
                      playSound('success');
                    } else {
                      alert('🌟 雙軌並進是高難度任務，推薦您先從【蔬食任務】或【淨塑任務】開始修煉，很快就能解鎖雙軌喔！');
                      setQuizRecommendation('veg');
                      setTempTrack('veg');
                      setShowQuizModal(false);
                      playSound('success');
                    }
                  }}
                  className="w-full bg-[#F3F4F6] text-text-main border border-gray-line font-black py-4 rounded-2xl text-xs hover:bg-gray-100 transition-all btn-active"
                >
                  🔥 我兩個都想試！挑戰雙軌任務
                </button>
                <button 
                  onClick={() => {
                    playSound('click');
                    setShowQuizModal(false);
                  }}
                  className="text-text-sub/50 hover:text-text-sub font-bold text-[10px] tracking-widest uppercase transition-colors py-2 mt-2"
                >
                  取消關閉 Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Onboarding / Tutorial Carousel Modal */}
      <AnimatePresence>
        {showTutorialModal && (
          <div className="absolute inset-0 z-[150] bg-gradient-to-br from-[#FAFFFD] to-[#E8F5D8] pointer-events-auto flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[40px] p-8 w-full max-w-[325px] text-center shadow-float border-4 border-white flex flex-col items-center relative"
            >
              {/* Pagination Dots */}
              <div className="flex gap-2 mb-6">
                {[0, 1, 2, 3].map(idx => (
                  <div 
                    key={idx}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all duration-300",
                      idx === tutorialSlide ? "w-6 bg-text-main" : "bg-gray-line"
                    )}
                  />
                ))}
              </div>

              {/* Slide Content */}
              {tutorialSlide === 0 && (
                <motion.div 
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col items-center"
                >
                  <div className="text-4xl mb-4 animate-bounce">🌍</div>
                  <h4 className="font-black text-text-main text-lg mb-2">1. 地球的綠色召喚</h4>
                  <p className="text-xs text-text-sub font-semibold leading-relaxed mb-6">
                    我們的地球正面臨極端氣候與塑膠污染危機！但您可以成為改變的力量，點滴的善意實踐，都是守護這片大地的超能力。
                  </p>
                </motion.div>
              )}

              {tutorialSlide === 1 && (
                <motion.div 
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col items-center w-full text-left"
                >
                  <h4 className="font-black text-text-main text-base mb-3 text-center self-center">2. 三大挑戰路線對比</h4>
                  
                  <div className="flex flex-col gap-2.5 w-full max-h-[220px] overflow-y-auto pr-1">
                    {/* Veg Card */}
                    <div className="bg-[#EAF7ED] border border-[#2D6A4F]/20 rounded-2xl p-3 flex gap-2">
                      <span className="text-xl shrink-0 mt-0.5">🥬</span>
                      <div>
                        <h5 className="font-black text-[10px] text-[#2D6A4F] leading-tight">蔬食低碳 ➔ 「嘴巴做環保」</h5>
                        <p className="text-[9px] text-text-sub font-semibold mt-0.5 leading-normal">
                          少吃肉、多吃植物性食物。第一步非常簡單，只要在午餐觀察青菜比例。
                        </p>
                      </div>
                    </div>
                    
                    {/* Plastic Card */}
                    <div className="bg-[#E8F1F5] border border-[#1D3557]/20 rounded-2xl p-3 flex gap-2">
                      <span className="text-xl shrink-0 mt-0.5">💧</span>
                      <div>
                        <h5 className="font-black text-[10px] text-[#1D3557] leading-tight">海岸淨塑 ➔ 「出門帶裝備」</h5>
                        <p className="text-[9px] text-text-sub font-semibold mt-0.5 leading-normal">
                          自備環保杯/袋，拒絕一次性塑膠。第一步是數數自己今天用了幾個塑膠袋。
                        </p>
                      </div>
                    </div>
                    
                    {/* Dual Card */}
                    <div className="bg-[#F3F4F6] border border-gray-line rounded-2xl p-3 flex gap-2 opacity-75 relative">
                      <span className="text-xl shrink-0 mt-0.5">🌍</span>
                      <div>
                        <h5 className="font-black text-[10px] text-text-main leading-tight flex items-center gap-1">
                          雙軌並進 ➔ 「永續大師」 <span className="text-[8px] bg-gray-line text-text-sub px-1 rounded font-normal">🔒 鎖定</span>
                        </h5>
                        <p className="text-[9px] text-text-sub font-semibold mt-0.5 leading-normal">
                          蔬食與淨塑雙修挑戰。需要前兩個軌道皆達 Lv.3 才能解鎖。
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {tutorialSlide === 2 && (
                <motion.div 
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col items-center"
                >
                  <div className="text-4xl mb-4 animate-bounce">🏆</div>
                  <h4 className="font-black text-text-main text-lg mb-2">3. 行動打卡，解鎖榮譽</h4>
                  <p className="text-xs text-text-sub font-semibold leading-relaxed mb-6">
                    點開地圖關卡，勾選實踐項目並上傳打卡即可獲得 EXP！升級解鎖專屬頭銜，集滿四關還能領取精美的個人榮譽電子證書！
                  </p>
                </motion.div>
              )}

              {tutorialSlide === 3 && (
                <motion.div 
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col items-center"
                >
                  <div className="text-4xl mb-4 animate-bounce">🚀</div>
                  <h4 className="font-black text-text-main text-lg mb-2">4. 隨時開啟新冒險</h4>
                  <p className="text-xs text-text-sub font-semibold leading-relaxed mb-6">
                    您可以隨時在「蔬食低碳」、「海岸淨塑」與「雙軌並進」三條路線間自由切換，所有已解鎖的徽章和經驗值進度都會完美保留！
                  </p>
                </motion.div>
              )}

              {/* Action Buttons */}
              <div className="w-full flex flex-col gap-2 mt-2">
                {tutorialSlide < 3 ? (
                  <button 
                    onClick={() => {
                      playSound('click');
                      setTutorialSlide(prev => prev + 1);
                    }}
                    className="w-full bg-text-main text-white font-black py-3 rounded-2xl text-xs btn-active flex items-center justify-center gap-1.5 shadow-md shadow-text-main/10"
                  >
                    了解，下一步 <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button 
                    onClick={async () => {
                      playSound('success');
                      setShowTutorialModal(false);
                      await updateFirebaseState({ hasCompletedTutorial: true });
                      setCurrentView('select'); // Force route to track selection screen!
                    }}
                    className="w-full bg-text-main text-white font-black py-3.5 rounded-2xl text-xs btn-active flex items-center justify-center gap-1.5 shadow-md shadow-text-main/10"
                  >
                    完成，選擇挑戰路線！ ➔
                  </button>
                )}

                {tutorialSlide > 0 && (
                  <button 
                    onClick={() => {
                      playSound('click');
                      setTutorialSlide(prev => prev - 1);
                    }}
                    className="w-full py-2.5 rounded-xl border border-gray-line text-xs text-text-sub font-black hover:bg-gray-50 transition-colors btn-active"
                  >
                    上一步
                  </button>
                )}

                {tutorialSlide < 3 && (
                  <button 
                    onClick={async () => {
                      playSound('click');
                      setShowTutorialModal(false);
                      await updateFirebaseState({ hasCompletedTutorial: true });
                      setCurrentView('select'); // Force route to track selection screen!
                    }}
                    className="text-text-sub/50 hover:text-text-sub font-bold text-[10px] tracking-widest uppercase transition-colors py-2 mt-1"
                  >
                    跳過教學 Skip
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Onboarding Profile Setup Modal */}
      <AnimatePresence>
        {(!authLoading && !!user && state.hasCompletedTutorial && !state.customDisplayName) && (
          <div className="absolute inset-0 z-[160] bg-gradient-to-br from-[#FAFFFD] to-[#E8F5D8] pointer-events-auto flex items-center justify-center p-6 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[40px] p-8 w-full max-w-[340px] text-center shadow-float border-4 border-white flex flex-col items-center relative my-8"
            >
              <div className="w-16 h-16 bg-green-light rounded-2xl flex items-center justify-center text-4xl mb-4 shadow-sm">🌱</div>
              <h2 className="text-2xl font-black text-text-main mb-2 tracking-tight">建立探險家檔案</h2>
              <p className="text-[11px] text-text-sub font-semibold mb-6 leading-relaxed">
                保護隱私！請選擇在此挑戰動態牆上公開顯示的名稱與頭像，您的真實姓名將不會被公開。
              </p>

              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!profileSetupName.trim()) {
                    alert('請輸入玩家暱稱！');
                    return;
                  }
                  await updateFirebaseState({
                    customDisplayName: profileSetupName.trim(),
                    customAvatarSeed: profileSetupAvatar
                  });
                }}
                className="w-full flex flex-col gap-5 text-left"
              >
                <div>
                  <label className="block text-xs font-black text-text-sub uppercase tracking-wider mb-2">
                    ✍️ 玩家暱稱
                  </label>
                  <input 
                    type="text" 
                    value={profileSetupName}
                    onChange={(e) => setProfileSetupName(e.target.value)}
                    maxLength={15}
                    placeholder="輸入暱稱..."
                    className="w-full bg-gray-line/50 border-2 border-transparent rounded-2xl px-4 py-3.5 text-base focus:outline-none focus:border-green-main focus:bg-white transition-all shadow-inner-soft font-bold text-text-main"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-text-sub uppercase tracking-wider mb-2">
                    🎭 選擇頭像
                  </label>
                  
                  {/* Selected Avatar Preview */}
                  <div className="flex items-center justify-center mb-4">
                    <div className="w-20 h-20 rounded-full border-4 border-green-light/40 bg-gray-line/30 shadow-inner overflow-hidden flex items-center justify-center">
                      <img 
                        src={`https://api.dicebear.com/7.x/notionists/svg?seed=${profileSetupAvatar || 'anon'}&backgroundColor=transparent`} 
                        className="w-full h-full object-cover"
                        alt="Avatar Preview"
                      />
                    </div>
                  </div>

                  {/* Preset Options Grid */}
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {['Bella', 'Felix', 'Charlie', 'Daisy', 'Oliver', 'Ruby', 'Sam', 'Leo'].map(seed => {
                      const isSelected = profileSetupAvatar === seed && !profileCustomAvatarText;
                      return (
                        <div 
                          key={seed}
                          onClick={() => {
                            playSound('click');
                            setProfileSetupAvatar(seed);
                            setProfileCustomAvatarText('');
                          }}
                          className={cn(
                            "w-12 h-12 rounded-xl border-2 flex items-center justify-center cursor-pointer transition-all bg-gray-50",
                            isSelected ? "border-green-main ring-2 ring-green-main/30 scale-105" : "border-transparent opacity-75 hover:opacity-100"
                          )}
                        >
                          <img 
                            src={`https://api.dicebear.com/7.x/notionists/svg?seed=${seed}&backgroundColor=transparent`} 
                            className="w-10 h-10 object-cover"
                            alt={seed}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Custom Seed Input */}
                  <div className="mt-3">
                    <span className="text-[10px] font-black text-text-sub/70 block mb-1">💡 或是輸入任意字詞生成獨特頭像：</span>
                    <input 
                      type="text" 
                      value={profileCustomAvatarText}
                      onChange={(e) => {
                        const val = e.target.value;
                        setProfileCustomAvatarText(val);
                        setProfileSetupAvatar(val.trim() || 'Felix');
                      }}
                      placeholder="例如你的英文名字..."
                      className="w-full bg-gray-line/40 border border-transparent rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-green-main focus:bg-white transition-all shadow-inner-soft text-text-main font-medium"
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-text-main text-white font-black py-4 rounded-2xl text-sm btn-active flex items-center justify-center gap-1.5 shadow-md shadow-text-main/10 mt-2"
                >
                  開始你的挑戰之旅！ ➔
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Helper Components ---

function NavItem({ active, onClick, icon, label, dataGuide, className }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; dataGuide?: string; className?: string }) {
  return (
    <div 
      onClick={onClick}
      data-guide={dataGuide}
      className={cn(
        "flex flex-col items-center gap-1.5 cursor-pointer transition-all duration-300",
        active ? "text-nav-accent" : "text-gray-lock hover:text-text-sub",
        className
      )}
    >
      <motion.div 
        animate={active ? { y: -5, scale: 1.1 } : { y: 0, scale: 1 }}
        className="text-xl"
      >
        {React.cloneElement(icon as React.ReactElement, { strokeWidth: active ? 2.5 : 2, size: 24 })}
      </motion.div>
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
      {active && <motion.div layoutId="nav-dot" className="w-1 h-1 rounded-full" style={{ backgroundColor: '#4A9166' }} />}
    </div>
  );
}

function StatCard({ icon, color, label, value }: { icon: React.ReactNode; color: string; label: string; value: string | number }) {
  const colorMap: Record<string, string> = {
    green: 'bg-green-light text-green-main',
    blue: 'bg-blue-light text-blue-main',
    orange: 'bg-orange-50 text-orange-500',
    cyan: 'bg-cyan-50 text-cyan-600'
  };

  return (
    <div className="bg-white p-4 rounded-3xl shadow-soft border border-gray-line/30 flex items-center gap-4 transition-all hover:shadow-lg group">
      <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center text-sm shrink-0 group-hover:scale-110 transition-transform", colorMap[color])}>
        {icon}
      </div>
      <div className="overflow-hidden">
        <div className="text-[9px] font-black text-text-sub/60 uppercase tracking-widest truncate">{label}</div>
        <div className="font-black text-sm text-text-main truncate">{value}</div>
      </div>
    </div>
  );
}

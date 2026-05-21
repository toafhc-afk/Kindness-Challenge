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
  MessageCircle,
  Star,
  Search,
  LogOut,
  LogIn,
  Trash2,
  X,
  Gift,
  Award,
  Download
} from 'lucide-react';
import { useAuth } from './lib/AuthContext';
import { loginWithGoogle, loginAnonymously, googleProvider, auth, db, storage } from './lib/firebase';
import { signOut, linkWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit, onSnapshot, deleteDoc, arrayUnion } from 'firebase/firestore';
import { TRACK_DATA, LEVELS_EXP_REQ, TITLES, TITLES_BY_TRACK, BADGES } from './constants';
import { View, Track, Task, AppState, Badge } from './types';
import { cn, calculateLevel, getLevelForTrack } from './lib/utils';

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
  
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [tempTrack, setTempTrack] = useState<Track | null>(null);
  const [previewTab, setPreviewTab] = useState<'veg' | 'plastic'>('veg');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [isMapLeveledUp, setIsMapLeveledUp] = useState(false);
  const [isRankLeveledUp, setIsRankLeveledUp] = useState(false);
  const [globalFeed, setGlobalFeed] = useState<any[]>([]);
  const [newUnlockedBadges, setNewUnlockedBadges] = useState<Badge[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<Badge | null>(null);
  const [showRewardModal, setShowRewardModal] = useState<Track | null>(null);

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

  // Map interactive state
  const [selectedMapTaskIndex, setSelectedMapTaskIndex] = useState<number | null>(null);

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

  // When entering map, scroll to bottom so level 1 is visible first
  useEffect(() => {
    if (currentView === 'map' && scrollContainerRef.current) {
      const el = scrollContainerRef.current;
      // Use requestAnimationFrame to ensure content is rendered
      const raf = requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [currentView]);

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
    }
  }, [firebaseState]);

  // Initial routing logic: Auto-switch based on user state
  useEffect(() => {
    if (!authLoading && user) {
      const stateToUse = localState || firebaseState;
      if (stateToUse) {
        if (!stateToUse.hasSeenPreview) {
          updateFirebaseState({ hasSeenPreview: true });
          setCurrentView('select');
        } else if (!stateToUse.track) {
          setCurrentView('select');
        } else if (currentView === 'preview' || currentView === 'select') {
          setCurrentView('dashboard');
        }
      }
    }
  }, [authLoading, user, firebaseState]);

  // Trigger tutorial modal if not completed yet
  useEffect(() => {
    const stateToUse = localState || firebaseState;
    if (user && stateToUse && stateToUse.track && !stateToUse.hasCompletedTutorial && !showTutorialModal && currentView === 'dashboard') {
      setShowTutorialModal(true);
      setTutorialSlide(0);
    }
  }, [user, localState, firebaseState, currentView, showTutorialModal]);

  // Load feed from Firestore
  useEffect(() => {
    if (!user) {
      setGlobalFeed([]);
      return;
    }
    const q = query(collection(db, 'checkins'), orderBy('timestamp', 'desc'), limit(10));
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
  }, [user]);

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
    if (!state.track && !['preview', 'select', 'profile'].includes(target)) {
      setCurrentView('select');
      return;
    }
    setCurrentView(target);
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
      <p className="text-sm text-text-sub mb-8 font-medium">選擇適合你的路線，開啟你的永續旅程！</p>

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
                  推薦
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

  const DashboardView = () => {
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
      <div className="flex flex-col min-h-full bg-white-main">
        <div className={`bg-gradient-to-b ${heroGrad} to-white-main px-6 pt-10 pb-8 rounded-b-[40px] shadow-sm`}>
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-2xl font-black text-text-main flex items-center gap-2 tracking-tight">
                你好，探險家 <motion.span animate={{ rotate: [0, 20, 0] }} transition={{ repeat: Infinity, duration: 2 }}>👋</motion.span>
              </h2>
              <p className="text-sm text-text-sub font-medium opacity-80">一起讓世界變得更好！</p>
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
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="w-14 h-14 rounded-full bg-white shadow-lg p-1 overflow-hidden border-2"
              style={{ borderColor: tc }}
            >
              <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=${state.track || 'anon'}&backgroundColor=transparent`} alt="Avatar" />
            </motion.div>
          </div>

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
                恭喜完成{track === 'veg' ? '蔬食' : track === 'plastic' ? '淨塑' : '雙軌'}任務！✨
              </h3>
              <p className="text-[13px] text-text-sub mb-6 leading-relaxed font-medium">
                你已經成功集滿本軌道的 4 枚關卡章！挑戰其他軌道，集齊全部徽章以獲得最高榮耀【永續守護神】吧！
              </p>
              <button 
                onClick={() => {
                  setTempTrack(track);
                  setCurrentView('select');
                }} 
                className="w-full text-white font-black py-4 rounded-2xl text-sm btn-active flex items-center justify-center gap-2"
                style={{ backgroundColor: tc }}
              >
                挑戰其他軌道 <ChevronRight className="w-4 h-4" />
              </button>
            </motion.div>
          ) : (
            <motion.div 
              whileHover={{ scale: 1.02 }}
              className="bg-white rounded-[32px] p-6 shadow-soft relative overflow-hidden group border-l-[6px]"
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
              <button 
                onClick={() => {
                  handleNav('map');
                }} 
                className="w-full bg-text-main text-white font-black py-4 rounded-2xl text-sm btn-active flex items-center justify-center gap-2"
              >
                前往挑戰地圖 <ChevronRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </div>
      </div>
    );
  };

  const MapView = () => {
    const track = state.track || 'veg';
    const data = TRACK_DATA[track];
    const tasks = data.tasks;
    const isTrackCompleted = state.unlockedBadges.includes(`${track}_complete`);
    const tc = data.themeColor;
    const tl = data.lightColor;

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
      <div className="flex flex-col min-h-full relative" style={{ backgroundColor: data.bg }}>
        <div className="sticky top-0 z-20 px-6 py-6 bg-white/80 backdrop-blur-xl border-b border-gray-line/50 flex items-center justify-between">
          <h2 className="text-xl font-black text-text-main tracking-tight">
            {track === 'veg' ? '田園闖關地圖' : track === 'plastic' ? '海岸淨塑地圖' : '雙軌冒險地圖'}
          </h2>
          <div className="text-[10px] font-black bg-text-main text-white px-3 py-1.5 rounded-full uppercase tracking-widest">
            {state.level} / 4
          </div>
        </div>
        
        <div className="px-6 py-12 relative flex flex-col gap-20" style={{ paddingBottom: 'calc(9rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className="absolute top-12 h-[640px] left-1/2 -translate-x-1/2 w-3 bg-gray-line rounded-full z-0 overflow-hidden">
            <motion.div 
              initial={{ height: 0 }}
              animate={{ height: `${progressPercent}%` }}
              style={{ backgroundColor: data.themeColor }}
              className="absolute bottom-0 w-full transition-all duration-1000"
            />
          </div>

          {tasks.slice().reverse().map((task, reverseIdx) => {
            const idx = 3 - reverseIdx;
            const status = idx + 1 < state.level ? 'done' : idx + 1 === state.level ? 'active' : 'locked';
            const isLevel1Node = idx === 0;
            return (
              <motion.div 
                key={task.id}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className={cn(
                  "relative z-10 flex items-center cursor-pointer",
                  idx % 2 === 0 ? "justify-start pl-[5%]" : "justify-end pr-[5%]"
                )}
                onClick={() => {
                  setSelectedMapTaskIndex(idx);
                }}
              >
                <div className={cn(
                  "flex items-center gap-6",
                  idx % 2 === 0 ? "flex-row" : "flex-row-reverse text-right"
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
    const data = TRACK_DATA[track];
    const task = data.tasks[Math.min(state.level - 1, 3)];

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
        if (track === 'veg' || track === 'dual') newCo2Count += 0.8;
        if (track === 'plastic' || track === 'dual') newCo2Count += 0.5;
        
        const today = new Date().toDateString();
        if (state.lastCheckInDate !== today) {
          newStreak += 1;
        }

        // Advance to next task (level) after every check-in
        const totalChecks = state.checkInCount + 1;
        if (state.level < 4) {
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

        // 2. Create CheckIn record
        console.log('Creating checkin record...');
        await addDoc(collection(db, 'checkins'), {
          userId: user?.uid,
          userName: user?.displayName || '匿名探險家',
          userAvatar: track,
          track,
          level: state.level, // The level they just completed
          text: checkinText,
          imageUrl,
          checklistItems: checkinSelectedOptions,
          timestamp: serverTimestamp(),
          expGained: amount + (mapUp ? 50 : 0),
          likes: 0
        });

        // 3. Update User State
        console.log('Updating user state...');
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
        await updateFirebaseState(updates);

        // Reset checkin form state
        setCheckinText('');
        setCheckinSelectedFile(null);
        setCheckinPreviewUrl(null);
        setCheckinSelectedOptions([]);

        // 4. Trigger UI
        const nextRankLv = calculateLevel(newExp, LEVELS_EXP_REQ);
        setIsRankLeveledUp(oldRankLv < nextRankLv);
        setIsMapLeveledUp(mapUp);
        
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
    const theme = levelThemes[Math.min(state.level - 1, 3)];

    return (
      <div className="px-6 py-8 min-h-full flex flex-col pt-12">
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
            <div id="tutorial-step5-checklist" className="mb-6 bg-white border border-gray-line p-5 rounded-3xl shadow-soft">
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
                        if (isChecked) {
                          setCheckinSelectedOptions(checkinSelectedOptions.filter(o => o !== item));
                        } else {
                          setCheckinSelectedOptions([...checkinSelectedOptions, item]);
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

          <div className="mb-6">
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

          <div className="mt-auto">
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
        </form>
      </div>
    );
  };

  const renderFeedView = () => (
    <div className="flex flex-col min-h-full bg-gray-line/20">
      <div className="sticky top-0 z-20 px-6 py-6 bg-white/90 backdrop-blur-xl border-b border-gray-line/50 flex justify-between items-center">
        <h2 className="text-xl font-black text-text-main tracking-tight">探索動態</h2>
        <div className="flex gap-2">
          <span className="text-[10px] font-black bg-text-main text-white px-4 py-2 rounded-full cursor-pointer uppercase tracking-widest">全部</span>
          <span className="text-[10px] font-black text-text-sub/50 px-4 py-2 cursor-pointer uppercase tracking-widest hover:text-text-main transition-colors">關注</span>
        </div>
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
                          userName: user?.displayName || '匿名探險家',
                          userAvatar: state.track || 'anon',
                          text: commentInputText.trim(),
                          timestamp: Date.now(),
                          userId: user?.uid
                        })
                      });
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
      </div>
    </div>
  );

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
      <div className="flex flex-col min-h-full bg-white-main">
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
                src={`https://api.dicebear.com/7.x/notionists/svg?seed=${state.track || 'felix'}&backgroundColor=transparent`} 
                alt="Avatar" 
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <h2 className="text-24pt font-black text-text-main tracking-tight leading-tight">
                {user?.isAnonymous ? '訪客探險家' : (user?.displayName || '匿名探險家')}
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
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-black text-lg text-text-main tracking-tight">徽章收藏庫</h3>
              <div className="text-[10px] font-black text-text-sub uppercase tracking-[0.2em]">
                {state.unlockedBadges.length} / {BADGES.length}
              </div>
            </div>

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
                    return (
                      <motion.div 
                        key={badge.id}
                        onClick={() => setSelectedBadge(badge)}
                        whileHover={isUnlocked ? { y: -2 } : {}}
                        className="flex flex-col items-center text-center group cursor-pointer"
                      >
                        <div className={cn(
                          "w-14 h-14 rounded-full mb-2 flex items-center justify-center text-xl transition-all duration-500",
                          isUnlocked ? `bg-gradient-to-br ${trackInfo.color} shadow-float border-2 ${trackInfo.border}` : "bg-gray-line/50 text-gray-lock filter grayscale opacity-40 scale-90 border-2 border-transparent"
                        )}>
                          {badge.icon}
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
                          "w-24 h-24 rounded-full flex items-center justify-center text-4xl transition-all duration-500 z-10",
                          isUnlocked ? `bg-gradient-to-br ${trackInfo.color} shadow-[0_10px_25px_rgba(0,0,0,0.1)] border-4 border-white` : "bg-gray-line/30 text-gray-lock filter grayscale opacity-40 scale-90 border-4 border-transparent"
                        )}>
                          {badge.icon}
                          {!isUnlocked && (
                             <div className="absolute inset-0 flex items-center justify-center bg-black/5 rounded-full backdrop-blur-[1px]">
                               <Lock className="w-6 h-6 text-gray-lock" />
                             </div>
                          )}
                        </div>
                        {isUnlocked && (
                          <div className="absolute inset-0 bg-white/20 rounded-full animate-ping opacity-20" />
                        )}
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
    <div id="app-container" className="max-w-[400px] mx-auto bg-white-main h-svh relative overflow-hidden flex flex-col shadow-2xl">
      <AnimatePresence mode="wait">
        <motion.div 
          key={currentView}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 400 }}
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto hide-scrollbar pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))]"
        >
          {currentView === 'preview' && renderPreviewView()}
          {currentView === 'select' && renderSelectView()}
          {currentView === 'dashboard' && <DashboardView />}
          {currentView === 'map' && <MapView />}
          {currentView === 'checkin' && renderCheckinView()}
          {currentView === 'feed' && renderFeedView()}
          {currentView === 'profile' && renderProfileView()}
          {currentView === 'admin' && <AdminView />}
        </motion.div>
      </AnimatePresence>

      <nav id="bottom-nav" className={cn(
        "absolute bottom-0 left-0 w-full h-[calc(6rem+env(safe-area-inset-bottom,0px))] pb-[env(safe-area-inset-bottom,0px)] bg-white/95 backdrop-blur-xl border-t border-gray-line/50 flex justify-around items-center px-4 z-40 transition-all duration-500",
        ['preview', 'select'].includes(currentView) || (!isNavVisible && currentView !== 'map') ? "translate-y-full opacity-0" : "translate-y-0 opacity-100"
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

        <NavItem active={currentView === 'feed'} onClick={() => handleNav('feed')} icon={<Compass />} label="探索" />
        <NavItem active={currentView === 'profile'} onClick={() => handleNav('profile')} icon={<User />} label="我的" />
      </nav>

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
                "w-24 h-24 mx-auto rounded-full flex items-center justify-center text-5xl mb-6 shadow-inner",
                state.unlockedBadges.includes(selectedBadge.id) ? "bg-gradient-to-br from-[#FFF0E5] to-[#FFD166] shadow-float border-4 border-white" : "bg-gray-line/50 filter grayscale opacity-40 border-4 border-transparent"
              )}>
                {selectedBadge.icon}
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
                <div className="text-[10px] font-black text-green-main tracking-widest uppercase bg-green-light/50 py-3 rounded-2xl border border-green-main/20">
                  已於 {state.badgeUnlockDates[selectedBadge.id] ? new Date(state.badgeUnlockDates[selectedBadge.id]).toLocaleDateString() : '未知時間'} 達成
                </div>
              ) : (
                <div className="text-[10px] font-black text-gray-lock tracking-widest uppercase flex items-center justify-center gap-2">
                  <Lock className="w-3 h-3" /> 尚未解鎖
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
            <motion.div 
              key={newUnlockedBadges[0].id}
              initial={{ scale: 0.5, opacity: 0, rotate: -10 }} 
              animate={{ scale: 1, opacity: 1, rotate: 0 }} 
              exit={{ scale: 0.8, opacity: 0, y: -50 }}
              transition={{ type: "spring", damping: 15 }}
              className="bg-white rounded-[48px] p-10 w-full max-w-sm text-center relative overflow-hidden shadow-2xl border-2 border-[#FFD166]/30"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#FF9F1C] to-[#FFD166]" />
              
              <div className="w-32 h-32 mx-auto rounded-full bg-gradient-to-br from-[#FFF0E5] to-[#FFD166] flex items-center justify-center text-6xl mb-8 shadow-float border-8 border-white relative pulse-glow">
                {newUnlockedBadges[0].icon}
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3 }} className="absolute -bottom-2 -right-2 bg-white rounded-full p-2 shadow-sm">
                  <Star className="w-8 h-8 fill-[#FF9F1C] text-[#FF9F1C]" />
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

      {/* Onboarding / Tutorial Carousel Modal */}
      <AnimatePresence>
        {showTutorialModal && (
          <div className="absolute inset-0 z-[150] bg-black/65 backdrop-blur-sm pointer-events-auto flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-[40px] p-8 w-full max-w-[320px] text-center shadow-2xl border-4 border-white flex flex-col items-center relative"
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
                  <div className="text-4xl mb-4 animate-bounce">🏆</div>
                  <h4 className="font-black text-text-main text-lg mb-2">1. 累積 EXP 解鎖榮譽</h4>
                  <p className="text-xs text-text-sub font-semibold leading-relaxed mb-6">
                    在「永續大挑戰」中，你每一次的綠色實踐都會轉化成 EXP 經驗值！提升等級還能解鎖各階段專屬稱號與精美徽章！
                  </p>
                </motion.div>
              )}

              {tutorialSlide === 1 && (
                <motion.div 
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col items-center"
                >
                  <div className="text-4xl mb-4 animate-bounce">🗺️</div>
                  <h4 className="font-black text-text-main text-lg mb-2">2. 展開地圖任務挑戰</h4>
                  <p className="text-xs text-text-sub font-semibold leading-relaxed mb-6">
                    點選下方導覽列的「地圖」或首頁的「前往挑戰地圖」按鈕，即可查看該軌道的所有關卡，開啟你的冒險之旅！
                  </p>
                </motion.div>
              )}

              {tutorialSlide === 2 && (
                <motion.div 
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col items-center"
                >
                  <div className="text-4xl mb-4 animate-bounce">📸</div>
                  <h4 className="font-black text-text-main text-lg mb-2">3. 綠色實踐與打卡</h4>
                  <p className="text-xs text-text-sub font-semibold leading-relaxed mb-6">
                    點開關卡並點擊「立即打卡行動」，勾選你實行的環保項目、填寫心得，送出後就能獲得 EXP 並與大家分享喜悅！
                  </p>
                </motion.div>
              )}

              {tutorialSlide === 3 && (
                <motion.div 
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col items-center"
                >
                  <div className="text-4xl mb-4 animate-bounce">⚙️</div>
                  <h4 className="font-black text-text-main text-lg mb-2">4. 隨時切換挑戰軌道</h4>
                  <p className="text-xs text-text-sub font-semibold leading-relaxed mb-6">
                    除了蔬食、減塑，你可以隨時到個人帳號設定切換想要挑戰的軌道，所有已解鎖的徽章和經驗值進度都會被完美保留！
                  </p>
                </motion.div>
              )}

              {/* Action Buttons */}
              <div className="w-full flex flex-col gap-2 mt-2">
                {tutorialSlide < 3 ? (
                  <button 
                    onClick={() => setTutorialSlide(prev => prev + 1)}
                    className="w-full bg-text-main text-white font-black py-3 rounded-2xl text-xs btn-active flex items-center justify-center gap-1.5 shadow-md shadow-text-main/10"
                  >
                    了解，下一步 <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button 
                    onClick={async () => {
                      setShowTutorialModal(false);
                      await updateFirebaseState({ hasCompletedTutorial: true });
                    }}
                    className="w-full bg-text-main text-white font-black py-3 rounded-2xl text-xs btn-active flex items-center justify-center gap-1.5 shadow-md shadow-text-main/10"
                  >
                    開始永續挑戰！ 🎉
                  </button>
                )}

                {tutorialSlide > 0 && (
                  <button 
                    onClick={() => setTutorialSlide(prev => prev - 1)}
                    className="w-full py-2.5 rounded-xl border border-gray-line text-xs text-text-sub font-black hover:bg-gray-50 transition-colors btn-active"
                  >
                    上一步
                  </button>
                )}

                {tutorialSlide < 3 && (
                  <button 
                    onClick={async () => {
                      setShowTutorialModal(false);
                      await updateFirebaseState({ hasCompletedTutorial: true });
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
    </div>
  );
}

// --- Helper Components ---

function NavItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 cursor-pointer transition-all duration-300",
        active ? "text-nav-accent" : "text-gray-lock hover:text-text-sub"
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

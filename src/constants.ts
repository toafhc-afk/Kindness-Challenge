import { TrackData, Badge, Track } from './types';

export const LEVELS_EXP_REQ = [0, 100, 250, 450, 700];
export const TITLES = ['綠芽學徒', '行動探索者', '慈心實踐家', '永續影響者', '地球守護神'];

export const TRACK_DATA: Record<Track, TrackData> = {
  veg: {
    themeColor: '#9FD356',
    lightColor: '#E8F5D8',
    bg: '#FAFFFD',
    tasks: [
      { id: 1, title: '看見', desc: '植物性食物佔幾成？', fullDesc: '觀察並記錄今天一餐中，植物性食物的比例。', icon: '🌱' },
      { id: 2, title: '選擇', desc: '完成一餐全蔬食', fullDesc: '挑戰一餐完全不含肉類與動物性成分。', icon: '🥗' },
      { id: 3, title: '深化', desc: '累積三次蔬食選擇', fullDesc: '將習慣融入日常，完成三次蔬食打卡。', icon: '🥦' },
      { id: 4, title: '擴散', desc: '帶人吃蔬食或推薦', fullDesc: '邀請一位朋友一起吃蔬食，或在社群推薦素食餐廳。', icon: '🌟' }
    ]
  },
  plastic: {
    themeColor: '#3C91E6',
    lightColor: '#E1EEFA',
    bg: '#F2F8FF',
    tasks: [
      { id: 1, title: '看見', desc: '用了幾個一次性塑膠？', fullDesc: '計算今天總共製造了幾個一次性塑膠垃圾。', icon: '👀' },
      { id: 2, title: '選擇', desc: '買東西選少包裝版本', fullDesc: '購物時，刻意選擇無包裝或少包裝的商品。', icon: '🛍️' },
      { id: 3, title: '深化', desc: '帶環保餐具出門用一次', fullDesc: '在外用餐時，使用自己攜帶的環保餐具/水壺。', icon: '🥢' },
      { id: 4, title: '擴散', desc: '把無塑好方法送給朋友', fullDesc: '分享一個你的減塑小撇步給身邊的人。', icon: '📢' }
    ]
  },
  dual: {
    themeColor: '#FF9F1C',
    lightColor: '#FFF0E5',
    bg: '#FFFAFA',
    tasks: [
      { id: 1, title: '看見', desc: '觀察生活中的塑膠與飲食', fullDesc: '記錄一天的飲食與塑膠使用狀況。', icon: '🔍' },
      { id: 2, title: '選擇', desc: '蔬食＋淨塑雙重行動', fullDesc: '同天完成：吃一餐蔬食 且 拒絕一次塑膠。', icon: '🌍' },
      { id: 3, title: '深化', desc: '連續三天雙重行動', fullDesc: '連續三天維持蔬食與減塑習慣。', icon: '🔥' },
      { id: 4, title: '擴散', desc: '發起群體友善行動', fullDesc: '邀請三位朋友一起參與一天的小挑戰。', icon: '🚀' }
    ]
  }
};

export const BADGES: Badge[] = [
  // Veg Track Badges
  { id: 'veg_1', track: 'veg', level: 1, name: '餐桌觀察家', icon: '👀', desc: '開始看見飲食與環境、生命的關聯。', condition: '完成蔬食關卡一', type: 'levelBadge' },
  { id: 'veg_2', track: 'veg', level: 2, name: '蔬食行動芽', icon: '🌱', desc: '完成一次蔬食選擇，善意開始發芽。', condition: '完成蔬食關卡二', type: 'levelBadge' },
  { id: 'veg_3', track: 'veg', level: 3, name: '綠色習慣家', icon: '🥦', desc: '累積多次蔬食行動，讓友善變成習慣。', condition: '完成蔬食關卡三', type: 'levelBadge' },
  { id: 'veg_4', track: 'veg', level: 4, name: '友善餐桌使者', icon: '🕊️', desc: '願意把蔬食行動分享給身邊的人。', condition: '完成蔬食關卡四', type: 'levelBadge' },
  { id: 'veg_complete', track: 'veg', name: '蔬食守護者', icon: '🌍', desc: '你用一次次餐桌上的選擇，讓友善成為日常。', condition: '集滿蔬食軌道 4 枚關卡章', type: 'completeBadge', reward: ['蔬食守護者電子證書', '蔬食食譜卡 PDF', '蔬食守護者紀念貼紙圖檔'] },

  // Plastic Track Badges
  { id: 'plastic_1', track: 'plastic', level: 1, name: '塑膠偵查員', icon: '🔍', desc: '開始發現生活中的一次性塑膠。', condition: '完成淨塑關卡一', type: 'levelBadge' },
  { id: 'plastic_2', track: 'plastic', level: 2, name: '少塑行動員', icon: '🛍️', desc: '做出一次低塑、少包裝的友善選擇。', condition: '完成淨塑關卡二', type: 'levelBadge' },
  { id: 'plastic_3', track: 'plastic', level: 3, name: '自備生活家', icon: '🥢', desc: '開始養成自備餐具、水壺、購物袋的習慣。', condition: '完成淨塑關卡三', type: 'levelBadge' },
  { id: 'plastic_4', track: 'plastic', level: 4, name: '海洋守護使者', icon: '🌊', desc: '把淨塑方法分享給更多人。', condition: '完成淨塑關卡四', type: 'levelBadge' },
  { id: 'plastic_complete', track: 'plastic', name: '淨塑守護者', icon: '🐋', desc: '你讓一次少用，變成一片海洋的喘息。', condition: '集滿淨塑軌道 4 枚關卡章', type: 'completeBadge', reward: ['淨塑守護者電子證書', '減塑生活行動小卡 PDF', '淨塑守護者紀念貼紙圖檔'] },

  // Dual Track Badges
  { id: 'dual_1', track: 'dual', level: 1, name: '雙軌啟程者', icon: '🧭', desc: '同時看見飲食與日常用品對環境的影響。', condition: '完成雙軌關卡一', type: 'levelBadge' },
  { id: 'dual_2', track: 'dual', level: 2, name: '雙倍行動家', icon: '✌️', desc: '完成蔬食與淨塑的雙重友善行動。', condition: '完成雙軌關卡二', type: 'levelBadge' },
  { id: 'dual_3', track: 'dual', level: 3, name: '永續實踐者', icon: '♻️', desc: '將兩種友善行動逐步養成生活習慣。', condition: '完成雙軌關卡三', type: 'levelBadge' },
  { id: 'dual_4', track: 'dual', level: 4, name: '慈心影響力使者', icon: '🌟', desc: '把雙軌行動分享出去，帶動更多人一起參與。', condition: '完成雙軌關卡四', type: 'levelBadge' },
  { id: 'dual_complete', track: 'dual', name: '地球友善勇士', icon: '🛡️', desc: '你把善意走成一條路，也把改變帶給更多人。', condition: '集滿雙軌挑戰 4 枚關卡章', type: 'completeBadge', reward: ['地球友善勇士電子證書', '限定雙軌紀念章圖檔', '關農限定感謝小卡', '友善生活完成紀念頁'] }
];

export const MOCK_FEED = [
  { id: 1, name: '小莉', avatar: '1', track: 'veg' as Track, time: '10分鐘前', text: '今天中午吃了超好吃的素食便當！發現其實不吃肉也很有飽足感😋', likes: 12 },
  { id: 2, name: '阿豪', avatar: '2', track: 'plastic' as Track, time: '1小時前', text: '買飲料自備杯子，省了5元還少用一個塑膠杯，讚讚！', likes: 8 },
  { id: 3, name: '小宇', avatar: '3', track: 'dual' as Track, time: '3小時前', text: '早午餐吃全素三明治＋自備餐盒裝點心，完美的一天。', likes: 25 }
];

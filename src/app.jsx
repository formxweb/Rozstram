import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Ctx, useApp } from './ctx.js';
import {
  CONFIG, getClient, iso, rowComment, rowMessage, rowNotification, rowPost, rowProfile, rowStory, rowThread, toMs, uuid, errText, errCodeOf, functionError,
} from './backend.js';
import { DAY, MAX_UPLOAD, compressImage, haptic, initialsAvatar, isOn, mediaUrl, omit, onKeys, rid, shareLink, store, videoInfo } from './lib.js';
import { ActionSheet, Avatar, ConfirmDialog, Empty, Icon, Mark, Screen, Sheet, Spinner } from './ui.jsx';
import { HomeScreen, CommentsSheet, LikesSheet, SendSheet, PostScreen, PeekModal } from './feed.jsx';
import { ReelsScreen } from './reels.jsx';
import { StoryViewer } from './stories.jsx';
import { CreateFlow } from './create.jsx';
import { ExploreScreen, TagScreen } from './explore.jsx';
import { ProfileScreen, PeopleScreen, EditProfileScreen, GridScreen, ShareProfileSheet, HighlightSheet } from './profile.jsx';
import { SettingsScreen, AccountScreen, PeopleListScreen, RequestsScreen, ReportSheet, Onboarding } from './settings.jsx';
import { InboxScreen, ChatScreen, NewMessageScreen, GroupInfoScreen } from './messages.jsx';
import { ActivityScreen } from './activity.jsx';
import { AuthScreen } from './auth.jsx';

const FULLSCREEN = { chat: 1, create: 1, edit: 1, newmsg: 1 };
const noop = () => {};
const map = (arr) => { const m = {}; (arr || []).forEach((x) => { m[x.id] = x; }); return m; };
const flag = (arr) => { const m = {}; (arr || []).forEach((x) => { m[x] = true; }); return m; };

function rankScore(p, commentCount, now) {
  const likes = onKeys(p.likes).length;
  return (likes + 2 * (commentCount[p.id] || 0) + 1) / Math.pow((now - p.at) / 36e5 + 2, 0.9);
}

function App() {
  const [phase, setPhase] = useState('boot');
  const [sb, setSb] = useState(null);
  const [me, setMe] = useState({ id: null });
  const [base, setBase] = useState({});
  const [follows, setFollows] = useState({});
  const [postsMap, setPosts] = useState({});
  const [commentsMap, setComments] = useState({});
  const [storiesMap, setStories] = useState({});
  const [threadsMap, setThreads] = useState({});
  const [saved, setSavedMap] = useState({});
  const [hidden, setHiddenMap] = useState({});
  const [blocks, setBlocks] = useState({});
  const [mutes, setMutes] = useState({});
  const [closeFriends, setCloseFriends] = useState({});
  const [notifs, setNotifs] = useState([]);
  const [account, setAccount] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [conn, setConn] = useState('ok');
  const [peers, setPeers] = useState({});
  const [tab, setTab] = useState('home');
  const [visited, setVisited] = useState({ home: true });
  const [retap, setRetap] = useState({ tab: '', n: 0 });
  const [stack, setStack] = useState([]);
  const [storyView, setStoryView] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [confirmBox, setConfirmBox] = useState(null);
  const [panel, setPanel] = useState(null);
  const [peek, setPeek] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [sound, setSound] = useState(false);
  const [theme, setThemeState] = useState(() => store.get('theme', 'system'));
  const [seenLocal, setSeenLocal] = useState(() => store.get('seenStories', {}));
  const [feedMode, setFeedModeState] = useState(() => store.get('feedMode', 'following'));
  const [onboarding, setOnboarding] = useState(false);

  const toastTimer = useRef(null);
  const meRef = useRef(me); meRef.current = me;
  const postsRef = useRef(postsMap); postsRef.current = postsMap;
  const threadsRef = useRef(threadsMap); threadsRef.current = threadsMap;
  const baseRef = useRef(base); baseRef.current = base;
  const chatSubs = useRef(new Set());
  const presence = useRef(null);
  const loadedUsers = useRef({});
  const fetchingThreads = useRef({});
  const deepLink = useRef(null);

  const toast = useCallback((text, action) => {
    setToastMsg({ text, action, k: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), action ? 4200 : 2600);
  }, []);

  /* ------------------------------------------------ açılış ve oturum */
  useEffect(() => {
    const m = location.pathname.match(/^\/(?:p|post)\/([0-9a-f-]{36})/i) || null;
    const u = location.pathname.match(/^\/(?:@|u\/)([a-z0-9._]{3,30})\/?$/i) || null;
    if (m) deepLink.current = { type: 'post', id: m[1] };
    else if (u) deepLink.current = { type: 'user', name: u[1].toLowerCase() };
    if (!CONFIG.url || !CONFIG.key) { setPhase('noconfig'); return undefined; }
    let alive = true;
    let sub = null;
    const apply = (session) => {
      const id = session && session.user ? session.user.id : null;
      if (id === meRef.current.id && phaseRef.current !== 'boot') return;
      setMe({ id });
      setPhase(id ? 'ready' : 'auth');
      if (!id) resetData();
    };
    getClient().then(async (client) => {
      if (!alive) return;
      setSb(client);
      const { data } = await client.auth.getSession();
      if (!alive) return;
      apply(data && data.session);
      sub = client.auth.onAuthStateChange((ev, session) => { if (alive) apply(session); }).data.subscription;
    }).catch(() => { if (alive) setPhase('offline'); });
    return () => { alive = false; if (sub) sub.unsubscribe(); };
  }, []);
  const phaseRef = useRef(phase); phaseRef.current = phase;

  const resetData = () => {
    setBase({}); setFollows({}); setPosts({}); setComments({}); setStories({}); setThreads({}); setSavedMap({}); setHiddenMap({});
    setBlocks({}); setMutes({}); setCloseFriends({}); setNotifs([]); setAccount(null); setLoaded(false); setPeers({});
    setStack([]); setTab('home'); setVisited({ home: true }); setStoryView(null); setPanel(null); setSheet(null);
    loadedUsers.current = {};
  };

  /* ------------------------------------------------ veri yükleme */
  const boot = useCallback(async (silent) => {
    if (!sb) return false;
    const { data, error } = await sb.rpc('bootstrap');
    if (error || !data) {
      if (!silent) toast(errText(error, 'Bağlanılamadı. İnternetini kontrol et.'));
      return false;
    }
    const P = {};
    (data.profiles || []).forEach((p) => { P[p.id] = { ...p, lastSeen: p.lastSeen || null }; });
    const F = {};
    (data.follows || []).forEach(([f, t, s, at]) => { F[f + ':' + t] = { f, t, s, at }; });
    setBase(P);
    setFollows(F);
    setPosts(map(data.posts));
    setComments(map(data.comments));
    setStories((old) => {
      const n = map(data.stories);
      Object.keys(old).forEach((k) => { if (!n[k] && old[k].at < Date.now() - DAY && old[k].author !== data.me) n[k] = old[k]; });
      return n;
    });
    setThreads(map(data.threads));
    setSavedMap(data.saves || {});
    setHiddenMap(data.hidden || {});
    setBlocks(flag(data.blocks));
    setMutes(flag(data.mutes));
    setCloseFriends(flag(data.closeFriends));
    setNotifs(data.notifications || []);
    setAccount(data.account || null);
    setLoaded(true);
    return true;
  }, [sb, toast]);

  useEffect(() => {
    if (!sb || !me.id) return undefined;
    let alive = true;
    boot(false).then((ok) => {
      if (!alive) return;
      if (!ok) setConn('down');
      if (store.get('onboard:' + me.id, false)) setOnboarding(true);
    });
    return () => { alive = false; };
  }, [sb, me.id]);

  /* ------------------------------------------------ canlı değişiklikler */
  const fetchThread = useCallback(async (tid) => {
    if (!sb || fetchingThreads.current[tid]) return null;
    fetchingThreads.current[tid] = true;
    const { data } = await sb.rpc('get_thread', { tid });
    fetchingThreads.current[tid] = false;
    if (data) setThreads((m) => ({ ...m, [data.id]: data }));
    return data || null;
  }, [sb]);

  const onDb = useCallback((table, ev, nw, old) => {
    const myId = meRef.current.id;
    const dropNotifs = (pred) => setNotifs((l) => (l.some(pred) ? l.filter((n) => !pred(n)) : l));
    switch (table) {
      case 'profiles':
        if (ev === 'DELETE') setBase((m) => omit(m, old.id));
        else setBase((m) => ({ ...m, [nw.id]: rowProfile(nw) }));
        break;
      case 'follows': {
        const r = ev === 'DELETE' ? old : nw;
        const k = r.follower + ':' + r.following;
        if (ev === 'DELETE') setFollows((m) => omit(m, k));
        else setFollows((m) => ({ ...m, [k]: { f: nw.follower, t: nw.following, s: nw.status, at: toMs(nw.created_at) } }));
        if (r.following === myId && (ev === 'DELETE' || nw.status === 'accepted')) {
          dropNotifs((n) => n.actor === r.follower && (n.kind === 'request' || (ev === 'DELETE' && n.kind === 'follow')));
        }
        break;
      }
      case 'posts':
        if (ev === 'DELETE') {
          setPosts((m) => omit(m, old.id));
          setComments((m) => { const n = {}; Object.keys(m).forEach((k) => { if (m[k].post !== old.id) n[k] = m[k]; }); return n; });
        } else if (nw.archived && nw.author !== myId) setPosts((m) => omit(m, nw.id));
        else setPosts((m) => ({ ...m, [nw.id]: rowPost(nw, m[nw.id]) }));
        break;
      case 'post_likes': {
        const r = ev === 'DELETE' ? old : nw;
        setPosts((m) => {
          const p = m[r.post_id];
          if (!p) return m;
          const likes = ev === 'DELETE' ? omit(p.likes, r.user_id) : { ...p.likes, [r.user_id]: toMs(nw.created_at) || Date.now() };
          return { ...m, [p.id]: { ...p, likes } };
        });
        if (ev === 'DELETE') dropNotifs((n) => n.kind === 'like' && n.post === r.post_id && n.actor === r.user_id);
        break;
      }
      case 'comments':
        if (ev === 'DELETE') setComments((m) => { const n = {}; Object.keys(m).forEach((k) => { if (k !== old.id && m[k].parent !== old.id) n[k] = m[k]; }); return n; });
        else if (postsRef.current[nw.post_id]) setComments((m) => ({ ...m, [nw.id]: rowComment(nw, m[nw.id]) }));
        break;
      case 'comment_likes': {
        const r = ev === 'DELETE' ? old : nw;
        setComments((m) => {
          const c = m[r.comment_id];
          if (!c) return m;
          const likes = ev === 'DELETE' ? omit(c.likes, r.user_id) : { ...c.likes, [r.user_id]: toMs(nw.created_at) || Date.now() };
          return { ...m, [c.id]: { ...c, likes } };
        });
        if (ev === 'DELETE') dropNotifs((n) => n.kind === 'clike' && n.cid === r.comment_id && n.actor === r.user_id);
        break;
      }
      case 'stories':
        if (ev === 'DELETE') setStories((m) => omit(m, old.id));
        else setStories((m) => ({ ...m, [nw.id]: rowStory(nw, m[nw.id]) }));
        break;
      case 'story_views':
      case 'story_likes': {
        const key = table === 'story_views' ? 'views' : 'likes';
        const r = ev === 'DELETE' ? old : nw;
        const who = r.viewer || r.user_id;
        setStories((m) => {
          const s = m[r.story_id];
          if (!s) return m;
          const v = ev === 'DELETE' ? omit(s[key], who) : { ...s[key], [who]: toMs(nw.created_at) || Date.now() };
          return { ...m, [s.id]: { ...s, [key]: v } };
        });
        if (ev === 'DELETE' && table === 'story_likes') dropNotifs((n) => n.kind === 'slike' && n.story === r.story_id && n.actor === r.user_id);
        break;
      }
      case 'threads':
        if (ev === 'DELETE') setThreads((m) => omit(m, old.id));
        else if (threadsRef.current[nw.id]) setThreads((m) => ({ ...m, [nw.id]: rowThread(nw, m[nw.id]) }));
        else fetchThread(nw.id);
        break;
      case 'thread_members': {
        const r = ev === 'DELETE' ? old : nw;
        if (ev === 'DELETE' && r.user_id === myId) { setThreads((m) => omit(m, r.thread_id)); break; }
        if (!threadsRef.current[r.thread_id]) { if (ev !== 'DELETE') fetchThread(r.thread_id); break; }
        setThreads((m) => {
          const t = m[r.thread_id];
          if (!t) return m;
          let members = t.members.filter((x) => x.id !== r.user_id);
          if (ev !== 'DELETE') members = members.concat([{ id: nw.user_id, read: toMs(nw.last_read_at), accepted: nw.accepted, muted: nw.muted }]);
          return { ...m, [t.id]: { ...t, members } };
        });
        break;
      }
      case 'notifications':
        if (ev === 'DELETE') setNotifs((l) => l.filter((n) => n.id !== old.id));
        else if (ev === 'INSERT') setNotifs((l) => [rowNotification(nw)].concat(l.filter((n) => n.id !== nw.id)));
        else setNotifs((l) => l.map((n) => (n.id === nw.id ? rowNotification(nw) : n)));
        break;
      default:
        break;
    }
    if (table === 'messages' || table === 'message_reactions') chatSubs.current.forEach((cb) => cb(table, ev, nw, old));
  }, [fetchThread]);

  useEffect(() => {
    if (!sb || !me.id || !loaded) return undefined;
    const tables = ['profiles', 'follows', 'posts', 'post_likes', 'comments', 'comment_likes', 'stories', 'story_views', 'story_likes',
      'threads', 'thread_members', 'messages', 'message_reactions', 'notifications'];
    let ch = sb.channel('db-' + me.id);
    tables.forEach((t) => {
      ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, (p) => onDb(t, p.eventType, p.new || {}, p.old || {}));
    });
    let wasDown = false;
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') { setConn('ok'); if (wasDown) { wasDown = false; boot(true); } }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { wasDown = true; }
    });
    return () => { sb.removeChannel(ch); };
  }, [sb, me.id, loaded]);

  /* çevrimiçi durumu ve "yazıyor…" */
  const myBase = base[me.id] || null;
  const showActivity = !myBase || myBase.showActivity !== false;
  const showActivityRef = useRef(showActivity); showActivityRef.current = showActivity;
  useEffect(() => {
    if (!sb || !me.id || !loaded) return undefined;
    const ch = sb.channel('online', { config: { presence: { key: me.id } } });
    ch.on('presence', { event: 'sync' }, () => {
      const st = ch.presenceState() || {};
      const m = {};
      Object.keys(st).forEach((k) => { const metas = st[k] || []; const last = metas[metas.length - 1] || {}; m[k] = { typing: last.typing || null, at: last.at || 0 }; });
      setPeers(m);
    });
    ch.subscribe((status) => { if (status === 'SUBSCRIBED' && showActivityRef.current) ch.track({ typing: null, at: Date.now() }); });
    presence.current = ch;
    return () => { presence.current = null; sb.removeChannel(ch); };
  }, [sb, me.id, loaded]);
  useEffect(() => {
    const ch = presence.current;
    if (!ch) return;
    if (showActivity) ch.track({ typing: null, at: Date.now() }); else if (ch.untrack) ch.untrack();
  }, [showActivity]);

  /* son görülme + uygulamaya geri dönünce yenile */
  useEffect(() => {
    if (!sb || !me.id || !loaded) return undefined;
    const touch = () => sb.from('profiles').update({ last_seen: iso() }).eq('id', me.id).then(noop, noop);
    touch();
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); touch(); return; }
      if (hiddenAt && Date.now() - hiddenAt > 30000) boot(true);
      touch();
    };
    document.addEventListener('visibilitychange', onVis);
    const iv = setInterval(() => { if (document.visibilityState === 'visible') touch(); }, 4 * 60000);
    return () => { document.removeEventListener('visibilitychange', onVis); clearInterval(iv); };
  }, [sb, me.id, loaded]);

  /* tema */
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
  }, [theme]);

  /* ------------------------------------------------ türetilmiş veriler */
  const followRows = useMemo(() => Object.keys(follows).map((k) => follows[k]), [follows]);
  const profiles = useMemo(() => {
    const fo = {};
    followRows.forEach((r) => { if (r.s === 'accepted') (fo[r.f] = fo[r.f] || {})[r.t] = r.at; });
    const out = {};
    Object.keys(base).forEach((u) => { out[u] = { ...base[u], following: fo[u] || {} }; });
    return out;
  }, [base, followRows]);
  const myProfile = profiles[me.id] || null;
  const following = useMemo(() => new Set(Object.keys((myProfile && myProfile.following) || {})), [myProfile]);
  const requested = useMemo(() => new Set(followRows.filter((r) => r.f === me.id && r.s === 'pending').map((r) => r.t)), [followRows, me.id]);
  const incoming = useMemo(() => followRows.filter((r) => r.t === me.id && r.s === 'pending').sort((a, b) => b.at - a.at).map((r) => r.f).filter((u) => base[u]), [followRows, me.id, base]);
  const followerCount = useCallback((uid) => followRows.filter((r) => r.t === uid && r.s === 'accepted').length, [followRows]);
  const canSee = useCallback((uid) => uid === me.id || (profiles[uid] && !blocks[uid] && (!profiles[uid].private || following.has(uid))), [profiles, me.id, blocks, following]);

  const posts = useMemo(() => Object.keys(postsMap).map((k) => postsMap[k]).sort((a, b) => b.at - a.at), [postsMap]);
  const visiblePosts = useMemo(() => posts.filter((p) => profiles[p.author] && !blocks[p.author] && !p.archived), [posts, profiles, blocks]);
  const postById = postsMap;
  const comments = useMemo(() => Object.keys(commentsMap).map((k) => commentsMap[k]).sort((a, b) => a.at - b.at), [commentsMap]);
  const commentById = commentsMap;
  const commentsByPost = useMemo(() => {
    const m = {};
    comments.forEach((c) => {
      if (c.parent && !commentById[c.parent]) return;
      if (blocks[c.author] || !profiles[c.author]) return;
      (m[c.post] = m[c.post] || []).push(c);
    });
    Object.keys(m).forEach((k) => { m[k].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || a.at - b.at); });
    return m;
  }, [comments, commentById, blocks, profiles]);
  const commentCount = useMemo(() => { const m = {}; Object.keys(commentsByPost).forEach((k) => { m[k] = commentsByPost[k].length; }); return m; }, [commentsByPost]);
  const stories = useMemo(() => Object.keys(storiesMap).map((k) => storiesMap[k]), [storiesMap]);
  const storyById = storiesMap;

  const feed = useMemo(() => {
    const now = Date.now();
    const vis = visiblePosts.filter((p) => !hidden[p.id] && !mutes[p.author]);
    const rank = (l) => l.slice().sort((a, b) => rankScore(b, commentCount, now) - rankScore(a, commentCount, now));
    if (feedMode === 'foryou') return { main: rank(vis), rest: [] };
    const mine = (p) => p.author === me.id || following.has(p.author);
    return { main: vis.filter(mine), rest: rank(vis.filter((p) => !mine(p))) };
  }, [visiblePosts, hidden, mutes, feedMode, following, me.id, commentCount]);

  const reelsFor = useCallback((mode) => {
    const now = Date.now();
    const vids = visiblePosts.filter((p) => p.media && p.media[0] && p.media[0].type === 'video' && !hidden[p.id] && !mutes[p.author]);
    if (mode === 'following') return vids.filter((p) => following.has(p.author) || p.author === me.id);
    return vids.slice().sort((a, b) => rankScore(b, commentCount, now) - rankScore(a, commentCount, now));
  }, [visiblePosts, hidden, mutes, following, me.id, commentCount]);

  const isSeen = useCallback((s) => !!(seenLocal[s.id] || (s.views && s.views[me.id]) || s.author === me.id && seenLocal[s.id]), [seenLocal, me.id]);
  const storyGroups = useMemo(() => {
    const now = Date.now();
    const by = {};
    stories.forEach((s) => {
      if (s.at <= now - DAY || !profiles[s.author] || blocks[s.author]) return;
      if (s.author !== me.id && mutes[s.author]) return;
      (by[s.author] = by[s.author] || []).push(s);
    });
    const groups = Object.keys(by).map((uid) => ({ uid, items: by[uid].sort((a, b) => a.at - b.at), cf: by[uid].some((s) => s.closeFriends) }));
    const seenAll = (g) => g.items.every((s) => isSeen(s));
    groups.sort((a, b) => {
      if (a.uid === me.id) return -1;
      if (b.uid === me.id) return 1;
      const sa = seenAll(a) ? 1 : 0, sb2 = seenAll(b) ? 1 : 0;
      if (sa !== sb2) return sa - sb2;
      const fa = following.has(a.uid) ? 0 : 1, fb = following.has(b.uid) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return b.items[b.items.length - 1].at - a.items[a.items.length - 1].at;
    });
    return groups;
  }, [stories, profiles, blocks, mutes, me.id, isSeen, following]);
  const groupSeen = useCallback((g) => g.items.every((s) => isSeen(s)), [isSeen]);
  const storyRing = useCallback((uid) => {
    const g = storyGroups.find((x) => x.uid === uid);
    if (!g) return null;
    if (groupSeen(g)) return 'seen';
    return g.cf && g.items.some((s) => s.closeFriends && !isSeen(s)) ? 'cf' : 'story';
  }, [storyGroups, groupSeen, isSeen]);

  const activity = useMemo(() => notifs
    .filter((n) => profiles[n.actor] && !blocks[n.actor] && n.kind !== 'request')
    .map((n) => ({ ...n, at: n.at })), [notifs, profiles, blocks]);
  const unreadActivity = notifs.filter((n) => !n.read && profiles[n.actor] && !blocks[n.actor]).length + (incoming.length && notifs.some((n) => n.kind === 'request' && !n.read) ? 0 : 0);

  const threads = useMemo(() => Object.keys(threadsMap).map((k) => threadsMap[k])
    .filter((t) => t.members.some((m) => m.id === me.id))
    .sort((a, b) => (b.at || 0) - (a.at || 0)), [threadsMap, me.id]);
  const myMember = useCallback((t) => (t && t.members.find((m) => m.id === me.id)) || null, [me.id]);
  const isRequest = useCallback((t) => { const m = myMember(t); return !!(m && !m.accepted); }, [myMember]);
  const isUnread = useCallback((t) => {
    const m = myMember(t);
    return !!(t.last && t.last.from !== me.id && m && t.last.at > (m.read || 0));
  }, [me.id, myMember]);
  const otherOf = useCallback((t) => {
    if (!t) return null;
    const o = t.members.find((m) => m.id !== me.id);
    return o ? o.id : null;
  }, [me.id]);
  const inboxThreads = useMemo(() => threads.filter((t) => (t.last || t.createdBy === me.id || t.isGroup) && !(t.isGroup ? false : blocks[otherOf(t)])), [threads, me.id, blocks, otherOf]);
  const unreadThreads = inboxThreads.filter((t) => !isRequest(t) && isUnread(t) && !(myMember(t) || {}).muted).length;
  const requestThreads = inboxThreads.filter((t) => isRequest(t) && t.last);

  /* ------------------------------------------------ kişiler */
  const nameOf = useCallback((uid) => (profiles[uid] && profiles[uid].username) || (uid === me.id ? 'sen' : 'rozstram_kullanicisi'), [profiles, me.id]);
  const avatarOf = useCallback((uid) => {
    const p = profiles[uid];
    if (p && p.avatar) return mediaUrl(p.avatar);
    return initialsAvatar((p && (p.displayName || p.username)) || '?', uid || '');
  }, [profiles]);
  const uidByName = useCallback((name) => {
    const n = (name || '').toLowerCase();
    return Object.keys(profiles).find((u) => profiles[u].username === n) || null;
  }, [profiles]);
  const isOnline = useCallback((uid) => {
    if (!uid || uid === me.id || !showActivity) return false;
    const p = profiles[uid];
    if (!p || p.showActivity === false || blocks[uid]) return false;
    return !!peers[uid];
  }, [peers, me.id, profiles, blocks, showActivity]);
  const typingIn = useCallback((tid, uid) => {
    if (uid) return !!(peers[uid] && peers[uid].typing === tid && isOnline(uid));
    return Object.keys(peers).some((u) => u !== me.id && peers[u].typing === tid);
  }, [peers, isOnline, me.id]);
  const lastSeenText = useCallback((uid) => {
    if (isOnline(uid)) return 'Şu an aktif';
    const p = profiles[uid];
    if (showActivity && p && p.lastSeen) {
      const m = Math.floor((Date.now() - p.lastSeen) / 60000);
      if (m < 60) return (m < 1 ? 1 : m) + ' dk önce aktifti';
      const h = Math.floor(m / 60);
      if (h < 24) return h + ' sa önce aktifti';
    }
    return (p && p.displayName) || 'Rozstram';
  }, [isOnline, profiles, showActivity]);

  /* ------------------------------------------------ yazma yardımcıları */
  const run = async (q, msg) => {
    try {
      const { error } = await q;
      if (error) { toast(errText(error, msg)); console.warn(error); return false; }
      return true;
    } catch (e) { toast(errText(e, msg)); console.warn(e); return false; }
  };
  const patchPost = (id, fn) => setPosts((m) => (m[id] ? { ...m, [id]: fn(m[id]) } : m));
  const patchComment = (id, fn) => setComments((m) => (m[id] ? { ...m, [id]: fn(m[id]) } : m));
  const patchStory = (id, fn) => setStories((m) => (m[id] ? { ...m, [id]: fn(m[id]) } : m));
  const patchBase = (id, fn) => setBase((m) => (m[id] ? { ...m, [id]: fn(m[id]) } : m));
  const patchThread = (id, fn) => setThreads((m) => (m[id] ? { ...m, [id]: fn(m[id]) } : m));

  const upload = async (blob, folder, ext, type) => {
    const path = me.id + '/' + folder + '/' + uuid() + '.' + ext;
    const { error } = await sb.storage.from('media').upload(path, blob, { contentType: type, cacheControl: '31536000', upsert: false });
    if (error) throw error;
    return path;
  };
  const removeFiles = (paths) => {
    const own = (paths || []).filter((x) => x && x.indexOf(me.id + '/') === 0);
    if (own.length) sb.storage.from('media').remove(own).then(noop, noop);
  };

  /* ------------------------------------------------ gönderi eylemleri */
  const setLike = (post, v) => {
    if (v) haptic(10);
    const now = Date.now();
    const prev = post.likes || {};
    if (!!prev[me.id] === v) return;
    patchPost(post.id, (p) => ({ ...p, likes: v ? { ...p.likes, [me.id]: now } : omit(p.likes, me.id) }));
    const q = v ? sb.from('post_likes').insert({ post_id: post.id, user_id: me.id }) : sb.from('post_likes').delete().eq('post_id', post.id).eq('user_id', me.id);
    q.then(({ error }) => {
      if (error && error.code !== '23505') { patchPost(post.id, (p) => ({ ...p, likes: prev })); toast(errText(error, 'Beğeni kaydedilemedi.')); }
    });
  };
  const setCommentLike = (c, v) => {
    if (v) haptic(8);
    const prev = c.likes || {};
    if (!!prev[me.id] === v) return;
    patchComment(c.id, (x) => ({ ...x, likes: v ? { ...x.likes, [me.id]: Date.now() } : omit(x.likes, me.id) }));
    const q = v ? sb.from('comment_likes').insert({ comment_id: c.id, user_id: me.id }) : sb.from('comment_likes').delete().eq('comment_id', c.id).eq('user_id', me.id);
    q.then(({ error }) => { if (error && error.code !== '23505') { patchComment(c.id, (x) => ({ ...x, likes: prev })); toast(errText(error, 'Beğeni kaydedilemedi.')); } });
  };
  const setSaved = (postId, v) => {
    setSavedMap((m) => (v ? { ...m, [postId]: Date.now() } : omit(m, postId)));
    const q = v ? sb.from('saves').insert({ user_id: me.id, post_id: postId }) : sb.from('saves').delete().eq('user_id', me.id).eq('post_id', postId);
    q.then(({ error }) => { if (error && error.code !== '23505') { setSavedMap((m) => (v ? omit(m, postId) : { ...m, [postId]: Date.now() })); toast('Kaydedilemedi.'); } });
    if (v) { haptic(8); toast('Kaydedildi', { label: 'Gör', fn: () => push({ type: 'grid', kind: 'saved', title: 'Kaydedilenler' }) }); }
  };
  const hidePost = (postId) => {
    setHiddenMap((m) => ({ ...m, [postId]: Date.now() }));
    sb.from('hidden_posts').insert({ user_id: me.id, post_id: postId }).then(noop, noop);
    toast('Gönderi gizlendi', { label: 'Geri al', fn: () => { setHiddenMap((m) => omit(m, postId)); sb.from('hidden_posts').delete().eq('user_id', me.id).eq('post_id', postId).then(noop, noop); } });
  };
  const restoreHidden = () => {
    setHiddenMap({});
    sb.from('hidden_posts').delete().eq('user_id', me.id).then(noop, noop);
    toast('Gizlenen gönderiler geri geldi');
  };

  /* ------------------------------------------------ takip */
  const setFollow = (uid, v) => {
    if (!uid || uid === me.id) return;
    const k = me.id + ':' + uid;
    const prev = follows[k];
    if (v) {
      haptic(10);
      const priv = profiles[uid] && profiles[uid].private;
      setFollows((m) => ({ ...m, [k]: { f: me.id, t: uid, s: priv ? 'pending' : 'accepted', at: Date.now() } }));
      sb.from('follows').insert({ follower: me.id, following: uid }).select().then(({ data, error }) => {
        if (error && error.code !== '23505') { setFollows((m) => (prev ? { ...m, [k]: prev } : omit(m, k))); toast(errText(error, 'Takip edilemedi.')); return; }
        const row = Array.isArray(data) ? data[0] : data;
        if (row) setFollows((m) => ({ ...m, [k]: { f: row.follower, t: row.following, s: row.status, at: toMs(row.created_at) } }));
        if (priv) toast('Takip isteği gönderildi');
      });
    } else {
      setFollows((m) => omit(m, k));
      sb.from('follows').delete().eq('follower', me.id).eq('following', uid).then(({ error }) => {
        if (error) { if (prev) setFollows((m) => ({ ...m, [k]: prev })); toast(errText(error, 'İşlem yapılamadı.')); }
      });
    }
  };
  const confirmUnfollow = (uid) => {
    const priv = profiles[uid] && profiles[uid].private;
    setSheet({
      header: (
        <div className="row" style={{ flexDirection: 'column', paddingBlock: 14, gap: 8 }}>
          <Avatar uid={uid} size={72} />
          <b>{nameOf(uid)}</b>
          {priv ? <span className="sub" style={{ textAlign: 'center' }}>Takibi bırakırsan gönderilerini görmek için yeniden istek göndermen gerekir.</span> : null}
        </div>
      ),
      items: [
        { label: closeFriends[uid] ? 'Yakın Arkadaşlar’dan çıkar' : 'Yakın Arkadaşlar’a ekle', icon: 'star', onClick: () => setCloseFriend(uid, !closeFriends[uid]) },
        { label: mutes[uid] ? 'Sesini aç' : 'Sessize al', icon: 'volOff', onClick: () => setMute(uid, !mutes[uid]) },
        { label: 'Takibi bırak', icon: 'userX', danger: true, onClick: () => setFollow(uid, false) },
      ],
    });
  };
  const cancelRequest = (uid) => setFollow(uid, false);
  const acceptRequest = (uid) => {
    const k = uid + ':' + me.id;
    setFollows((m) => (m[k] ? { ...m, [k]: { ...m[k], s: 'accepted', at: Date.now() } } : m));
    run(sb.from('follows').update({ status: 'accepted' }).eq('follower', uid).eq('following', me.id), 'Kabul edilemedi.');
  };
  const declineRequest = (uid) => {
    const k = uid + ':' + me.id;
    setFollows((m) => omit(m, k));
    run(sb.from('follows').delete().eq('follower', uid).eq('following', me.id), 'Silinemedi.');
  };
  const removeFollower = (uid) => {
    setConfirmBox({ title: 'Takipçi kaldırılsın mı?', text: nameOf(uid) + ', takipçilerinden kaldırıldığını öğrenmez.', ok: 'Kaldır', danger: true,
      onOk: () => { setFollows((m) => omit(m, uid + ':' + me.id)); run(sb.from('follows').delete().eq('follower', uid).eq('following', me.id), 'Kaldırılamadı.'); } });
  };
  const setCloseFriend = (uid, v) => {
    setCloseFriends((m) => (v ? { ...m, [uid]: true } : omit(m, uid)));
    const q = v ? sb.from('close_friends').insert({ owner: me.id, friend: uid }) : sb.from('close_friends').delete().eq('owner', me.id).eq('friend', uid);
    q.then(({ error }) => { if (error && error.code !== '23505') { setCloseFriends((m) => (v ? omit(m, uid) : { ...m, [uid]: true })); toast('Kaydedilemedi.'); } });
  };
  const setMute = (uid, v) => {
    setMutes((m) => (v ? { ...m, [uid]: true } : omit(m, uid)));
    const q = v ? sb.from('mutes').insert({ owner: me.id, target: uid }) : sb.from('mutes').delete().eq('owner', me.id).eq('target', uid);
    q.then(({ error }) => { if (error && error.code !== '23505') toast('Kaydedilemedi.'); });
    toast(v ? nameOf(uid) + ' sessize alındı. Gönderi ve hikayeleri akışında görünmez.' : nameOf(uid) + ' artık sessizde değil.');
  };
  const block = (uid) => {
    setConfirmBox({
      title: nameOf(uid) + ' engellensin mi?', ok: 'Engelle', danger: true,
      text: 'Rozstram’da profilini, gönderilerini ve hikayelerini göremez, sana mesaj atamaz. Engellendiğini öğrenmez. Takipleşmeniz kalkar.',
      onOk: async () => {
        await Promise.all([
          sb.from('follows').delete().eq('follower', me.id).eq('following', uid),
          sb.from('follows').delete().eq('follower', uid).eq('following', me.id),
          sb.from('close_friends').delete().eq('owner', me.id).eq('friend', uid),
        ]).catch(noop);
        const ok = await run(sb.from('blocks').insert({ blocker: me.id, blocked: uid }), 'Engellenemedi.');
        if (!ok) return;
        setBlocks((m) => ({ ...m, [uid]: true }));
        setCloseFriends((m) => omit(m, uid));
        setFollows((m) => omit(omit(m, me.id + ':' + uid), uid + ':' + me.id));
        setStack((s) => s.filter((o) => !(o.type === 'user' && o.uid === uid)));
        toast(nameOf(uid) + ' engellendi');
      },
    });
  };
  const unblock = async (uid) => {
    const ok = await run(sb.from('blocks').delete().eq('blocker', me.id).eq('blocked', uid), 'Engel kaldırılamadı.');
    if (ok) { setBlocks((m) => omit(m, uid)); toast(nameOf(uid) + ' artık engelli değil'); }
  };
  const report = async (kind, target, reason) => {
    const ok = await run(sb.from('reports').insert({ reporter: me.id, kind, target: String(target), reason }), 'Şikayet gönderilemedi.');
    if (ok) toast('Teşekkürler, şikayetin bize ulaştı');
    return ok;
  };
  const openReport = (kind, target, extra) => setPanel({ type: 'report', kind, target, extra: extra || null, k: rid() });

  /* ------------------------------------------------ yorum */
  const addComment = async (postId, text, parent) => {
    const id = uuid();
    const c = { id, post: postId, author: me.id, parent: parent || null, text, pinned: false, at: Date.now(), likes: {} };
    setComments((m) => ({ ...m, [id]: c }));
    const { error } = await sb.from('comments').insert({ id, post_id: postId, author: me.id, parent_id: parent || null, text });
    if (error) { setComments((m) => omit(m, id)); toast(errText(error, 'Yorum gönderilemedi.')); return null; }
    return id;
  };
  const deleteComment = async (c) => {
    const ok = await run(sb.from('comments').delete().eq('id', c.id), 'Yorum silinemedi.');
    if (ok) setComments((m) => { const n = {}; Object.keys(m).forEach((k) => { if (k !== c.id && m[k].parent !== c.id) n[k] = m[k]; }); return n; });
  };
  const pinComment = async (c, v) => {
    const ok = await run(sb.rpc('pin_comment', { cid: c.id, v }), 'Sabitlenemedi.');
    if (ok) patchComment(c.id, (x) => ({ ...x, pinned: v }));
  };

  /* ------------------------------------------------ gönderi düzenleme */
  const editPost = async (post, fields) => {
    const row = {};
    if ('caption' in fields) row.caption = fields.caption;
    if ('location' in fields) row.location = fields.location;
    if ('hideLikes' in fields) row.hide_likes = fields.hideLikes;
    if ('noComments' in fields) row.comments_off = fields.noComments;
    if ('pinned' in fields) row.pinned = fields.pinned;
    if ('archived' in fields) row.archived = fields.archived;
    if ('tagged' in fields) row.tagged = fields.tagged;
    const prev = post;
    patchPost(post.id, (p) => ({ ...p, ...fields }));
    const ok = await run(sb.from('posts').update(row).eq('id', post.id), 'Değişiklik kaydedilemedi.');
    if (!ok) setPosts((m) => ({ ...m, [post.id]: prev }));
    return ok;
  };
  const deletePost = async (post) => {
    const ok = await run(sb.from('posts').delete().eq('id', post.id), 'Gönderi silinemedi.');
    if (!ok) return;
    removeFiles((post.media || []).reduce((a, m) => a.concat([m.id, m.thumb]), []));
    setPosts((m) => omit(m, post.id));
    toast('Gönderi silindi');
    setStack((s) => s.filter((o) => !(o.type === 'post' && o.id === post.id)));
  };

  /* ------------------------------------------------ paylaşım */
  const publish = async (o, onProgress) => {
    const uploaded = [];
    try {
      if (o.mode === 'story' && o.textStory) {
        const id = uuid();
        const { error } = await sb.from('stories').insert({ id, author: me.id, text_story: o.textStory, close_friends: !!o.closeFriends, mentions: o.mentions || [] });
        if (error) throw error;
        setStories((m) => ({ ...m, [id]: { id, author: me.id, media: null, text: o.textStory, filter: 'none', adjust: null, overlay: null, sharedPost: null, mentions: [], closeFriends: !!o.closeFriends, at: Date.now(), views: {}, likes: {} } }));
        onProgress(1);
        toast(o.closeFriends ? 'Yakın Arkadaşlar’la paylaşıldı' : 'Hikayen paylaşıldı');
        return true;
      }
      const media = [];
      const steps = o.items.length * 2;
      let done = 0;
      const tick = () => { done++; onProgress(Math.min(0.95, done / steps)); };
      const folder = o.mode === 'story' ? 's' : 'p';
      for (const it of o.items) {
        if (it.type === 'image') {
          const img = await compressImage(it.file, 1440, o.mode === 'post' ? o.aspect : null);
          tick();
          const path = await upload(img.blob, folder, 'jpg', 'image/jpeg');
          uploaded.push(path);
          tick();
          const ar = img.w / img.h;
          media.push({ id: path, type: 'image', w: img.w, h: img.h, aspect: o.mode === 'post' ? Math.min(1.91, Math.max(0.8, ar)) : ar });
        } else {
          if (it.file.size > MAX_UPLOAD) { const e = new Error('too_large'); e.statusCode = '413'; throw e; }
          const info = await videoInfo(it.file);
          let thumb = null;
          if (info.thumb) { try { thumb = await upload(info.thumb, folder, 'jpg', 'image/jpeg'); uploaded.push(thumb); } catch (e) { thumb = null; } }
          tick();
          const type = it.file.type || 'video/mp4';
          const ext = type.indexOf('webm') >= 0 ? 'webm' : type.indexOf('quicktime') >= 0 ? 'mov' : 'mp4';
          const path = await upload(it.file, folder, ext, type);
          uploaded.push(path);
          tick();
          const ar = info.w / info.h || 0.5625;
          media.push({ id: path, type: 'video', thumb, w: info.w, h: info.h, duration: info.duration, aspect: o.mode === 'post' ? Math.min(1.91, Math.max(0.8, ar)) : ar });
        }
      }
      const id = uuid();
      if (o.mode === 'story') {
        const row = { id, author: me.id, media: media[0], filter: o.filter || 'none', adjust: o.adjust || null, overlay: o.overlay || null, close_friends: !!o.closeFriends, mentions: o.mentions || [] };
        const { error } = await sb.from('stories').insert(row);
        if (error) throw error;
        setStories((m) => ({ ...m, [id]: rowStory({ ...row, created_at: iso(), text_story: null }) }));
      } else {
        const row = {
          id, author: me.id, kind: o.mode, media, caption: o.caption || '', location: o.location || '', filter: o.filter || 'none', adjust: o.adjust || null,
          hide_likes: !!o.hideLikes, comments_off: !!o.noComments, tagged: o.tagged || [],
        };
        const { error } = await sb.from('posts').insert(row);
        if (error) throw error;
        setPosts((m) => ({ ...m, [id]: rowPost({ ...row, created_at: iso() }) }));
      }
      onProgress(1);
      toast(o.mode === 'story' ? (o.closeFriends ? 'Yakın Arkadaşlar’la paylaşıldı' : 'Hikayen paylaşıldı') : 'Paylaşıldı');
      return true;
    } catch (e) {
      removeFiles(uploaded);
      toast(errText(e, 'Yükleme başarısız oldu, tekrar dene.'));
      console.warn(e);
      return false;
    }
  };
  const shareToStory = async (post) => {
    const m = (post.media || [])[0];
    if (!m) return;
    const id = uuid();
    const media = { id: m.type === 'video' ? m.thumb || m.id : m.id, type: m.type === 'video' && !m.thumb ? 'video' : 'image' };
    const ok = await run(sb.from('stories').insert({ id, author: me.id, media, shared_post: post.id }), 'Hikayeye eklenemedi.');
    if (ok) {
      setStories((x) => ({ ...x, [id]: rowStory({ id, author: me.id, media, shared_post: post.id, created_at: iso() }) }));
      toast('Hikayene eklendi');
    }
  };

  /* ------------------------------------------------ hikaye */
  const markStorySeen = (s) => {
    if (!seenLocal[s.id]) {
      setSeenLocal((n) => {
        const next = { ...n, [s.id]: Date.now() };
        const keys = Object.keys(next);
        if (keys.length > 400) keys.sort((a, b) => next[a] - next[b]).slice(0, keys.length - 400).forEach((k) => delete next[k]);
        store.set('seenStories', next);
        return next;
      });
    }
    if (s.author !== me.id && !isOn(s.views, me.id)) {
      patchStory(s.id, (x) => ({ ...x, views: { ...x.views, [me.id]: Date.now() } }));
      sb.from('story_views').insert({ story_id: s.id, viewer: me.id }).then(noop, noop);
    }
  };
  const setStoryLike = (s, v) => {
    if (v) haptic(10);
    patchStory(s.id, (x) => ({ ...x, likes: v ? { ...x.likes, [me.id]: Date.now() } : omit(x.likes, me.id) }));
    const q = v ? sb.from('story_likes').insert({ story_id: s.id, user_id: me.id }) : sb.from('story_likes').delete().eq('story_id', s.id).eq('user_id', me.id);
    q.then(({ error }) => { if (error && error.code !== '23505') toast('Beğeni kaydedilemedi.'); });
  };
  const deleteStory = async (s) => {
    const ok = await run(sb.from('stories').delete().eq('id', s.id), 'Hikaye silinemedi.');
    if (!ok) return;
    setStories((m) => omit(m, s.id));
    if (s.media && !s.sharedPost) removeFiles([s.media.id, s.media.thumb]);
    const hls = ((myProfile && myProfile.highlights) || []).map((h) => ({ ...h, items: h.items.filter((x) => x !== s.id) })).filter((h) => h.items.length);
    if (hls.length !== ((myProfile && myProfile.highlights) || []).length || hls.some((h, i) => h.items.length !== myProfile.highlights[i].items.length)) saveHighlights(hls);
  };
  const saveHighlights = (list) => {
    patchBase(me.id, (p) => ({ ...p, highlights: list }));
    return run(sb.from('profiles').update({ highlights: list }).eq('id', me.id), 'Kaydedilemedi.');
  };
  const addToHighlight = async (storyId, hlId, title) => {
    const list = ((myProfile && myProfile.highlights) || []).map((h) => ({ ...h, items: h.items.slice() }));
    const s = storyById[storyId];
    const cover = s && s.media ? (s.media.type === 'video' ? s.media.thumb || s.media.id : s.media.id) : null;
    if (hlId) {
      const h = list.find((x) => x.id === hlId);
      if (h && h.items.indexOf(storyId) < 0) h.items.push(storyId);
      if (h && !h.cover) h.cover = cover;
    } else list.push({ id: rid(), title: title || 'Öne çıkan', cover, items: [storyId] });
    const ok = await saveHighlights(list);
    if (ok) toast('Öne çıkanlara eklendi');
  };
  const removeHighlight = (hlId) => saveHighlights(((myProfile && myProfile.highlights) || []).filter((h) => h.id !== hlId));

  /* ------------------------------------------------ mesajlar */
  const dmWith = useCallback((uid) => threads.find((t) => !t.isGroup && t.members.some((m) => m.id === uid) && t.members.some((m) => m.id === me.id)) || null, [threads, me.id]);
  const ensureDm = async (uid) => {
    const t = dmWith(uid);
    if (t) return t.id;
    const { data, error } = await sb.rpc('start_dm', { other: uid });
    if (error) { toast(errText(error, 'Sohbet açılamadı.')); return null; }
    await fetchThread(data);
    return data;
  };
  const onChat = useCallback((cb) => { chatSubs.current.add(cb); return () => chatSubs.current.delete(cb); }, []);
  const emitLocal = (table, ev, row) => chatSubs.current.forEach((cb) => cb(table, ev, row, row));
  const sendMessage = async (tid, payload, file) => {
    if (!tid) return false;
    const id = uuid();
    try {
      const row = { id, thread_id: tid, sender: me.id, text: payload.text || null, post_id: payload.post || null, story: payload.story || null, reply_to: payload.replyTo || null, media: payload.media || null };
      if (file) {
        if (file.type && file.type.indexOf('image') === 0) {
          const img = await compressImage(file, 1280);
          row.media = { id: await upload(img.blob, 'm', 'jpg', 'image/jpeg'), type: 'image', w: img.w, h: img.h };
        } else if (file.type && file.type.indexOf('video') === 0) {
          if (file.size > MAX_UPLOAD) { toast('Video 50 MB’tan büyük olamaz.'); return false; }
          const info = await videoInfo(file);
          let thumb = null;
          if (info.thumb) { try { thumb = await upload(info.thumb, 'm', 'jpg', 'image/jpeg'); } catch (e) { thumb = null; } }
          row.media = { id: await upload(file, 'm', file.type.indexOf('webm') >= 0 ? 'webm' : 'mp4', file.type), type: 'video', thumb, w: info.w, h: info.h };
        } else {
          const t = file.type || 'audio/webm';
          const ext = t.indexOf('mp4') >= 0 || t.indexOf('aac') >= 0 ? 'm4a' : t.indexOf('ogg') >= 0 ? 'ogg' : 'webm';
          row.media = { id: await upload(file, 'm', ext, t), type: 'audio', duration: payload.duration || 0 };
        }
      }
      emitLocal('messages', 'INSERT', { ...row, created_at: iso(), pending: true });
      const { error } = await sb.from('messages').insert(row);
      if (error) {
        emitLocal('messages', 'DELETE', { id });
        toast(errText(error, 'Mesaj gönderilemedi.'));
        return false;
      }
      const preview = row.text || (row.media ? (row.media.type === 'audio' ? '🎤 Sesli mesaj' : row.media.type === 'video' ? '🎬 Video' : '📷 Fotoğraf') : row.post_id ? 'Bir gönderi paylaştı' : 'Mesaj');
      patchThread(tid, (t) => ({ ...t, at: Date.now(), last: { id, from: me.id, at: Date.now(), text: preview, post: row.post_id }, members: t.members.map((m) => (m.id === me.id ? { ...m, read: Date.now(), accepted: true } : m)) }));
      setTyping(null);
      return true;
    } catch (e) {
      emitLocal('messages', 'DELETE', { id });
      toast(errText(e, 'Mesaj gönderilemedi.'));
      console.warn(e);
      return false;
    }
  };
  const sendTo = async (uid, payload, file) => {
    const tid = await ensureDm(uid);
    return tid ? sendMessage(tid, payload, file) : false;
  };
  const reactMessage = (tid, m, emoji) => {
    haptic(8);
    const cur = m.reactions && m.reactions[me.id];
    if (cur === emoji) {
      emitLocal('message_reactions', 'DELETE', { message_id: m.id, user_id: me.id });
      sb.from('message_reactions').delete().eq('message_id', m.id).eq('user_id', me.id).then(({ error }) => { if (error) toast('Tepki kaldırılamadı.'); });
    } else {
      emitLocal('message_reactions', 'INSERT', { message_id: m.id, user_id: me.id, emoji });
      sb.from('message_reactions').upsert({ message_id: m.id, user_id: me.id, emoji }, { onConflict: 'message_id,user_id' }).then(({ error }) => { if (error) toast('Tepki eklenemedi.'); });
    }
  };
  const unsendMessage = async (tid, m) => {
    emitLocal('messages', 'UPDATE', { id: m.id, thread_id: tid, sender: m.from, unsent: true, text: null, media: null, post_id: null, story: null, reply_to: null, created_at: iso(m.at) });
    await run(sb.from('messages').update({ unsent: true }).eq('id', m.id), 'Geri alınamadı.');
    if (m.media && m.media.id) removeFiles([m.media.id, m.media.thumb]);
  };
  const editMessage = async (tid, m, text) => {
    const ok = await run(sb.from('messages').update({ text }).eq('id', m.id), 'Mesaj düzenlenemedi.');
    if (ok) emitLocal('messages', 'UPDATE', { id: m.id, thread_id: tid, sender: m.from, text, media: m.media, post_id: m.post, story: m.story, reply_to: m.replyTo, unsent: false, edited_at: iso(), created_at: iso(m.at) });
    return ok;
  };
  const markRead = (t) => {
    const m = myMember(t);
    if (!t || !m || !t.last || t.last.from === me.id || t.last.at <= (m.read || 0)) return;
    const now = Date.now();
    patchThread(t.id, (x) => ({ ...x, members: x.members.map((y) => (y.id === me.id ? { ...y, read: now } : y)) }));
    sb.from('thread_members').update({ last_read_at: iso(now) }).eq('thread_id', t.id).eq('user_id', me.id).then(noop, noop);
  };
  const acceptThread = (t) => {
    patchThread(t.id, (x) => ({ ...x, members: x.members.map((y) => (y.id === me.id ? { ...y, accepted: true } : y)) }));
    run(sb.from('thread_members').update({ accepted: true }).eq('thread_id', t.id).eq('user_id', me.id), 'Kabul edilemedi.');
  };
  const muteThread = (t, v) => {
    patchThread(t.id, (x) => ({ ...x, members: x.members.map((y) => (y.id === me.id ? { ...y, muted: v } : y)) }));
    run(sb.from('thread_members').update({ muted: v }).eq('thread_id', t.id).eq('user_id', me.id), 'Kaydedilemedi.');
  };
  const leaveThread = async (t) => {
    const ok = await run(sb.from('thread_members').delete().eq('thread_id', t.id).eq('user_id', me.id), 'Sohbet silinemedi.');
    if (ok) { setThreads((m) => omit(m, t.id)); setStack((s) => s.filter((o) => !(o.type === 'chat' && o.tid === t.id) && !(o.type === 'groupinfo' && o.tid === t.id))); }
    return ok;
  };
  const createGroup = async (ids, title) => {
    const { data, error } = await sb.rpc('create_group', { member_ids: ids, p_title: title || null });
    if (error) { toast(errText(error, 'Grup oluşturulamadı.')); return null; }
    await fetchThread(data);
    return data;
  };
  const addGroupMembers = async (tid, ids) => {
    const ok = await run(sb.rpc('add_group_members', { tid, member_ids: ids }), 'Eklenemedi.');
    if (ok) fetchThread(tid);
    return ok;
  };
  const renameGroup = async (tid, title) => {
    const ok = await run(sb.rpc('rename_group', { tid, p_title: title }), 'Ad değiştirilemedi.');
    if (ok) patchThread(tid, (t) => ({ ...t, title }));
    return ok;
  };
  const loadMessages = async (tid, beforeMs) => {
    const { data, error } = await sb.rpc('get_messages', { tid, before_ms: beforeMs || null, lim: 80 });
    if (error) { toast(errText(error, 'Mesajlar yüklenemedi.')); return null; }
    return data || [];
  };
  const typingTid = useRef(null);
  const setTyping = (tid) => {
    const ch = presence.current;
    if (!ch || !showActivityRef.current || typingTid.current === (tid || null)) return;
    typingTid.current = tid || null;
    ch.track({ typing: tid || null, at: Date.now() });
  };

  /* ------------------------------------------------ profil ve hesap */
  const saveProfile = async (fields, avatarFile, removeAvatar) => {
    try {
      let avatar = myProfile ? myProfile.avatar || null : null;
      const old = avatar;
      if (removeAvatar) avatar = null;
      if (avatarFile) {
        const img = await compressImage(avatarFile, 480, 1);
        avatar = await upload(img.blob, 'a', 'jpg', 'image/jpeg');
      }
      if (fields.username && myProfile && fields.username !== myProfile.username) {
        const { error } = await sb.rpc('change_username', { new_name: fields.username });
        if (error) { toast(errText(error, 'Kullanıcı adı değiştirilemedi.')); return false; }
        patchBase(me.id, (p) => ({ ...p, username: fields.username }));
      }
      const row = { full_name: fields.displayName || '', bio: fields.bio || '', website: fields.website || '', category: fields.category || '', avatar };
      const { error } = await sb.from('profiles').update(row).eq('id', me.id);
      if (error) { toast(errText(error, 'Profil kaydedilemedi.')); return false; }
      patchBase(me.id, (p) => ({ ...p, displayName: row.full_name, bio: row.bio, website: row.website, category: row.category, avatar }));
      if (old && old !== avatar) removeFiles([old]);
      toast('Profil kaydedildi');
      return true;
    } catch (e) {
      toast(errText(e, 'Profil kaydedilemedi.'));
      console.warn(e);
      return false;
    }
  };
  const setPrivacy = async (fields) => {
    const row = {};
    if ('private' in fields) row.is_private = fields.private;
    if ('showActivity' in fields) row.show_activity = fields.showActivity;
    patchBase(me.id, (p) => ({ ...p, ...fields }));
    const ok = await run(sb.from('profiles').update(row).eq('id', me.id), 'Kaydedilemedi.');
    if (ok && 'private' in fields && !fields.private) setFollows((m) => { const n = { ...m }; Object.keys(n).forEach((k) => { if (n[k].t === me.id && n[k].s === 'pending') n[k] = { ...n[k], s: 'accepted' }; }); return n; });
    if (!ok) boot(true);
    return ok;
  };
  const setNote = async (text) => {
    const t = (text || '').trim().slice(0, 60);
    patchBase(me.id, (p) => ({ ...p, note: t || null, noteAt: t ? Date.now() : null }));
    return run(sb.from('profiles').update({ note: t || null, note_at: t ? iso() : null }).eq('id', me.id), 'Not kaydedilemedi.');
  };
  const updateContact = async (email, phone) => {
    const { error } = await sb.rpc('update_contact', { p_email: email || null, p_phone: phone || null });
    if (error) { toast(errText(error, 'Kaydedilemedi.')); return false; }
    const { data } = await sb.from('accounts').select('email, phone').eq('user_id', me.id);
    if (data && data[0]) setAccount(data[0]);
    toast('Bilgilerin güncellendi');
    return true;
  };
  const changePassword = async (pw) => {
    const { error } = await sb.auth.updateUser({ password: pw });
    if (error) { toast(/should be different/i.test(error.message || '') ? 'Yeni şifre eskisinden farklı olmalı.' : errText(error, 'Şifre değiştirilemedi.')); return false; }
    toast('Şifren değişti');
    return true;
  };
  const logout = async () => {
    try { if (presence.current && presence.current.untrack) await presence.current.untrack(); } catch (e) { /* yok say */ }
    await sb.auth.signOut();
  };
  const deleteAccount = async () => {
    try {
      for (const f of ['p', 's', 'a', 'm']) {
        const { data } = await sb.storage.from('media').list(me.id + '/' + f, { limit: 1000 });
        if (data && data.length) await sb.storage.from('media').remove(data.map((x) => me.id + '/' + f + '/' + x.name));
      }
    } catch (e) { /* dosyalar silinemese de hesap silinir */ }
    const { data, error } = await sb.functions.invoke('delete-account', { body: {} });
    if (error || !data || !data.ok) { const b = await functionError(error, data); toast(errText({ message: b && b.error }, 'Hesap silinemedi.')); return false; }
    store.set('onboard:' + me.id, false);
    await sb.auth.signOut();
    return true;
  };
  const markActivitySeen = () => {
    if (!notifs.some((n) => !n.read)) return;
    setNotifs((l) => l.map((n) => ({ ...n, read: true })));
    sb.from('notifications').update({ read_at: iso() }).eq('user_id', me.id).is('read_at', null).then(noop, noop);
  };
  const finishOnboarding = () => { store.set('onboard:' + me.id, false); setOnboarding(false); };

  /* ------------------------------------------------ eksik veriyi getir */
  const mergeFetched = (d) => {
    if (!d) return;
    if (d.posts) setPosts((m) => { const n = { ...m }; d.posts.forEach((p) => { n[p.id] = p; }); return n; });
    if (d.comments) setComments((m) => { const n = { ...m }; d.comments.forEach((c) => { n[c.id] = c; }); return n; });
  };
  const ensurePost = async (id) => {
    if (postsRef.current[id]) return postsRef.current[id];
    const { data } = await sb.rpc('get_posts', { ids: [id] });
    mergeFetched(data);
    return data && data.posts && data.posts[0] ? data.posts[0] : null;
  };
  const loadUserPosts = async (uid) => {
    if (loadedUsers.current[uid]) return;
    loadedUsers.current[uid] = true;
    const { data, error } = await sb.rpc('user_posts', { uid });
    if (error) { loadedUsers.current[uid] = false; return; }
    mergeFetched(data);
  };
  const refresh = () => boot(true);

  /* ------------------------------------------------ ayarlar */
  const setTheme = (t) => { setThemeState(t); store.set('theme', t); };
  const setFeedMode = (m) => { setFeedModeState(m); store.set('feedMode', m); };
  const postUrl = (id) => location.origin + '/p/' + id;
  const profileUrl = (uid) => location.origin + '/@' + nameOf(uid);
  const copyLink = async (post) => {
    const r = await shareLink('@' + nameOf(post.author) + ' Rozstram’da', postUrl(post.id));
    if (r === 'copied') toast('Bağlantı kopyalandı'); else if (r === 'fail') toast('Kopyalanamadı');
  };

  /* ------------------------------------------------ gezinme */
  const push = (o) => setStack((s) => s.concat([{ key: rid(), ...o }]));
  const popTo = (i) => setStack((s) => s.slice(0, i));
  const replaceTop = (o) => setStack((s) => s.slice(0, -1).concat([{ key: rid(), ...o }]));
  const goTab = (t) => {
    if (t === tab && !stack.length) setRetap((r) => ({ tab: t, n: r.n + 1 }));
    setStack([]); setTab(t); setPanel(null);
    setVisited((v) => (v[t] ? v : { ...v, [t]: true }));
  };
  const openUser = (uid) => { setPanel(null); setStoryView(null); if (uid === me.id) { goTab('profile'); return; } push({ type: 'user', uid }); };
  const openPost = (id) => { setPanel(null); push({ type: 'post', id }); };
  const openStories = (uid) => {
    const idx = storyGroups.findIndex((g) => g.uid === uid);
    if (idx < 0) { openUser(uid); return; }
    setStoryView({ groups: storyGroups, index: idx });
  };
  const openHighlight = async (uid, hl) => {
    let items = hl.items.map((id) => storyById[id]).filter(Boolean);
    const missing = hl.items.filter((id) => !storyById[id]);
    if (missing.length) {
      const { data } = await sb.rpc('get_stories', { ids: missing });
      if (data && data.length) {
        setStories((m) => { const n = { ...m }; data.forEach((s) => { n[s.id] = s; }); return n; });
        items = items.concat(data);
      }
    }
    items = items.sort((a, b) => a.at - b.at);
    if (!items.length) { toast('Bu öne çıkanda hikaye kalmadı'); return; }
    setStoryView({ groups: [{ uid, items }], index: 0, highlight: hl });
  };
  const openArchive = (items, startAt) => { if (items.length) setStoryView({ groups: [{ uid: me.id, items }], index: 0, archive: true, startAt: startAt || 0 }); };
  const openComments = (postId, replyTo, focus) => setPanel({ type: 'comments', postId, replyTo: replyTo || null, focus: !!focus, k: rid() });
  const openLikes = (ids, title) => setPanel({ type: 'likes', ids, title: title || 'Beğenenler', k: rid() });
  const openSend = (post) => setPanel({ type: 'send', post, k: rid() });
  const openCreate = (mode, extra) => push({ type: 'create', mode: mode || 'post', ...(extra || {}) });
  const openTag = (tag) => { setPanel(null); setStoryView(null); push({ type: 'tag', tag: tag.replace(/^#/, '') }); };
  const openThread = (tid) => { setPanel(null); setStoryView(null); push({ type: 'chat', tid }); };
  const openChatWith = async (uid) => {
    setPanel(null); setStoryView(null);
    if (blocks[uid]) { toast('Engellediğin kişiye mesaj atamazsın.'); return; }
    const tid = await ensureDm(uid);
    if (tid) push({ type: 'chat', tid });
  };
  const confirm = (c) => setConfirmBox(c);
  const postMenu = (post) => {
    const items = [];
    const mine = post.author === me.id;
    if (mine) {
      items.push({ label: 'Düzenle', icon: 'edit', onClick: () => setPanel({ type: 'editPost', post, k: rid() }) });
      items.push({ label: post.pinned ? 'Profilden sabitlemeyi kaldır' : 'Profiline sabitle', icon: 'pin', onClick: () => editPost(post, { pinned: !post.pinned }).then((ok) => ok && toast(post.pinned ? 'Sabitleme kaldırıldı' : 'Profiline sabitlendi')) });
      items.push({ label: post.archived ? 'Profilde göster' : 'Arşivle', icon: 'history', onClick: () => editPost(post, { archived: !post.archived }).then((ok) => ok && toast(post.archived ? 'Profilinde tekrar görünüyor' : 'Arşivlendi. Sadece sen görebilirsin.')) });
      items.push({ label: post.hideLikes ? 'Beğeni sayısını göster' : 'Beğeni sayısını gizle', icon: post.hideLikes ? 'eye' : 'eyeOff', onClick: () => editPost(post, { hideLikes: !post.hideLikes }) });
      items.push({ label: post.noComments ? 'Yorumları aç' : 'Yorumları kapat', icon: 'comment', onClick: () => editPost(post, { noComments: !post.noComments }) });
    }
    items.push({ label: 'Hikayene ekle', icon: 'plusSq', onClick: () => shareToStory(post) });
    items.push({ label: 'Bağlantıyı paylaş', icon: 'link', onClick: () => copyLink(post) });
    if (!mine) {
      const f = following.has(post.author);
      if (f) items.push({ label: 'Takibi bırak', icon: 'userX', onClick: () => setFollow(post.author, false) });
      else if (!requested.has(post.author)) items.push({ label: 'Takip et', icon: 'userPlus', onClick: () => setFollow(post.author, true) });
      items.push({ label: 'Bunu görmek istemiyorum', icon: 'eyeOff', onClick: () => hidePost(post.id) });
      items.push({ label: mutes[post.author] ? 'Sesini aç' : 'Sessize al', icon: 'volOff', onClick: () => setMute(post.author, !mutes[post.author]) });
    }
    items.push({ label: 'Profile git', icon: 'user', onClick: () => openUser(post.author) });
    if (!mine) items.push({ label: 'Şikayet et', icon: 'flag', danger: true, onClick: () => openReport('post', post.id) });
    if (mine) items.push({ label: 'Sil', icon: 'trash', danger: true, onClick: () => confirm({ title: 'Gönderi silinsin mi?', ok: 'Sil', danger: true, onOk: () => deletePost(post) }) });
    setSheet({ items });
  };

  /* bağlantıyla açılan gönderi / profil */
  useEffect(() => {
    if (!loaded || !deepLink.current) return;
    const d = deepLink.current;
    deepLink.current = null;
    try { history.replaceState(null, '', '/'); } catch (e) { /* yok say */ }
    if (d.type === 'post') openPost(d.id);
    else if (d.type === 'user') { const uid = uidByName(d.name); if (uid) openUser(uid); else toast('@' + d.name + ' bulunamadı'); }
  }, [loaded]);

  const ctx = {
    sb, me, canAct: true, loaded: { posts: loaded, profiles: loaded, threads: loaded }, conn, account,
    profiles, myProfile, following, requested, incoming, followerCount, canSee, blocks, mutes, closeFriends,
    posts, visiblePosts, feed, reelsFor, postById, comments, commentsByPost, commentById, commentCount,
    stories, storyById, storyGroups, groupSeen, storyRing, isSeen,
    threads, inboxThreads, requestThreads, otherOf, myMember, isRequest, isUnread, unreadThreads,
    saved, hidden, activity, notifs, unreadActivity,
    sound, setSound, feedMode, setFeedMode, theme, setTheme, retap, tab,
    nameOf, avatarOf, uidByName, isOnline, typingIn, lastSeenText, toast, confirm, setSheet, setPanel, setPeek,
    setLike, setCommentLike, setSaved, hidePost, restoreHidden, setFollow, confirmUnfollow, cancelRequest, acceptRequest, declineRequest,
    removeFollower, setCloseFriend, setMute, block, unblock, report, openReport,
    addComment, deleteComment, pinComment, editPost, deletePost,
    publish, shareToStory, markStorySeen, setStoryLike, deleteStory, addToHighlight, removeHighlight, markActivitySeen,
    dmWith, ensureDm, sendMessage, sendTo, reactMessage, unsendMessage, editMessage, markRead, acceptThread, muteThread, leaveThread,
    createGroup, addGroupMembers, renameGroup, loadMessages, onChat, setTyping,
    saveProfile, setPrivacy, setNote, updateContact, changePassword, logout, deleteAccount, copyLink, postUrl, profileUrl,
    ensurePost, loadUserPosts, refresh, finishOnboarding,
    push, popTo, replaceTop, goTab, openUser, openPost, openStories, openHighlight, openArchive, openComments, openLikes, openSend,
    openCreate, openTag, openThread, openChatWith, postMenu,
  };

  if (phase === 'boot') return <BootScreen />;
  if (phase === 'noconfig') {
    return <div className="app"><Empty icon="info" title="Kurulum bekleniyor" text="Rozstram sunucu bilgileri henüz eklenmedi. Kurulum tamamlanınca bu sayfa çalışacak." /></div>;
  }
  if (phase === 'offline') {
    return <div className="app"><Empty icon="info" title="Bağlanılamadı" text="İnternet bağlantını kontrol edip sayfayı yenile." action={<button className="btn grad" onClick={() => location.reload()}>Yenile</button>} /></div>;
  }
  if (phase === 'auth') return <AuthScreen sb={sb} onSignedUp={(id) => store.set('onboard:' + id, true)} />;
  if (!loaded) return <BootScreen note={conn === 'down' ? 'Bağlantı kuruluyor…' : null} retry={conn === 'down' ? () => boot(false).then((ok) => setConn(ok ? 'ok' : 'down')) : null} />;

  const renderPage = (o, i) => {
    const onBack = () => popTo(i);
    let body = null;
    if (o.type === 'user') body = <ProfileScreen uid={o.uid} />;
    else if (o.type === 'post') body = <PostScreen id={o.id} />;
    else if (o.type === 'people') body = <PeopleScreen uid={o.uid} initial={o.tab} ids={o.ids} title={o.title} />;
    else if (o.type === 'activity') body = <ActivityScreen />;
    else if (o.type === 'requests') body = <RequestsScreen />;
    else if (o.type === 'inbox') body = <InboxScreen />;
    else if (o.type === 'newmsg') body = <NewMessageScreen group={o.group} addTo={o.addTo} />;
    else if (o.type === 'chat') body = <ChatScreen tid={o.tid} />;
    else if (o.type === 'groupinfo') body = <GroupInfoScreen tid={o.tid} />;
    else if (o.type === 'edit') body = <EditProfileScreen />;
    else if (o.type === 'settings') body = <SettingsScreen />;
    else if (o.type === 'account') body = <AccountScreen />;
    else if (o.type === 'plist') body = <PeopleListScreen kind={o.kind} />;
    else if (o.type === 'grid') body = <GridScreen kind={o.kind} title={o.title} />;
    else if (o.type === 'tag') body = <TagScreen tag={o.tag} />;
    else if (o.type === 'create') body = <CreateFlow mode={o.mode} onDone={(go) => { popTo(i); if (go) goTab(go); }} />;
    const full = !!FULLSCREEN[o.type];
    const fullIdx = stack.findIndex((x) => FULLSCREEN[x.type]);
    const above = full || (fullIdx >= 0 && i > fullIdx);
    return (
      <Screen key={o.key} onBack={onBack} z={above ? Math.min(59, 51 + i) : 20 + i} up={o.type === 'create' || o.type === 'edit'}>
        <div className={'col' + (above ? '' : ' pad-nav')}>{body}</div>
      </Screen>
    );
  };

  const navDark = tab === 'reels' && !stack.length;
  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        {['home', 'explore', 'reels', 'profile'].map((t) => (visited[t] ? (
          <div key={t} className="tab-view" hidden={tab !== t}>
            {t === 'home' ? <HomeScreen live={tab === 'home' && !stack.length && !storyView && !panel} />
              : t === 'explore' ? <ExploreScreen />
              : t === 'reels' ? <ReelsScreen live={tab === 'reels' && !stack.length && !storyView && !panel} />
              : <ProfileScreen uid={me.id} isTab />}
          </div>
        ) : null))}
        {stack.map(renderPage)}
        <nav className={'nav' + (navDark ? ' dark' : '')} style={{ zIndex: 50 }} aria-label="Ana menü">
          <button aria-label="Ana sayfa" onClick={() => goTab('home')}>
            <Icon n="home" fill={tab === 'home' && !stack.length} size={27} />
            {unreadActivity && tab !== 'home' ? <span className="pip" style={{ color: 'var(--like)' }} /> : null}
          </button>
          <button aria-label="Keşfet" onClick={() => goTab('explore')}><Icon n="search" size={27} stroke={tab === 'explore' && !stack.length ? 2.9 : 1.9} /></button>
          <button aria-label="Oluştur" onClick={() => openCreate('post')}><span className="create"><Icon n="plus" size={22} stroke={2.6} /></span></button>
          <button aria-label="Reels" onClick={() => goTab('reels')}><Icon n="reels" size={27} stroke={tab === 'reels' && !stack.length ? 2.6 : 1.9} /></button>
          <button aria-label="Profil" onClick={() => goTab('profile')}>
            <span className={'me-ring' + (tab === 'profile' && !stack.length ? ' on' : '')}><img className="av" src={avatarOf(me.id)} alt="" style={{ width: 26, height: 26 }} /></span>
          </button>
        </nav>
        {storyView ? <StoryViewer key={storyView.index + ':' + storyView.groups.map((g) => g.uid).join()} {...storyView} onClose={() => setStoryView(null)} /> : null}
        {panel && panel.type === 'comments' ? <CommentsSheet key={panel.k} postId={panel.postId} replyTo={panel.replyTo} focus={panel.focus} onClose={() => setPanel(null)} /> : null}
        {panel && panel.type === 'likes' ? <LikesSheet key={panel.k} ids={panel.ids} title={panel.title} onClose={() => setPanel(null)} /> : null}
        {panel && panel.type === 'send' ? <SendSheet key={panel.k} post={panel.post} onClose={() => setPanel(null)} /> : null}
        {panel && panel.type === 'editPost' ? <EditPostSheet key={panel.k} post={panel.post} onClose={() => setPanel(null)} /> : null}
        {panel && panel.type === 'shareProfile' ? <ShareProfileSheet key={panel.k} uid={panel.uid} onClose={() => setPanel(null)} /> : null}
        {panel && panel.type === 'highlight' ? <HighlightSheet key={panel.k} storyId={panel.storyId} onClose={() => setPanel(null)} /> : null}
        {panel && panel.type === 'report' ? <ReportSheet key={panel.k} kind={panel.kind} target={panel.target} extra={panel.extra} onClose={() => setPanel(null)} /> : null}
        {peek ? <PeekModal postId={peek} onClose={() => setPeek(null)} /> : null}
        {sheet ? <ActionSheet sheet={sheet} onClose={() => setSheet(null)} /> : null}
        {confirmBox ? <ConfirmDialog c={confirmBox} onClose={() => setConfirmBox(null)} /> : null}
        {onboarding ? <Onboarding onDone={finishOnboarding} /> : null}
        {toastMsg ? (
          <div className="toast" role="status" key={toastMsg.k}>
            <span>{toastMsg.text}</span>
            {toastMsg.action ? <button onClick={() => { setToastMsg(null); toastMsg.action.fn(); }}>{toastMsg.action.label}</button> : null}
          </div>
        ) : null}
      </div>
    </Ctx.Provider>
  );
}

function BootScreen({ note, retry }) {
  return (
    <div className="loading">
      <div style={{ display: 'grid', justifyItems: 'center', gap: 18 }}>
        <Mark size={54} />
        <Spinner />
        {note ? <span className="sub">{note}</span> : null}
        {retry ? <button className="btn" onClick={retry}>Tekrar dene</button> : null}
      </div>
    </div>
  );
}

/* gönderi düzenleme paneli */
function EditPostSheet({ post, onClose }) {
  const app = useApp();
  const [caption, setCaption] = useState(post.caption || '');
  const [location, setLocation] = useState(post.location || '');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const ok = await app.editPost(post, { caption: caption.trim(), location: location.trim() });
    setBusy(false);
    if (ok) { app.toast('Gönderi güncellendi'); onClose(); }
  };
  return (
    <Sheet onClose={onClose} title="Bilgileri düzenle" z={65}>
      <div className="g sheet-body">
        <div className="field"><label htmlFor="ep-cap">Açıklama</label>
          <textarea id="ep-cap" rows={4} value={caption} maxLength={2200} onChange={(e) => setCaption(e.target.value)} /></div>
        <div className="field"><label htmlFor="ep-loc">Konum</label>
          <input id="ep-loc" value={location} maxLength={80} onChange={(e) => setLocation(e.target.value)} placeholder="Konum ekle" /></div>
        <div style={{ paddingBlock: '8px 16px' }}><button className="btn primary block big" onClick={save} disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button></div>
      </div>
    </Sheet>
  );
}

createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}

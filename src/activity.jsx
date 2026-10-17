import { Fragment, useEffect, useMemo } from 'react';
import { useApp } from './ctx.js';
import { ago, mediaUrl, sectionOf } from './lib.js';
import { Avatar, AvatarStack, Empty, FollowButton, Icon, TopBar } from './ui.jsx';

const SECTIONS = ['Bugün', 'Bu hafta', 'Bu ay', 'Daha önce'];

function names(app, actors) {
  const a = actors.map((u) => app.nameOf(u));
  if (a.length === 1) return <b>{a[0]}</b>;
  if (a.length === 2) return <Fragment><b>{a[0]}</b> ve <b>{a[1]}</b></Fragment>;
  return <Fragment><b>{a[0]}</b>, <b>{a[1]}</b> ve diğer {a.length - 2} kişi</Fragment>;
}

export function ActivityScreen() {
  const app = useApp();
  useEffect(() => { const t = setTimeout(() => app.markActivitySeen(), 1500); return () => clearTimeout(t); }, []);

  const sections = useMemo(() => {
    const out = {};
    app.activity.forEach((it) => {
      const sec = sectionOf(it.at);
      const list = (out[sec] = out[sec] || []);
      if (it.kind === 'like' || it.kind === 'follow') {
        const g = list.find((x) => x.kind === it.kind && (it.kind === 'follow' || x.post === it.post));
        if (g) { if (g.actors.indexOf(it.actor) < 0) g.actors.push(it.actor); return; }
      }
      list.push({ ...it, actors: [it.actor] });
    });
    return out;
  }, [app.activity]);

  const thumbOf = (it) => {
    if (it.story) {
      const s = app.storyById[it.story];
      if (!s || !s.media) return null;
      return mediaUrl(s.media.type === 'video' ? s.media.thumb : s.media.id);
    }
    const post = it.post && app.postById[it.post];
    const m = post && post.media && post.media[0];
    return m ? mediaUrl(m.type === 'video' ? m.thumb : m.id) : null;
  };
  const textOf = (it) => {
    const who = names(app, it.actors);
    const quote = it.text ? <Fragment>: {it.text}</Fragment> : null;
    switch (it.kind) {
      case 'like': return <Fragment>{who} gönderini beğendi.</Fragment>;
      case 'comment': return <Fragment>{who} yorum yaptı{quote}</Fragment>;
      case 'reply': return <Fragment>{who} yorumuna yanıt verdi{quote}</Fragment>;
      case 'mention': return <Fragment>{who} bir yorumda senden bahsetti{quote}</Fragment>;
      case 'mentionPost': return <Fragment>{who} bir gönderide senden bahsetti.</Fragment>;
      case 'clike': return <Fragment>{who} yorumunu beğendi{quote}</Fragment>;
      case 'slike': return <Fragment>{who} hikayeni beğendi.</Fragment>;
      case 'accepted': return <Fragment>{who} takip isteğini kabul etti.</Fragment>;
      case 'tag': return <Fragment>{who} seni bir gönderide etiketledi.</Fragment>;
      case 'storyMention': return <Fragment>{who} hikayesinde senden bahsetti.</Fragment>;
      default: return <Fragment>{who} seni takip etmeye başladı.</Fragment>;
    }
  };
  const open = (it) => {
    if (it.kind === 'follow' || it.kind === 'accepted') app.openUser(it.actors[0]);
    else if (it.kind === 'slike') app.openStories(app.me.id);
    else if (it.kind === 'storyMention') app.openStories(it.actors[0]);
    else if (it.kind === 'comment' || it.kind === 'reply' || it.kind === 'mention' || it.kind === 'clike') app.openComments(it.post);
    else if (it.post) app.openPost(it.post);
  };

  const any = SECTIONS.some((s) => sections[s] && sections[s].length);
  return (
    <Fragment>
      <TopBar back title="Bildirimler" line />
      <div className="body g">
        {app.incoming.length ? (
          <button className="act-row req-row" onClick={() => app.push({ type: 'requests' })}>
            <span className="act-stack">{app.incoming.length > 1 ? <AvatarStack ids={app.incoming} size={30} /> : <Avatar uid={app.incoming[0]} size={44} />}</span>
            <span className="txt"><b>Takip istekleri</b><span className="sub">{app.nameOf(app.incoming[0])}{app.incoming.length > 1 ? ' ve diğer ' + (app.incoming.length - 1) + ' kişi' : ''}</span></span>
            <span className="unread-dot" /><Icon n="chevRight" size={18} />
          </button>
        ) : null}
        {any ? SECTIONS.map((sec) => (sections[sec] && sections[sec].length ? (
          <Fragment key={sec}>
            <div className="act-section">{sec}</div>
            {sections[sec].map((it, i) => {
              const thumb = thumbOf(it);
              return (
                <div className={'act-row' + (it.read ? '' : ' unread')} key={sec + i} style={{ animationDelay: Math.min(i, 10) * 0.03 + 's' }}>
                  {it.actors.length > 1 ? (
                    <span className="act-stack"><Avatar uid={it.actors[0]} size={32} /><Avatar uid={it.actors[1]} size={32} /></span>
                  ) : <Avatar uid={it.actors[0]} size={44} ring={app.storyRing(it.actors[0])} onClick={() => app.openUser(it.actors[0])} />}
                  <button className="txt" onClick={() => open(it)}>{textOf(it)} <span className="time">{ago(it.at)}</span></button>
                  {(it.kind === 'follow' || it.kind === 'accepted') && it.actors.length === 1 ? <FollowButton uid={it.actors[0]} small />
                    : thumb ? <button onClick={() => open(it)} aria-label="Aç"><img className="thumb" src={thumb} alt="" /></button> : null}
                </div>
              );
            })}
          </Fragment>
        ) : null)) : app.incoming.length ? null : <Empty icon="heart" title="Henüz bildirim yok" text="Biri gönderini beğendiğinde, yorum yaptığında ya da seni takip ettiğinde burada göreceksin." />}
      </div>
    </Fragment>
  );
}

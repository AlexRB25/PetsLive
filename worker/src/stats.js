// Estadísticas de un directo por plataforma (sin IA): comentarios, entradas, likes, follows,
// suscripciones, regalos y quién comentó o regaló más.
const MAX_PEOPLE = 5000; // tope de nombres distintos por plataforma para no crecer sin límite

function top(map, n = 5) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));
}

function bump(map, key, by) {
  if (map.has(key) || map.size < MAX_PEOPLE) map.set(key, (map.get(key) || 0) + by);
}

export class SessionStats {
  constructor() {
    this.platforms = {};
  }

  of(platform) {
    return (this.platforms[platform] ??= {
      comments: 0, joins: 0, likes: 0, follows: 0, subs: 0, gifts: 0, giftValue: 0,
      chatters: new Map(), gifters: new Map(),
    });
  }

  add(evt, platform) {
    const s = this.of(platform);
    const user = String(evt.user || '').trim().slice(0, 40);
    switch (evt.type) {
      case 'chat':
        s.comments++;
        if (user) bump(s.chatters, user, 1);
        break;
      case 'join': s.joins++; break;
      case 'like': s.likes += Math.max(1, Number(evt.amount) || 1); break;
      case 'follow': s.follows++; break;
      case 'sub': s.subs++; break;
      case 'gift': {
        const n = Math.max(1, Number(evt.amount) || 1);
        const v = Number(evt.value) > 0 ? Number(evt.value) : n;
        s.gifts += n;
        s.giftValue += v;
        if (user) bump(s.gifters, user, v);
        break;
      }
    }
  }

  toJSON() {
    const out = {};
    for (const [p, s] of Object.entries(this.platforms)) {
      out[p] = {
        comments: s.comments, chatters: s.chatters.size, joins: s.joins, likes: s.likes, follows: s.follows,
        subs: s.subs, gifts: s.gifts, giftValue: Math.round(s.giftValue),
        topChatters: top(s.chatters), topGifters: top(s.gifters),
      };
    }
    return out;
  }
}

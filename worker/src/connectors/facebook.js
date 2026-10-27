// Facebook Live (solo páginas): comentarios y reacciones con la Graph API oficial y el token de la página.
// Requiere que la app de Meta tenga aprobados pages_show_list, pages_read_engagement y
// pages_read_user_content. Los perfiles personales no exponen sus directos por API.
import { Connector, readSSE } from './base.js';

const GRAPH = () => `https://graph.facebook.com/${process.env.FB_GRAPH_VERSION || 'v23.0'}`;
const STREAM = 'https://streaming-graph.facebook.com';

export class FacebookConnector extends Connector {
  constructor(ctx) {
    super('facebook', ctx);
    this.abort = null;
    this.videoId = null;
  }

  page() {
    const id = this.ctx.settings.pageId;
    return id ? this.ctx.getTokens()?.pages?.[id] : null;
  }

  start() {
    if (!this.page()) return this.status('error', 'Conecta Facebook y elige la página que transmite');
    this.find();
  }

  async find() {
    const page = this.page();
    try {
      this.status('connecting', `buscando el directo de ${page.name}…`);
      const q = new URLSearchParams({ broadcast_status: '["LIVE"]', fields: 'id,title', access_token: page.token });
      const res = await fetch(`${GRAPH()}/${this.ctx.settings.pageId}/live_videos?${q}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body?.error?.code === 190) return this.status('error', 'El permiso de Facebook venció: vuelve a conectar la cuenta');
        throw new Error(body?.error?.message || `HTTP ${res.status}`);
      }
      const video = body.data?.[0];
      if (!video) {
        this.status('waiting', `esperando el directo de ${page.name}`);
        return this.later(() => this.find(), 60000);
      }
      this.listen(video.id, page);
    } catch (e) {
      this.status('error', `Facebook: ${e.message}`);
      this.later(() => this.find(), 60000);
    }
  }

  listen(videoId, page) {
    this.videoId = videoId;
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    this.status('live', `${page.name} · comentarios y reacciones`);

    const comments = new URLSearchParams({ access_token: page.token, comment_rate: 'one_per_two_seconds', fields: 'from{name,id},message' });
    const reactions = new URLSearchParams({ access_token: page.token, fields: 'reaction_stream' });

    const onEnd = () => {
      if (abort.signal.aborted || this.stopped) return;
      abort.abort();
      // Se acabó el flujo: puede que el directo haya terminado. Se vuelve a buscar.
      this.later(() => this.find(), 10000);
    };
    readSSE(`${STREAM}/${videoId}/live_comments?${comments}`, abort.signal, (d) => {
      if (d?.message) this.emit({ type: 'chat', id: `fb-${d.id}`, user: d.from?.name || '', text: d.message });
    }).then(onEnd, onEnd);
    readSSE(`${STREAM}/${videoId}/live_reactions?${reactions}`, abort.signal, (d) => {
      const total = (d?.reaction_stream || []).reduce((n, r) => n + (Number(r.value) || 0), 0);
      if (total > 0) this.emit({ type: 'like', amount: total });
    }).catch(() => {});
  }

  close() {
    this.abort?.abort();
    this.abort = null;
  }
}

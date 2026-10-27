import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, toEvent as twitchEvent } from '../src/connectors/twitch.js';
import { parseVideoId, toEvent as youtubeEvent } from '../src/connectors/youtube.js';
import { giftEvent } from '../src/connectors/tiktok.js';
import { encryptJSON, decryptJSON } from '../../core/tokens.js';

test('Twitch: mensaje, bits, suscripción y raid', () => {
  const msg = parseLine('@badge-info=;display-name=Luna_TV;id=abc-1 :luna_tv!luna_tv@luna_tv.tmi.twitch.tv PRIVMSG #canal :hola Chispa');
  assert.deepEqual(twitchEvent(msg), { type: 'chat', id: 'tw-abc-1', user: 'Luna_TV', text: 'hola Chispa' });
  const bits = twitchEvent(parseLine('@bits=150;display-name=Beto;id=b2 :beto!beto@x PRIVMSG #canal :Cheer150 vamos'));
  assert.equal(bits.type, 'gift');
  assert.equal(bits.value, 150);
  assert.equal(twitchEvent(parseLine('@display-name=Caro;id=c3;msg-id=resub :tmi.twitch.tv USERNOTICE #canal :hola')).type, 'sub');
  assert.equal(twitchEvent(parseLine('@display-name=Dani;id=d4;msg-id=raid :tmi.twitch.tv USERNOTICE #canal')).type, 'join');
});

test('YouTube: enlaces de directo', () => {
  for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/live/dQw4w9WgXcQ?si=x', 'dQw4w9WgXcQ']) {
    assert.equal(parseVideoId(u), 'dQw4w9WgXcQ', u);
  }
  assert.equal(parseVideoId('https://www.youtube.com/@canal'), null);
});

test('YouTube: chat, Super Chat y membresía', () => {
  const base = { id: 'm1', authorDetails: { displayName: 'Ana' } };
  assert.deepEqual(youtubeEvent({ ...base, snippet: { type: 'textMessageEvent', displayMessage: 'hola' } }), { type: 'chat', id: 'yt-m1', user: 'Ana', text: 'hola' });
  const sc = youtubeEvent({ ...base, snippet: { type: 'superChatEvent', superChatDetails: { amountMicros: '150000000', amountDisplayString: 'MX$150.00' } } });
  assert.equal(sc.type, 'gift');
  assert.equal(sc.value, 150);
  assert.equal(sc.gift, 'MX$150.00');
  assert.equal(youtubeEvent({ ...base, snippet: { type: 'newSponsorEvent' } }).type, 'sub');
  assert.equal(youtubeEvent({ ...base, snippet: { type: 'messageDeletedEvent' } }), null);
});

test('TikTok: solo agradece al terminar la racha y usa diamantes como valor', () => {
  const d = { user: { nickname: 'Rulo', uniqueId: 'rulo77' }, common: { msgId: '9' }, gift: { type: 1, name: 'Rosa', diamondCount: 1 }, repeatCount: 7, repeatEnd: 0 };
  assert.equal(giftEvent(d), null);
  const end = giftEvent({ ...d, repeatEnd: 1 });
  assert.deepEqual(end, { type: 'gift', id: 'tt-9', user: 'Rulo', gift: 'Rosa', amount: 7, value: 7 });
  const lion = giftEvent({ user: { uniqueId: 'x' }, gift: { type: 2, name: 'León', diamondCount: 29999 }, repeatCount: 1 });
  assert.equal(lion.value, 29999);
});

test('tokens cifrados ida y vuelta', () => {
  process.env.TOKENS_KEY = Buffer.alloc(32, 7).toString('base64');
  const enc = encryptJSON({ access_token: 'secreto' });
  assert.ok(!enc.includes('secreto'));
  assert.deepEqual(decryptJSON(enc), { access_token: 'secreto' });
  const parts = enc.split('.');
  parts[3] = Buffer.from('otra cosa').toString('base64');
  assert.throws(() => decryptJSON(parts.join('.')));
});

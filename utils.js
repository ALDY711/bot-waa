// utils.js
// Fungsi-fungsi helper yang dipakai di banyak tempat.

const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

/**
 * Ambil teks body dari berbagai tipe pesan WhatsApp.
 * Baileys menyimpan teks di properti yang berbeda-beda tergantung tipe pesan.
 */
function getBodyText(msg) {
  if (!msg.message) return '';
  const m = msg.message;
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    ''
  );
}

/**
 * Download media dari pesan WhatsApp (gambar, video, audio, sticker, dokumen).
 * Mengembalikan { buffer, mimetype, mediaType } atau null jika bukan media.
 * Mendukung pesan langsung, quoted (reply), dan view once.
 */
async function downloadMedia(msg) {
  if (!msg.message) return null;

  // Key-key internal Baileys yang bukan tipe media sesungguhnya
  const SKIP_KEYS = ['messageContextInfo', 'senderKeyDistributionMessage'];

  let targetMsg = msg.message;
  let messageType = Object.keys(targetMsg).find((k) => !SKIP_KEYS.includes(k));

  // Jika quoted message (reply)
  if (messageType === 'extendedTextMessage' && targetMsg.extendedTextMessage?.contextInfo?.quotedMessage) {
    targetMsg = targetMsg.extendedTextMessage.contextInfo.quotedMessage;
    messageType = Object.keys(targetMsg).find((k) => !SKIP_KEYS.includes(k));
  }

  // Jika view once
  if (messageType === 'viewOnceMessage' || messageType === 'viewOnceMessageV2' || messageType === 'viewOnceMessageV2Extension') {
    targetMsg = targetMsg[messageType].message;
    messageType = Object.keys(targetMsg).find((k) => !SKIP_KEYS.includes(k));
  }

  const MEDIA_MAP = {
    imageMessage: 'image',
    videoMessage: 'video',
    audioMessage: 'audio',
    stickerMessage: 'sticker',
    documentMessage: 'document',
  };

  const mediaType = MEDIA_MAP[messageType];
  if (!mediaType) return null;

  const mediaMessage = targetMsg[messageType];

  const stream = await downloadContentFromMessage(mediaMessage, mediaType);
  let buffer = Buffer.from([]);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }

  return {
    buffer,
    mimetype: mediaMessage.mimetype || '',
    mediaType,
    caption: mediaMessage.caption || '',
    isAnimated: mediaMessage.isAnimated || false,
  };
}

/**
 * Format detik menjadi string "Xh Xm Xs" yang mudah dibaca.
 */
function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (h > 0) parts.push(`${h}j`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}d`);
  return parts.join(' ');
}

module.exports = { getBodyText, downloadMedia, formatUptime };

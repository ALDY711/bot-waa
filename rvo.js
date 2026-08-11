// rvo.js
// Anti View Once — otomatis menangkap pesan "sekali lihat" dan meneruskannya ke chat diri sendiri.
// Mendukung: viewOnceMessage, viewOnceMessageV2, viewOnceMessageV2Extension

const { downloadContentFromMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');
const config = require('./config');

/**
 * Ekstrak inner message dari berbagai wrapper view once.
 * WhatsApp terus mengubah format ini, jadi kita coba semua kemungkinan.
 */
function extractViewOnceContent(msg) {
  if (!msg.message) return null;

  const m = msg.message;

  // Key-key internal Baileys yang bukan tipe media
  const SKIP_KEYS = ['messageContextInfo', 'senderKeyDistributionMessage'];

  // Cari key utama (skip internal keys)
  const topKey = Object.keys(m).find((k) => !SKIP_KEYS.includes(k));
  if (!topKey) return null;

  // Cek apakah ini view once message
  const VIEW_ONCE_KEYS = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
  
  if (VIEW_ONCE_KEYS.includes(topKey)) {
    // Struktur: msg.message.viewOnceMessageV2.message.imageMessage
    const innerWrapper = m[topKey];
    const innerMessage = innerWrapper?.message;
    if (!innerMessage) return null;

    const innerKey = Object.keys(innerMessage).find((k) => !SKIP_KEYS.includes(k));
    if (!innerKey) return null;

    return {
      wrapperType: topKey,
      mediaType: innerKey,
      mediaMessage: innerMessage[innerKey],
    };
  }

  // Cek apakah media punya viewOnce flag (format alternatif di WA terbaru)
  // Beberapa versi WA mengirim sebagai imageMessage biasa tapi dengan field viewOnce: true
  const MEDIA_KEYS = ['imageMessage', 'videoMessage', 'audioMessage'];
  if (MEDIA_KEYS.includes(topKey) && m[topKey]?.viewOnce) {
    return {
      wrapperType: 'viewOnce-flag',
      mediaType: topKey,
      mediaMessage: m[topKey],
    };
  }

  return null;
}

async function handleRVO(sock, msg) {
  // Cek toggle dari config / runtime
  if (!config.rvoEnabled) return;

  try {
    const content = extractViewOnceContent(msg);
    if (!content) return; // Bukan view once, abaikan

    const { wrapperType, mediaType, mediaMessage } = content;

    const MEDIA_MAP = {
      imageMessage: 'image',
      videoMessage: 'video',
      audioMessage: 'audio',
    };

    const downloadType = MEDIA_MAP[mediaType];
    if (!downloadType) return;

    const selfJid = jidNormalizedUser(sock.user.id);
    const sender = msg.key.remoteJid;
    const isGroup = sender?.endsWith('@g.us');
    const participant = isGroup ? (msg.key.participant || sender) : sender;
    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

    // Cek apakah media punya data yang dibutuhkan untuk download
    if (!mediaMessage.url && !mediaMessage.directPath && !mediaMessage.mediaKey) {
      await sock.sendMessage(selfJid, {
        text: [
          '🔓 *View Once Terdeteksi* (gagal download)',
          `📱 Dari: ${participant?.split('@')[0] || 'unknown'}`,
          `💬 Sumber: ${isGroup ? 'Grup' : 'Private Chat'}`,
          `📝 Caption: ${mediaMessage.caption || '(tidak ada)'}`,
          `🕐 Waktu: ${now}`,
          `⚠️ Media tidak bisa di-download (media key tidak tersedia)`,
          `ℹ️ Wrapper: ${wrapperType}`,
        ].join('\n'),
      });
      return;
    }

    // Download media
    let buffer;
    try {
      const stream = await downloadContentFromMessage(mediaMessage, downloadType);
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      buffer = Buffer.concat(chunks);
    } catch (dlErr) {
      // Download gagal — beri tahu owner
      await sock.sendMessage(selfJid, {
        text: [
          '🔓 *View Once Terdeteksi* (download gagal)',
          `📱 Dari: ${participant?.split('@')[0] || 'unknown'}`,
          `💬 Sumber: ${isGroup ? 'Grup' : 'Private Chat'}`,
          `📝 Caption: ${mediaMessage.caption || '(tidak ada)'}`,
          `🕐 Waktu: ${now}`,
          `❌ Error: ${dlErr.message}`,
          `ℹ️ Type: ${mediaType} | Wrapper: ${wrapperType}`,
        ].join('\n'),
      });
      return;
    }

    if (!buffer || buffer.length === 0) {
      await sock.sendMessage(selfJid, {
        text: [
          '🔓 *View Once Terdeteksi* (buffer kosong)',
          `📱 Dari: ${participant?.split('@')[0] || 'unknown'}`,
          `⚠️ Media berhasil di-download tapi hasilnya kosong.`,
        ].join('\n'),
      });
      return;
    }

    const captionInfo = [
      '🔓 *Anti View Once (RVO)*',
      `📱 Dari: ${participant?.split('@')[0] || 'unknown'}`,
      `💬 Sumber: ${isGroup ? 'Grup' : 'Private Chat'}`,
      `📝 Caption: ${mediaMessage.caption || '(tidak ada)'}`,
      `🕐 Waktu: ${now}`,
    ].join('\n');

    // Kirim ke chat diri sendiri
    if (mediaType === 'imageMessage') {
      await sock.sendMessage(selfJid, { image: buffer, caption: captionInfo });
    } else if (mediaType === 'videoMessage') {
      await sock.sendMessage(selfJid, { video: buffer, caption: captionInfo });
    } else if (mediaType === 'audioMessage') {
      await sock.sendMessage(selfJid, {
        audio: buffer,
        mimetype: mediaMessage.mimetype || 'audio/ogg; codecs=opus',
        ptt: mediaMessage.ptt || false,
      });
      await sock.sendMessage(selfJid, { text: captionInfo });
    }

    console.log(`RVO berhasil: ${downloadType} dari ${participant?.split('@')[0]} (${wrapperType})`);
  } catch (err) {
    console.error('Error saat memproses RVO:', err);
    // Kirim notifikasi error ke diri sendiri agar owner tahu
    try {
      const selfJid = jidNormalizedUser(sock.user.id);
      await sock.sendMessage(selfJid, {
        text: `⚠️ *RVO Error*\n${err.message}\n\nStack: ${err.stack?.substring(0, 300)}`,
      });
    } catch { /* abaikan error saat mengirim notifikasi error */ }
  }
}

module.exports = { handleRVO };

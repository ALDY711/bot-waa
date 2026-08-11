// rvo.js
// Anti View Once (Manual) — Reply pesan "sekali lihat" dengan .rvo
// untuk menyimpannya ke Chat Diri Sendiri.

const { downloadContentFromMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');

/**
 * Ekstrak media dari view once message (termasuk dari quoted/reply).
 */
function extractViewOnceMedia(msg) {
  if (!msg.message) return null;

  const SKIP_KEYS = ['messageContextInfo', 'senderKeyDistributionMessage'];
  const VIEW_ONCE_KEYS = ['viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension'];
  const MEDIA_KEYS = ['imageMessage', 'videoMessage', 'audioMessage'];

  // Cek di quoted message (pesan yang di-reply)
  const contextInfo =
    msg.message.extendedTextMessage?.contextInfo ||
    msg.message.conversation?.contextInfo ||
    null;

  const quotedMsg = contextInfo?.quotedMessage;

  if (quotedMsg) {
    const quotedKey = Object.keys(quotedMsg).find((k) => !SKIP_KEYS.includes(k));

    // Cek apakah quoted message adalah view once
    if (quotedKey && VIEW_ONCE_KEYS.includes(quotedKey)) {
      const innerMessage = quotedMsg[quotedKey]?.message;
      if (innerMessage) {
        const innerKey = Object.keys(innerMessage).find((k) => !SKIP_KEYS.includes(k));
        if (innerKey && MEDIA_KEYS.includes(innerKey)) {
          return {
            mediaType: innerKey,
            mediaMessage: innerMessage[innerKey],
            source: 'quoted-viewonce',
          };
        }
      }
    }

    // Cek apakah quoted message adalah media biasa dengan viewOnce flag
    if (quotedKey && MEDIA_KEYS.includes(quotedKey) && quotedMsg[quotedKey]?.viewOnce) {
      return {
        mediaType: quotedKey,
        mediaMessage: quotedMsg[quotedKey],
        source: 'quoted-viewonce-flag',
      };
    }
  }

  // Cek di pesan langsung (bukan reply)
  const topKey = Object.keys(msg.message).find((k) => !SKIP_KEYS.includes(k));

  if (topKey && VIEW_ONCE_KEYS.includes(topKey)) {
    const innerMessage = msg.message[topKey]?.message;
    if (innerMessage) {
      const innerKey = Object.keys(innerMessage).find((k) => !SKIP_KEYS.includes(k));
      if (innerKey && MEDIA_KEYS.includes(innerKey)) {
        return {
          mediaType: innerKey,
          mediaMessage: innerMessage[innerKey],
          source: 'direct-viewonce',
        };
      }
    }
  }

  // Cek media biasa dengan viewOnce flag
  if (topKey && MEDIA_KEYS.includes(topKey) && msg.message[topKey]?.viewOnce) {
    return {
      mediaType: topKey,
      mediaMessage: msg.message[topKey],
      source: 'direct-viewonce-flag',
    };
  }

  return null;
}

/**
 * Handle command .rvo — reply pesan sekali lihat untuk disimpan ke Chat Diri Sendiri.
 */
async function handleRVO(sock, msg) {
  const jid = msg.key.remoteJid;

  try {
    const content = extractViewOnceMedia(msg);

    if (!content) {
      await sock.sendMessage(jid, {
        text: '❌ Reply pesan *sekali lihat* (foto/video) dengan *.rvo* untuk menyimpannya.',
      }, { quoted: msg });
      return;
    }

    const { mediaType, mediaMessage, source } = content;

    const MEDIA_MAP = {
      imageMessage: 'image',
      videoMessage: 'video',
      audioMessage: 'audio',
    };

    const downloadType = MEDIA_MAP[mediaType];
    if (!downloadType) {
      await sock.sendMessage(jid, {
        text: '❌ Tipe media tidak didukung.',
      }, { quoted: msg });
      return;
    }

    // Cek apakah media punya data yang dibutuhkan
    if (!mediaMessage.url && !mediaMessage.directPath && !mediaMessage.mediaKey) {
      await sock.sendMessage(jid, {
        text: '❌ Media tidak bisa di-download (data media tidak tersedia). Kemungkinan pesan sudah expired.',
      }, { quoted: msg });
      return;
    }

    await sock.sendMessage(jid, { text: '⏳ Sedang mengambil media...' }, { quoted: msg });

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
      await sock.sendMessage(jid, {
        text: `❌ Gagal download media: ${dlErr.message}`,
      }, { quoted: msg });
      return;
    }

    if (!buffer || buffer.length === 0) {
      await sock.sendMessage(jid, {
        text: '❌ Media berhasil di-download tapi hasilnya kosong.',
      }, { quoted: msg });
      return;
    }

    // Kirim ke Chat Diri Sendiri
    const selfJid = jidNormalizedUser(sock.user.id);
    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

    const isGroup = jid?.endsWith('@g.us');
    const captionInfo = [
      '🔓 *View Once Disimpan*',
      `📱 Dari chat: ${isGroup ? 'Grup' : 'Private'} (${jid?.split('@')[0]})`,
      `📝 Caption: ${mediaMessage.caption || '(tidak ada)'}`,
      `🕐 Waktu: ${now}`,
    ].join('\n');

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

    await sock.sendMessage(jid, {
      text: '✅ Media sekali lihat berhasil disimpan! Cek di *Chat Diri Sendiri*.',
    }, { quoted: msg });

    console.log(`RVO berhasil: ${downloadType} dari ${jid?.split('@')[0]} (${source})`);
  } catch (err) {
    console.error('Error saat memproses RVO:', err);
    await sock.sendMessage(jid, {
      text: `❌ Terjadi error: ${err.message}`,
    }, { quoted: msg });
  }
}

module.exports = { handleRVO };

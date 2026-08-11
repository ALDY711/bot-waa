// sticker.js
// Konversi gambar ↔ sticker WebP menggunakan sharp.

const sharp = require('sharp');
const { downloadMedia } = require('./utils');

/**
 * .sticker — Kirim atau reply gambar/video untuk dijadikan sticker.
 * Mengkonversi gambar ke format WebP 512x512 (standar sticker WhatsApp).
 */
async function handleSticker(sock, msg) {
  const jid = msg.key.remoteJid;

  try {
    const media = await downloadMedia(msg);

    if (!media || (media.mediaType !== 'image' && media.mediaType !== 'video')) {
      await sock.sendMessage(jid, {
        text: '❌ Kirim atau reply *gambar* dengan caption *.sticker* untuk membuat sticker.',
      }, { quoted: msg });
      return;
    }

    // Video sticker tidak didukung oleh sharp, hanya gambar
    if (media.mediaType === 'video') {
      await sock.sendMessage(jid, {
        text: '❌ Saat ini hanya mendukung konversi *gambar* ke sticker. Video belum didukung.',
      }, { quoted: msg });
      return;
    }

    await sock.sendMessage(jid, { text: '⏳ Membuat sticker...' }, { quoted: msg });

    const webpBuffer = await sharp(media.buffer)
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 80 })
      .toBuffer();

    await sock.sendMessage(jid, {
      sticker: webpBuffer,
    }, { quoted: msg });
  } catch (err) {
    console.error('Sticker error:', err);
    await sock.sendMessage(jid, { text: `❌ Gagal membuat sticker: ${err.message}` }, { quoted: msg });
  }
}

/**
 * .toimg — Reply sticker untuk dijadikan gambar PNG.
 */
async function handleToImg(sock, msg) {
  const jid = msg.key.remoteJid;

  try {
    const media = await downloadMedia(msg);

    if (!media || media.mediaType !== 'sticker') {
      await sock.sendMessage(jid, {
        text: '❌ Reply sebuah *sticker* dengan caption *.toimg* untuk mengubahnya ke gambar.',
      }, { quoted: msg });
      return;
    }

    if (media.isAnimated) {
      await sock.sendMessage(jid, {
        text: '❌ Sticker animasi belum didukung untuk dikonversi ke gambar.',
      }, { quoted: msg });
      return;
    }

    await sock.sendMessage(jid, { text: '⏳ Mengkonversi sticker ke gambar...' }, { quoted: msg });

    const pngBuffer = await sharp(media.buffer)
      .png()
      .toBuffer();

    await sock.sendMessage(jid, {
      image: pngBuffer,
      caption: '✅ Sticker berhasil dikonversi ke gambar!',
    }, { quoted: msg });
  } catch (err) {
    console.error('ToImg error:', err);
    await sock.sendMessage(jid, { text: `❌ Gagal mengkonversi sticker: ${err.message}` }, { quoted: msg });
  }
}

module.exports = { handleSticker, handleToImg };

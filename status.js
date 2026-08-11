// status.js
// Handler untuk command .statushd — upload status WhatsApp dengan kualitas HD.

const { downloadMedia } = require('./utils');

async function handleStatusHD(sock, msg, text) {
    const jid = msg.key.remoteJid;

    try {
        const media = await downloadMedia(msg);

        if (!media || (media.mediaType !== 'image' && media.mediaType !== 'video')) {
            await sock.sendMessage(jid, {
                text: '❌ Kirim atau reply *gambar/video* dengan caption *.statushd [caption]*',
            }, { quoted: msg });
            return;
        }

        await sock.sendMessage(jid, { text: '⏳ Sedang memproses upload status HD...' }, { quoted: msg });

        const content = media.mediaType === 'video'
            ? { video: media.buffer, caption: text || '' }
            : { image: media.buffer, caption: text || '' };

        await sock.sendMessage('status@broadcast', content);

        await sock.sendMessage(jid, { text: '✅ Status HD berhasil diupload!' }, { quoted: msg });
    } catch (err) {
        console.error('Error saat upload status HD:', err);
        await sock.sendMessage(jid, { text: '❌ Terjadi kesalahan saat mengupload status HD.' }, { quoted: msg });
    }
}

module.exports = { handleStatusHD };

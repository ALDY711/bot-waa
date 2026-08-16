const axios = require('axios');

const { generateWAMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');

// ...
async function handleTiktok(sock, jid, text, isHd = false) {
    if (!text) {
        return sock.sendMessage(jid, { text: '❌ Masukkan URL TikTok!\nContoh: *.tt https://vt.tiktok.com/xxxxxx*\nUntuk HD: *.tthd https://vt.tiktok.com/xxxxxx*' });
    }

    const args = text.trim().split(/\s+/);
    let url = args.find(a => a.startsWith('http'));

    if (!url) {
         return sock.sendMessage(jid, { text: '❌ URL TikTok tidak ditemukan dalam pesan.' });
    }

    try {
        await sock.sendMessage(jid, { text: `⏳ Sedang mengambil data TikTok${isHd ? ' (Mode HD)' : ''} dari API Anda...` });
        
        const response = await axios.get('https://api-anime-production-0c19.up.railway.app/tiktok/all', {
            params: {
                url: url
            }
        });

        const data = response.data;
        if (!data.success) {
            return sock.sendMessage(jid, { text: `❌ Gagal mengambil data: ${data.message || 'Video tidak ditemukan.'}` });
        }

        const result = data.data;
        const title = result.caption || 'TikTok Video';
        const author = result.author || 'Unknown';
        
        // Handle Photo Slide (Menggunakan mode Album normal)
        if (result.images && result.images.length > 0) {
            await sock.sendMessage(jid, { text: `📸 Ditemukan ${result.images.length} foto. Mengirim sebagai Album...` });
            
            for (let i = 0; i < result.images.length; i++) {
                await sock.sendMessage(jid, {
                    image: { url: result.images[i] },
                    caption: `Foto ${i + 1}/${result.images.length}\n${title}`
                });
            }

            // Kirim audionya juga jika ada
            if (result.audio) {
                await sock.sendMessage(jid, {
                    audio: { url: result.audio },
                    mimetype: 'audio/mp4',
                });
            }
            return;
        }

        // Pilih URL video
        let videoUrl = result.video;
        let isActuallyHd = false;
        
        if (isHd && result.videoHD) {
            videoUrl = result.videoHD;
            isActuallyHd = true;
        }

        if (!videoUrl) {
             return sock.sendMessage(jid, { text: `❌ Link media tidak ditemukan di respon API Anda.` });
        }

        let caption = `🎵 *${title}*\n`;
        caption += `👤 Author: ${author}\n`;
        if (isActuallyHd) {
            caption += `\n✨ Resolusi HD`;
        }

        await sock.sendMessage(jid, {
            video: { url: videoUrl },
            caption: caption
        });

    } catch (err) {
        console.error('TikTok downloader error:', err);
        await sock.sendMessage(jid, { text: `❌ Terjadi kesalahan: ${err.message}` });
    }
}

module.exports = { handleTiktok };

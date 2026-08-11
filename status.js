const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

async function handleStatusHD(sock, msg, text) {
    try {
        const jid = msg.key.remoteJid;
        
        // Cek apakah pesan adalah media atau membalas (reply) media
        let messageType = Object.keys(msg.message)[0];
        let mediaMessage = msg.message[messageType];
        let type = messageType;

        if (messageType === 'extendedTextMessage' && msg.message.extendedTextMessage.contextInfo?.quotedMessage) {
            const quoted = msg.message.extendedTextMessage.contextInfo.quotedMessage;
            const quotedType = Object.keys(quoted)[0];
            mediaMessage = quoted[quotedType];
            type = quotedType;
        }

        if (type !== 'imageMessage' && type !== 'videoMessage') {
            await sock.sendMessage(jid, { text: 'Gagal: Kirim atau reply gambar/video dengan command .statushd' }, { quoted: msg });
            return;
        }

        await sock.sendMessage(jid, { text: 'Sedang memproses upload status HD...' }, { quoted: msg });

        // Download media
        const stream = await downloadContentFromMessage(mediaMessage, type === 'imageMessage' ? 'image' : 'video');
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        const isVideo = type === 'videoMessage';
        
        // Mempersiapkan konten untuk status
        const content = isVideo 
            ? { video: buffer, caption: text || '' } 
            : { image: buffer, caption: text || '' };

        // Mengambil daftar kontak untuk melihat status (opsional, tapi disarankan oleh Baileys)
        // Jika bot ini tidak menyimpan kontak, maka default ke broadcast umum
        // Jika perlu spesifik, bisa diatur lewat statusJidList
        // Saat ini mengirim ke 'status@broadcast' dengan buffer asli untuk menjaga kualitas HD
        
        await sock.sendMessage('status@broadcast', content);

        await sock.sendMessage(jid, { text: '✅ Status HD berhasil diupload!' }, { quoted: msg });
    } catch (err) {
        console.error('Error saat upload status HD:', err);
        await sock.sendMessage(msg.key.remoteJid, { text: '❌ Terjadi kesalahan saat mengupload status HD.' }, { quoted: msg });
    }
}

module.exports = { handleStatusHD };

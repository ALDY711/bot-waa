// rvo.js
// Anti View Once — otomatis menangkap pesan "sekali lihat" dan meneruskannya ke chat diri sendiri.

const { jidNormalizedUser } = require('@whiskeysockets/baileys');
const { downloadMedia } = require('./utils');
const config = require('./config');

async function handleRVO(sock, msg) {
    // Cek toggle dari config
    if (!config.rvoEnabled) return;

    try {
        if (!msg.message) return;

        // Key-key internal Baileys yang bukan tipe media
        const SKIP_KEYS = ['messageContextInfo', 'senderKeyDistributionMessage'];
        const messageType = Object.keys(msg.message).find((k) => !SKIP_KEYS.includes(k));

        // Mendukung beberapa variasi view once
        const isViewOnce = (
            messageType === 'viewOnceMessage' ||
            messageType === 'viewOnceMessageV2' ||
            messageType === 'viewOnceMessageV2Extension'
        );

        if (!isViewOnce) return;

        const viewOnceMessage = msg.message[messageType].message;
        if (!viewOnceMessage) return;

        const innerType = Object.keys(viewOnceMessage).find((k) => !SKIP_KEYS.includes(k));
        const mediaMessage = viewOnceMessage[innerType];
        if (!mediaMessage) return;

        const MEDIA_MAP = {
            imageMessage: 'image',
            videoMessage: 'video',
            audioMessage: 'audio',
        };

        const type = MEDIA_MAP[innerType];
        if (!type) return;

        // Download media menggunakan Baileys stream
        const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
        const stream = await downloadContentFromMessage(mediaMessage, type);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        const sender = msg.key.remoteJid;
        const isGroup = sender.endsWith('@g.us');
        const participant = isGroup ? (msg.key.participant || sender) : sender;
        const selfJid = jidNormalizedUser(sock.user.id);

        const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

        const captionInfo = [
            '🔓 *Anti View Once (RVO)*',
            `📱 Dari: ${participant.split('@')[0]}`,
            `💬 Sumber: ${isGroup ? 'Grup' : 'Private Chat'}`,
            `📝 Caption: ${mediaMessage.caption || '(tidak ada)'}`,
            `🕐 Waktu: ${now}`,
        ].join('\n');

        // Kirim ke chat diri sendiri
        if (innerType === 'imageMessage') {
            await sock.sendMessage(selfJid, { image: buffer, caption: captionInfo });
        } else if (innerType === 'videoMessage') {
            await sock.sendMessage(selfJid, { video: buffer, caption: captionInfo });
        } else if (innerType === 'audioMessage') {
            await sock.sendMessage(selfJid, {
                audio: buffer,
                mimetype: mediaMessage.mimetype || 'audio/ogg; codecs=opus',
                ptt: mediaMessage.ptt || false,
            });
            // Kirim info terpisah karena audio tidak bisa punya caption
            await sock.sendMessage(selfJid, { text: captionInfo });
        }
    } catch (err) {
        console.error('Error saat memproses RVO:', err);
    }
}

module.exports = { handleRVO };

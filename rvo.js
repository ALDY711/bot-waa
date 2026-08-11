const { downloadContentFromMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');

async function handleRVO(sock, msg) {
    try {
        if (!msg.message) return;
        
        const messageType = Object.keys(msg.message)[0];
        
        // Mendukung beberapa variasi view once
        const isViewOnce = (
            messageType === 'viewOnceMessage' || 
            messageType === 'viewOnceMessageV2' || 
            messageType === 'viewOnceMessageV2Extension'
        );

        if (!isViewOnce) return;

        const viewOnceMessage = msg.message[messageType].message;
        const innerType = Object.keys(viewOnceMessage)[0];
        const mediaMessage = viewOnceMessage[innerType];

        let type = '';
        if (innerType === 'imageMessage') type = 'image';
        else if (innerType === 'videoMessage') type = 'video';
        else if (innerType === 'audioMessage') type = 'audio';
        else return;

        // Download media
        const stream = await downloadContentFromMessage(mediaMessage, type);
        let buffer = Buffer.from([]);
        for await (const chunk of stream) {
            buffer = Buffer.concat([buffer, chunk]);
        }

        const sender = msg.key.remoteJid;
        const isGroup = sender.endsWith('@g.us');
        const participant = isGroup ? msg.key.participant : sender;
        const selfJid = jidNormalizedUser(sock.user.id);
        
        const captionInfo = `*Anti View Once (RVO)*\nDari: ${participant.split('@')[0]}\nSumber: ${isGroup ? 'Grup' : 'Private Chat'}\nCaption Asli: ${mediaMessage.caption || '(tidak ada)'}`;

        // Kirim ke nomor diri sendiri
        if (innerType === 'imageMessage') {
            await sock.sendMessage(selfJid, { image: buffer, caption: captionInfo });
        } else if (innerType === 'videoMessage') {
            await sock.sendMessage(selfJid, { video: buffer, caption: captionInfo });
        } else if (innerType === 'audioMessage') {
            await sock.sendMessage(selfJid, { audio: buffer, mimetype: mediaMessage.mimetype, ptt: mediaMessage.ptt || false });
        }
    } catch (err) {
        console.error('Error saat memproses RVO:', err);
    }
}

module.exports = { handleRVO };

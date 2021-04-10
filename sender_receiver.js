const { codecs } = RTCRtpSender.getCapabilities('video');
const antMediaVP8 = codecs.find(c => c.mimeType === 'video/VP8' && c.sdpFmtpLine === undefined);
const antMediaH264 = codecs.find(c => c.mimeType === 'video/H264' && c.sdpFmtpLine === 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f');
txtSignalingUrl.value = location.search.substr(1);
let codec = null;
let p = null;
let pSnd = null;
let pRcv = null;
let prevBytes = 0;
let tid = 0;
let stream = null;
let ws = new WebSocket(txtSignalingUrl.value);
const send = (command, data = {}) => {
    console.log(`send ${command}`);
    ws.send(JSON.stringify({
        command, streamId: 'testStream',
        type: data?.type, sdp: data?.sdp,
        candidate: data?.candidate, label: data?.sdpMLineIndex, id: data?.sdpMid
    }));
};
const createPeer = (cb = _ => { }) => {
    p = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    p.onicecandidate = evt => evt.candidate && send('takeCandidate', evt.candidate);
    p.onconnectionstatechange = function () { this.connectionState === 'connected' && cb() };
    p.ontrack = evt => vidReceiver.srcObject = evt.streams[0];
    return p;
};
ws.onmessage = async evt => {
    const msg = JSON.parse(evt.data);
    if (msg.command === 'start') {
        stream = vidSender.captureStream();
        const track = stream.getVideoTracks()[0];
        pSnd = createPeer(_ => {
            tid = setInterval(async _ => {
                const stats = [...await pSnd.getStats(track)];
                const codecStats = stats.find(x => x[0].startsWith('RTCCodec'))[1];
                const outboundStats = stats.find(x => x[0].startsWith('RTCOutboundRTPVideoStream'))[1];
                const bytes = outboundStats.bytesSent;
                streamingCodec.textContent = codecStats.mimeType;
                videoSize.textContent = `${outboundStats.frameWidth}x${outboundStats.frameHeight}`;
                bitRate.textContent = `${(((bytes - prevBytes) * 8) / 1024) | 0} Kbps`;
                prevBytes = bytes;
            }, 1000);
            pRcv = createPeer();
            setTimeout(send.bind(null, 'play'), 3000);
        });
        pSnd.addTrack(stream.getVideoTracks()[0], stream);
        pSnd.getTransceivers()[0].setCodecPreferences([codec]);
        await pSnd.setLocalDescription(await pSnd.createOffer());
        send('takeConfiguration', pSnd.localDescription);
    } else if (msg.type) {
        await p.setRemoteDescription(msg);
        if (msg.type === 'offer') {
            await p.setLocalDescription(await p.createAnswer());
            send('takeConfiguration', p.localDescription);
        }
    } else if (msg.candidate) {
        p.addIceCandidate({ candidate: msg.candidate, sdpMLineIndex: msg.label, sdpMid: msg.id });
    }
};
btnVP8.onclick = evt => { codec = antMediaVP8; send('publish'); };
btnH264.onclick = evt => { codec = antMediaH264; send('publish'); };
btnClose.onclick = evt => {
    window.ws?.close();
    pSnd?.close();
    pRcv?.close();
    tid && clearInterval(tid);
    vidReceiver.pause();
    vidReceiver.srcObject = null;
    vidReceiver.src = '';
    vidReceiver.load();
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
};

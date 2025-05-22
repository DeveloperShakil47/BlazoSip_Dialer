let ua;
let session;
let remoteAudio;
let dotNetRef; // <-- store the .NET object reference

window.initializeJsSip = (sipConfig) => {
    remoteAudio = document.getElementById('remoteAudio');
    dotNetRef = sipConfig.dotNetRef; // <-- get the .NET reference from Blazor

    const socket = new JsSIP.WebSocketInterface(sipConfig.websocket);
    const configuration = {
        sockets: [socket],
        uri: `sip:${sipConfig.extension}@${sipConfig.domain}`,
        password: sipConfig.password,
        session_timers: false
    };

    ua = new JsSIP.UA(configuration);

    ua.on('registered', () => {
        console.log("✅ Registered");
        dotNetRef.invokeMethodAsync('OnRegistered');
    });

    ua.on('registrationFailed', (e) => {
        console.log("❌ Registration failed:", e.cause);
        dotNetRef.invokeMethodAsync('OnRegistrationFailed', e.cause);
    });

    ua.on('newRTCSession', function (data) {
        const session = data.session;

        if (data.originator === 'remote') {
            window.jssipSession = session; // 🔥 Critical!

            DotNet.invokeMethodAsync('BlazoSip', 'OnIncomingCall', session.remote_identity.uri.user);
        }

        session.on('peerconnection', function (e) {
            const remoteAudio = document.getElementById('remoteAudio');

            e.peerconnection.addEventListener('track', function (event) {
                if (remoteAudio) {
                    remoteAudio.srcObject = event.streams[0];
                    remoteAudio.play();
                }
            });
        });

        session.on('ended', () => {
            if (remoteAudio) remoteAudio.srcObject = null;
            DotNet.invokeMethodAsync('BlazoSip', 'OnCallEnded');
        });

        session.on('failed', () => {
            if (remoteAudio) remoteAudio.srcObject = null;
            DotNet.invokeMethodAsync('BlazoSip', 'OnCallFailed');
        });

        session.on('confirmed', () => {
            DotNet.invokeMethodAsync('BlazoSip', 'OnCallConfirmed');
        });
    });

    ua.start();
};

window.makeCall = (target) => {
    if (!ua) return;

    const domain = ua.configuration.uri.toString().split('@')[1];
    session = ua.call(`sip:${target}@${domain}`, {
        mediaConstraints: { audio: true, video: false }
    });

    session.connection.addEventListener('track', (event) => {
        remoteAudio.srcObject = event.streams[0];
    });
};

window.hangUp = () => {
    if (session) {
        session.terminate();
        session = null;
    }
};

window.toggleMute = () => {
    if (session) {
        const pc = session.connection;
        pc.getSenders().forEach(sender => {
            if (sender.track.kind === 'audio') {
                sender.track.enabled = !sender.track.enabled;
            }
        });
    }
};
window.sipInterop = {
    answerCall: function () {
        if (window.jssipSession) {
            // Hook into peerconnection event safely
            window.jssipSession.on('peerconnection', function (data) {
                const pc = data.peerconnection;

                // Wrap setRemoteDescription to filter G726-32
                const originalSetRemoteDescription = pc.setRemoteDescription.bind(pc);
                pc.setRemoteDescription = function (desc) {
                    desc.sdp = desc.sdp.split('\n').filter(line => !line.includes('G726')).join('\n');
                    return originalSetRemoteDescription(desc);
                };
            });

            window.jssipSession.answer({
                mediaConstraints: { audio: true, video: false }
            });
        }
    },
    rejectCall: function () {
        if (window.jssipSession) {
            window.jssipSession.terminate();
        }
    }
};
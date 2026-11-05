/* ==========================================================================
   Beats Workspace — WebRTC 1:1 calls (signaling via Supabase Realtime broadcast)
   ========================================================================== */

const Calls = (function () {
  const ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // Public free TURN fallback (Metered Open Relay). May be rate-limited / change.
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ];

  let sb = null;
  let myId = null;
  let myName = "";
  let signalCh = null;
  let pc = null;
  let localStream = null;
  let remoteStream = null;
  let facingMode = "user";
  let state = "idle"; // idle | ringing-out | ringing-in | connecting | in-call
  let call = null; // { id, peerId, peerName, video, role: 'caller'|'callee' }
  let listeners = [];
  let callTimer = null;
  let callStartedAt = null;
  let pendingOffer = null;
  let pendingIce = [];
  let makingOffer = false;
  let ignoreOffer = false;
  let polite = false;

  function emit(event, data) {
    listeners.forEach((fn) => {
      try {
        fn(event, data);
      } catch (e) {
        console.warn("Calls listener error", e);
      }
    });
  }

  function on(fn) {
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((x) => x !== fn);
    };
  }

  function getState() {
    return {
      state,
      call: call ? { ...call } : null,
      connectionState: pc ? pc.connectionState : null,
      iceConnectionState: pc ? pc.iceConnectionState : null,
      localStream,
      remoteStream,
      muted: localStream ? !localStream.getAudioTracks().some((t) => t.enabled) : false,
      cameraOff: localStream ? !localStream.getVideoTracks().some((t) => t.enabled) : false,
      elapsedMs: callStartedAt ? Date.now() - callStartedAt : 0,
    };
  }

  async function init(client, userId, displayName) {
    await teardown();
    sb = client;
    myId = userId;
    myName = displayName || "Nutzer";
    signalCh = sb.channel("workspace-calls", {
      config: { broadcast: { ack: true, self: false } },
    });
    signalCh.on("broadcast", { event: "signal" }, ({ payload }) => {
      if (!payload || payload.to !== myId) return;
      handleSignal(payload).catch((e) => console.warn("signal handle", e));
    });
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Signaling subscribe timeout")), 12000);
      signalCh.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          clearTimeout(t);
          resolve();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(t);
          reject(new Error("Signaling fehlgeschlagen"));
        }
      });
    });
    emit("ready", { userId: myId });
  }

  async function sendTo(peerId, payload) {
    if (!signalCh) throw new Error("Kein Signaling");
    const { error } = await signalCh.send({
      type: "broadcast",
      event: "signal",
      payload: { ...payload, from: myId, to: peerId, fromName: myName },
    });
    if (error) throw error;
  }

  async function closePeerSend() {
    /* shared channel — nothing to close per peer */
  }

  async function getMedia(video) {
    const constraints = {
      audio: true,
      video: video
        ? {
            facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        : false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return stream;
  }

  function ensurePc() {
    if (pc) return pc;
    pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    remoteStream = new MediaStream();
    pc.onicecandidate = (ev) => {
      if (ev.candidate && call) {
        sendTo(call.peerId, {
          type: "ice",
          callId: call.id,
          candidate: ev.candidate.toJSON(),
        }).catch(() => {});
      }
    };
    pc.ontrack = (ev) => {
      ev.streams[0].getTracks().forEach((t) => {
        if (!remoteStream.getTracks().some((x) => x.id === t.id)) {
          remoteStream.addTrack(t);
        }
      });
      emit("remote-stream", { stream: remoteStream });
    };
    pc.onconnectionstatechange = () => {
      emit("connection", { state: pc.connectionState });
      if (pc.connectionState === "connected") {
        if (state !== "in-call") {
          state = "in-call";
          callStartedAt = Date.now();
          emit("in-call", getState());
        }
      }
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        // keep UI; hangup is explicit
        emit("connection", { state: pc.connectionState });
      }
      if (pc.connectionState === "closed") {
        /* noop */
      }
    };
    return pc;
  }

  async function attachLocal(video) {
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
    localStream = await getMedia(video);
    const peer = ensurePc();
    localStream.getTracks().forEach((track) => {
      peer.addTrack(track, localStream);
    });
    emit("local-stream", { stream: localStream });
  }

  function newCallId() {
    return "c_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }

  async function startCall(peerId, peerName, video) {
    if (state !== "idle") {
      emit("error", { message: "Es laeuft bereits ein Anruf." });
      return;
    }
    if (!peerId || peerId === myId) return;
    call = {
      id: newCallId(),
      peerId,
      peerName: peerName || "Nutzer",
      video: !!video,
      role: "caller",
    };
    polite = false;
    state = "ringing-out";
    emit("ringing-out", getState());
    try {
      await attachLocal(!!video);
      await sendTo(peerId, {
        type: "ring",
        callId: call.id,
        video: !!video,
        fromName: myName,
      });
    } catch (e) {
      emit("error", { message: e.message || "Mikrofon/Kamera nicht verfuegbar." });
      await hangup(false);
    }
  }

  async function accept() {
    if (state !== "ringing-in" || !call) return;
    try {
      if (navigator.vibrate) navigator.vibrate(0);
      state = "connecting";
      emit("connecting", getState());
      await attachLocal(!!call.video);
      await sendTo(call.peerId, { type: "accept", callId: call.id });
      // If offer already arrived, answer it
      if (pendingOffer) {
        const offer = pendingOffer;
        pendingOffer = null;
        await applyRemoteOffer(offer);
      }
    } catch (e) {
      emit("error", { message: e.message || "Anruf konnte nicht angenommen werden." });
      await decline();
    }
  }

  async function decline() {
    if (!call) {
      resetLocal();
      return;
    }
    const peerId = call.peerId;
    const callId = call.id;
    await sendTo(peerId, { type: "decline", callId }).catch(() => {});
    resetLocal();
    emit("ended", { reason: "declined" });
  }

  async function hangup(notify) {
    if (call && notify !== false) {
      await sendTo(call.peerId, { type: "hangup", callId: call.id }).catch(() => {});
    }
    resetLocal();
    emit("ended", { reason: "hangup" });
  }

  function resetLocal() {
    closePeerSend().catch(() => {});
    if (navigator.vibrate) navigator.vibrate(0);
    if (callTimer) {
      clearInterval(callTimer);
      callTimer = null;
    }
    callStartedAt = null;
    pendingOffer = null;
    pendingIce = [];
    makingOffer = false;
    ignoreOffer = false;
    if (pc) {
      try {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch (_) {}
      pc = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
    remoteStream = null;
    call = null;
    state = "idle";
  }

  function waitIceComplete(peer) {
    if (peer.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (peer.iceGatheringState === "complete") {
          peer.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      };
      peer.addEventListener("icegatheringstatechange", check);
      // safety timeout — send whatever we have
      setTimeout(() => {
        peer.removeEventListener("icegatheringstatechange", check);
        resolve();
      }, 2500);
    });
  }

  async function flushPendingIce() {
    const peer = pc;
    if (!peer || !peer.remoteDescription) return;
    const queued = pendingIce.splice(0, pendingIce.length);
    for (const c of queued) {
      try {
        await peer.addIceCandidate(c);
      } catch (e) {
        console.warn("ICE flush failed", e);
      }
    }
  }

  async function applyRemoteOffer(sdp) {
    const peer = ensurePc();
    await peer.setRemoteDescription(sdp);
    await flushPendingIce();
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    await waitIceComplete(peer);
    await sendTo(call.peerId, {
      type: "answer",
      callId: call.id,
      sdp: peer.localDescription,
    });
  }

  async function createAndSendOffer() {
    const peer = ensurePc();
    makingOffer = true;
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await waitIceComplete(peer);
      await sendTo(call.peerId, {
        type: "offer",
        callId: call.id,
        sdp: peer.localDescription,
      });
    } finally {
      makingOffer = false;
    }
  }

  async function handleSignal(msg) {
    if (!msg || !msg.type) return;
    if (msg.to && msg.to !== myId) return;

    if (msg.type === "ring") {
      if (state !== "idle") {
        await sendTo(msg.from, { type: "busy", callId: msg.callId });
        return;
      }
      call = {
        id: msg.callId,
        peerId: msg.from,
        peerName: msg.fromName || "Nutzer",
        video: !!msg.video,
        role: "callee",
      };
      polite = true;
      state = "ringing-in";
      try {
        if (navigator.vibrate && navigator.userActivation && navigator.userActivation.isActive) {
          navigator.vibrate([200, 100, 200, 100, 200]);
        }
      } catch (_) {}
      emit("ringing-in", getState());
      return;
    }

    if (!call || (msg.callId && msg.callId !== call.id)) {
      // Ignore signals for other/old calls except hangup matching nothing
      return;
    }

    if (msg.type === "busy") {
      emit("error", { message: "Besetzt — die andere Person telefoniert gerade." });
      resetLocal();
      emit("ended", { reason: "busy" });
      return;
    }

    if (msg.type === "decline") {
      resetLocal();
      emit("ended", { reason: "declined" });
      return;
    }

    if (msg.type === "hangup") {
      resetLocal();
      emit("ended", { reason: "remote-hangup" });
      return;
    }

    if (msg.type === "accept") {
      if (call.role !== "caller") return;
      state = "connecting";
      emit("connecting", getState());
      await createAndSendOffer();
      return;
    }

    if (msg.type === "offer") {
      if (state === "ringing-in") {
        // Offer before accept — stash
        pendingOffer = msg.sdp;
        return;
      }
      await applyRemoteOffer(msg.sdp);
      return;
    }

    if (msg.type === "answer") {
      if (!pc) return;
      await pc.setRemoteDescription(msg.sdp);
      await flushPendingIce();
      return;
    }

    if (msg.type === "ice") {
      if (!msg.candidate) return;
      if (!pc || !pc.remoteDescription) {
        pendingIce.push(msg.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(msg.candidate);
      } catch (e) {
        if (!ignoreOffer) console.warn("ICE add failed", e);
      }
      return;
    }
  }

  function toggleMute() {
    if (!localStream) return false;
    localStream.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    const muted = !localStream.getAudioTracks().some((t) => t.enabled);
    emit("controls", getState());
    return muted;
  }

  function toggleCamera() {
    if (!localStream) return false;
    localStream.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    const off = !localStream.getVideoTracks().some((t) => t.enabled);
    emit("controls", getState());
    return off;
  }

  async function switchCamera() {
    if (!call || !call.video || !pc || !localStream) return;
    facingMode = facingMode === "user" ? "environment" : "user";
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: facingMode } },
      });
      const newTrack = newStream.getVideoTracks()[0];
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === "video");
      if (sender) await sender.replaceTrack(newTrack);
      localStream.getVideoTracks().forEach((t) => {
        localStream.removeTrack(t);
        t.stop();
      });
      localStream.addTrack(newTrack);
      emit("local-stream", { stream: localStream });
    } catch (e) {
      emit("error", { message: "Kamerawechsel nicht moeglich." });
      facingMode = facingMode === "user" ? "environment" : "user";
    }
  }

  async function teardown() {
    resetLocal();
    if (signalCh && sb) {
      try {
        await sb.removeChannel(signalCh);
      } catch (_) {}
    }
    signalCh = null;
    myId = null;
  }

  // Test helpers
  function __debug() {
    return {
      ...getState(),
      pc,
      hasRemoteVideo: !!(remoteStream && remoteStream.getVideoTracks().length),
      hasRemoteAudio: !!(remoteStream && remoteStream.getAudioTracks().length),
      remoteTrackCount: remoteStream ? remoteStream.getTracks().length : 0,
    };
  }

  return {
    init,
    teardown,
    on,
    startCall,
    accept,
    decline,
    hangup,
    toggleMute,
    toggleCamera,
    switchCamera,
    getState,
    __debug,
  };
})();

window.Calls = Calls;

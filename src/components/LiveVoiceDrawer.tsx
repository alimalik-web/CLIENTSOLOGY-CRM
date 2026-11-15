import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send, Volume2, X } from 'lucide-react';

interface TranscriptLine {
  id: string;
  speaker: 'You' | 'Strategist';
  text: string;
}

interface Props {
  open: boolean;
  crmContextSummary: string;
  onClose: () => void;
}

function pcmFloat32ToBase64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToPcmFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const evenLen = binary.length - (binary.length % 2);
  const bytes = new Uint8Array(evenLen);
  for (let i = 0; i < evenLen; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}

export const LiveVoiceDrawer: React.FC<Props> = ({ open, crmContextSummary, onClose }) => {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [statusMsg, setStatusMsg] = useState('Ready to start live voice session.');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptLine[]>([]);
  const [textInput, setTextInput] = useState('');

  const openRef = useRef(open);
  openRef.current = open;
  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const stopAllAudioAndSocket = () => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        // Ignore already stopped
      }
    });
    activeSourcesRef.current = [];
    nextStartTimeRef.current = 0;

    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
    setConnecting(false);
    setMicActive(false);
  };

  useEffect(() => {
    if (!open) {
      stopAllAudioAndSocket();
    }
    return () => {
      stopAllAudioAndSocket();
    };
  }, [open]);

  const schedulePlaybackChunk = (base64Audio: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const float32 = base64ToPcmFloat32(base64Audio);
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, nextStartTimeRef.current);
    src.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;
    activeSourcesRef.current.push(src);
    src.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== src);
    };
  };

  const handleStartSession = async () => {
    if (connecting || connected) return;
    setConnecting(true);
    setErrorMsg(null);
    setStatusMsg('Connecting to Gemini Live Voice...');
    try {
      let inputCtx: AudioContext;
      let outputCtx: AudioContext;
      try {
        inputCtx = new AudioContext({ sampleRate: 16000 });
        outputCtx = new AudioContext({ sampleRate: 24000 });
      } catch {
        inputCtx = new AudioContext();
        outputCtx = new AudioContext();
      }
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!openRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        stopAllAudioAndSocket();
        return;
      }
      streamRef.current = stream;

      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/api/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!openRef.current) {
          stopAllAudioAndSocket();
          return;
        }
        ws.send(JSON.stringify({ type: 'init', crmSummary: crmContextSummary }));
        setConnecting(false);
        setConnected(true);
        setStatusMsg('Connected — speak naturally with your CRM Voice Strategist.');

        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        source.connect(processor);
        processor.connect(inputCtx.destination);

        setMicActive(true);
        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const b64 = pcmFloat32ToBase64(e.inputBuffer.getChannelData(0));
          ws.send(JSON.stringify({ audio: b64 }));
        };
      };

      ws.onmessage = (event) => {
        let msg: {
          ready?: boolean;
          audio?: string;
          interrupted?: boolean;
          inputTranscript?: string;
          outputTranscript?: string;
          error?: string;
        };
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.error) {
          setErrorMsg(msg.error);
          setStatusMsg('Session error');
          return;
        }
        if (msg.interrupted) {
          activeSourcesRef.current.forEach((s) => {
            try {
              s.stop();
            } catch {}
          });
          activeSourcesRef.current = [];
          nextStartTimeRef.current = 0;
        }
        if (msg.audio) {
          schedulePlaybackChunk(msg.audio);
        }
        if (msg.inputTranscript) {
          setTranscripts((prev) => [
            ...prev.slice(-18),
            { id: `in-${Date.now()}-${Math.random()}`, speaker: 'You', text: msg.inputTranscript! },
          ]);
        }
        if (msg.outputTranscript) {
          setTranscripts((prev) => [
            ...prev.slice(-18),
            {
              id: `out-${Date.now()}-${Math.random()}`,
              speaker: 'Strategist',
              text: msg.outputTranscript!,
            },
          ]);
        }
      };

      ws.onerror = () => {
        setConnecting(false);
        setErrorMsg('WebSocket connection error.');
      };

      ws.onclose = () => {
        setConnecting(false);
        setConnected(false);
        setMicActive(false);
        setStatusMsg('Voice session ended.');
      };
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Microphone or Live Audio setup failed.');
      stopAllAudioAndSocket();
    }
  };

  const handleSendTextPrompt = () => {
    if (!textInput.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ text: textInput.trim() }));
    setTranscripts((prev) => [
      ...prev.slice(-18),
      { id: `txt-${Date.now()}`, speaker: 'You', text: textInput.trim() },
    ]);
    setTextInput('');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-[#111214] text-white border-l border-[#26282E] flex flex-col shadow-2xl">
      <div className="px-5 py-4 border-b border-[#26282E] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#D9F154] text-[#111214] flex items-center justify-center">
            <Volume2 className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-display font-bold">CRM Live Voice Strategist</h2>
            <p className="text-[11px] text-[#9A9FA8]">{statusMsg}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-[#9A9FA8] hover:text-white cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 border-b border-[#26282E] space-y-3">
        <div className="flex items-center gap-2.5">
          {!connected ? (
            <button
              type="button"
              disabled={connecting}
              onClick={handleStartSession}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#D9F154] text-[#111214] text-xs font-bold flex items-center justify-center gap-2 hover:bg-[#e5f876] cursor-pointer disabled:opacity-60"
            >
              <Mic className="w-4 h-4" />
              {connecting ? 'Connecting Voice...' : 'Start Live Voice Session'}
            </button>
          ) : (
            <button
              type="button"
              onClick={stopAllAudioAndSocket}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#FF786C] text-[#111214] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <MicOff className="w-4 h-4" />
              End Voice Session
            </button>
          )}
        </div>

        <p className="text-[11px] text-[#9A9FA8]">
          Ask: &quot;Which Hot leads should I call first today?&quot; or &quot;Roleplay a cold call objection for my Charlotte HVAC prospect.&quot;
        </p>

        {errorMsg && (
          <div className="rounded-xl bg-red-950/70 border border-red-700/60 p-2.5 text-[11px] text-red-200">
            {errorMsg}
          </div>
        )}
      </div>

      {/* LIVE TRANSCRIPT FEED */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
        {transcripts.length === 0 ? (
          <div className="text-center py-10 text-xs text-[#7A7E87]">
            {micActive
              ? 'Listening at 16kHz PCM... speak anytime.'
              : 'Live conversation transcripts appear here.'}
          </div>
        ) : (
          transcripts.map((line) => (
            <div
              key={line.id}
              className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                line.speaker === 'You'
                  ? 'bg-[#1D1F24] text-[#E5E7E2] ml-6'
                  : 'bg-[#C8B6FF] text-[#111214] mr-6'
              }`}
            >
              <div className="text-[10px] font-bold opacity-70 mb-0.5">{line.speaker}</div>
              <div>{line.text}</div>
            </div>
          ))
        )}
      </div>

      {/* TEXT NUDGE INPUT */}
      <div className="p-3.5 border-t border-[#26282E] flex items-center gap-2">
        <input
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendTextPrompt()}
          disabled={!connected}
          placeholder={connected ? 'Or type a prompt into live voice...' : 'Start voice session first'}
          className="flex-1 bg-[#1A1C20] border border-[#2C2F36] rounded-xl px-3 py-2 text-xs text-white placeholder-[#7A7E87]"
        />
        <button
          type="button"
          onClick={handleSendTextPrompt}
          disabled={!connected}
          className="p-2 rounded-xl bg-[#D9F154] text-[#111214] disabled:opacity-40 cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

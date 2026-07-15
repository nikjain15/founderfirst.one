import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  getActiveVoiceProfile,
  setVoiceSynthSettings,
  previewVoice,
  KOKORO_VOICES,
  type VoiceSynthSettings,
} from "../lib/supabase";
import { IconCheck, IconAlert, IconPlay } from "../lib/icons";

/**
 * Voice Studio — Penny's SPOKEN voice (the podcast/audio voice), fully tunable
 * without code. Reads the active voice profile's Kokoro settings and lets an
 * admin change tone (voice blend), pace (speed), pause, accent, warmth, and
 * quality. The renderer reads these live, so a save changes the next audio.
 */
export function VoiceStudio() {
  const qc = useQueryClient();
  const { data: profile, isPending } = useQuery({
    queryKey: ["voiceProfile"],
    queryFn: getActiveVoiceProfile,
  });

  const [s, setS] = useState<VoiceSynthSettings>({});
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seed local controls from the active profile once it loads.
  useEffect(() => {
    if (profile) {
      setS({
        voice_a: profile.voice_a,
        voice_b: profile.voice_b ?? "",
        blend: profile.blend,
        speed: profile.speed,
        gap_ms: profile.gap_ms,
        lang: profile.lang,
        bitrate: profile.bitrate,
        warmth: profile.warmth,
      });
    }
  }, [profile]);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const saveMut = useMutation({
    mutationFn: () => setVoiceSynthSettings({ ...s, voice_b: s.voice_b || null, engine: "kokoro" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["voiceProfile"] });
      setFlash("Saved. The next audio Penny renders will use these settings.");
      setError(null);
    },
    onError: (e) => { setError((e as Error).message); setFlash(null); },
  });

  const previewMut = useMutation({
    mutationFn: () => previewVoice({ ...s, voice_b: s.voice_b || null }),
    onSuccess: (url) => { setPreviewUrl(url); setError(null); },
    onError: (e) => { setError((e as Error).message); setPreviewUrl(null); },
  });

  if (isPending) return <div className="empty">Loading voice settings…</div>;
  if (!profile) return <div className="empty">No active voice profile.</div>;

  const dirty = profile && (
    s.voice_a !== profile.voice_a || (s.voice_b || "") !== (profile.voice_b ?? "") ||
    s.blend !== profile.blend || s.speed !== profile.speed || s.gap_ms !== profile.gap_ms ||
    s.lang !== profile.lang || s.bitrate !== profile.bitrate || s.warmth !== profile.warmth
  );

  const blendPct = Math.round((s.blend ?? 0.6) * 100);
  const card: React.CSSProperties = {
    border: "1px solid var(--line)", borderRadius: 12, padding: 20,
    background: "var(--white)", boxShadow: "var(--shadow-float)", marginBottom: 20,
  };
  const label: React.CSSProperties = {
    display: "block", fontSize: "var(--fs-eyebrow)", fontWeight: "var(--fw-semibold)",
    color: "var(--ink-3)", marginBottom: 6,
  };
  const field: React.CSSProperties = { display: "grid", gap: 6, marginBottom: 16 };
  const input: React.CSSProperties = {
    width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8,
    boxSizing: "border-box", fontSize: "max(16px, var(--fs-data-row))", background: "var(--white)",
  };

  return (
    <div style={card}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: "var(--fs-body)", fontWeight: "var(--fw-bold)" }}>Spoken voice (audio)</div>
        <div style={{ fontSize: "var(--fs-eyebrow)", color: "var(--ink-3)", marginTop: 4 }}>
          Penny's podcast/audio voice. Change tone and pace here — the next audio render uses it. No code, no redeploy.
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}><IconAlert size={16} /> <span>{error}</span></div>}
      {flash && <div className="alert alert-success" style={{ marginBottom: 12 }}><IconCheck size={16} /> <span>{flash}</span></div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
        {/* Tone — voice blend */}
        <div>
          <div style={field}>
            <label style={label}>Primary voice (tone)</label>
            <select style={input} value={s.voice_a ?? ""} onChange={(e) => setS({ ...s, voice_a: e.target.value })}>
              {KOKORO_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
          <div style={field}>
            <label style={label}>Blend with (optional)</label>
            <select style={input} value={s.voice_b ?? ""} onChange={(e) => setS({ ...s, voice_b: e.target.value })}>
              <option value="">— none (single voice) —</option>
              {KOKORO_VOICES.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
            </select>
          </div>
          {s.voice_b && (
            <div style={field}>
              <label style={label}>Blend ratio — {blendPct}% primary / {100 - blendPct}% blend</label>
              <input type="range" min={0} max={100} value={blendPct}
                onChange={(e) => setS({ ...s, blend: Number(e.target.value) / 100 })} />
            </div>
          )}
        </div>

        {/* Pace + delivery */}
        <div>
          <div style={field}>
            <label style={label}>Pace (speed) — {(s.speed ?? 0.88).toFixed(2)}×</label>
            <input type="range" min={70} max={130} value={Math.round((s.speed ?? 0.88) * 100)}
              onChange={(e) => setS({ ...s, speed: Number(e.target.value) / 100 })} />
            <div style={{ fontSize: "var(--fs-tiny)", color: "var(--ink-3)" }}>Lower = slower, calmer, more deliberate.</div>
          </div>
          <div style={field}>
            <label style={label}>Pause between sentences — {s.gap_ms ?? 260} ms</label>
            <input type="range" min={0} max={800} step={20} value={s.gap_ms ?? 260}
              onChange={(e) => setS({ ...s, gap_ms: Number(e.target.value) })} />
          </div>
          <div style={field}>
            <label style={label}>Accent</label>
            <select style={input} value={s.lang ?? "a"} onChange={(e) => setS({ ...s, lang: e.target.value as "a" | "b" })}>
              <option value="a">American</option>
              <option value="b">British</option>
            </select>
          </div>
        </div>

        {/* Quality + warmth */}
        <div>
          <div style={field}>
            <label style={label}>Warmth (low-shelf) — {(s.warmth ?? 0) > 0 ? "+" : ""}{s.warmth ?? 0} dB</label>
            <input type="range" min={-6} max={6} step={1} value={s.warmth ?? 0}
              onChange={(e) => setS({ ...s, warmth: Number(e.target.value) })} />
            <div style={{ fontSize: "var(--fs-tiny)", color: "var(--ink-3)" }}>Adds low-end warmth to the voice. 0 = off.</div>
          </div>
          <div style={field}>
            <label style={label}>Audio quality</label>
            <select style={input} value={s.bitrate ?? "160k"} onChange={(e) => setS({ ...s, bitrate: e.target.value })}>
              <option value="128k">Standard (128 kbps)</option>
              <option value="160k">High (160 kbps)</option>
              <option value="192k">Very high (192 kbps)</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
        <button className="btn" disabled={previewMut.isPending} onClick={() => previewMut.mutate()}>
          {previewMut.isPending ? (
            "Rendering…"
          ) : (
            <>
              <IconPlay size={12} /> Preview
            </>
          )}
        </button>
        <button className="btn primary" disabled={!dirty || saveMut.isPending} onClick={() => saveMut.mutate()}>
          {saveMut.isPending ? "Saving…" : "Save voice settings"}
        </button>
        {dirty && <span style={{ fontSize: "var(--fs-eyebrow)", color: "var(--warn)" }}>● Unsaved changes</span>}
        <span style={{ marginLeft: "auto", fontSize: "var(--fs-tiny)", color: "var(--ink-3)" }}>
          Engine: Kokoro (open) · default: Heart 60 / Nova 40, 0.88×
        </span>
      </div>
      {previewUrl && (
        <audio controls src={previewUrl} style={{ width: "100%", marginTop: 12 }} autoPlay>
          your browser does not support audio playback
        </audio>
      )}
    </div>
  );
}

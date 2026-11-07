// Voice metrics for a call: computed once from the recording and cached on the Conversation row.
import { prisma } from "../db";
import type { ConversationDto, MessageDto } from "../types";
import { decodeMp3 } from "./decode";
import { analyseVoice, AUDIO_METRICS_VERSION, type AudioMetrics } from "./prosody";
import { downloadAudio } from "./source";

export type AudioBundle = { metrics: AudioMetrics | null; bytes: Uint8Array | null; mimeType: string | null; error: string | null };

/**
 * Returns cached metrics, or downloads + decodes + analyses the recording.
 * `withBytes` also returns the raw audio (for multimodal LLM evaluation).
 * Never throws: chats (no audio) and failures yield metrics = null with an error message.
 */
export async function getAudioBundle(conversation: ConversationDto, messages: MessageDto[], withBytes = false): Promise<AudioBundle> {
  if (!conversation.audioUrl) return { metrics: null, bytes: null, mimeType: null, error: "no-audio" };
  try {
    const row = await prisma.conversation.findUnique({ where: { id: conversation.id }, select: { audioMetrics: true } });
    let cached: AudioMetrics | null = null;
    if (row?.audioMetrics) {
      try {
        const m = JSON.parse(row.audioMetrics) as AudioMetrics;
        if (m.version === AUDIO_METRICS_VERSION) cached = m;
      } catch {
        /* recompute */
      }
    }
    if (cached && !withBytes) return { metrics: cached, bytes: null, mimeType: null, error: null };

    const { bytes, mimeType } = await downloadAudio(conversation.id, conversation.audioUrl);
    let metrics = cached;
    if (!metrics) {
      const { channels, sampleRate } = await decodeMp3(bytes);
      metrics = analyseVoice(channels, sampleRate, messages);
      await prisma.conversation.update({ where: { id: conversation.id }, data: { audioMetrics: JSON.stringify(metrics) } });
    }
    return { metrics, bytes: withBytes ? bytes : null, mimeType, error: null };
  } catch (e) {
    return { metrics: null, bytes: null, mimeType: null, error: (e as Error).message };
  }
}

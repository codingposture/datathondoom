// Decodes MP3 recordings to PCM on the server (WASM, no native dependencies).
import { MPEGDecoder } from "mpg123-decoder";

export async function decodeMp3(bytes: Uint8Array): Promise<{ channels: Float32Array[]; sampleRate: number }> {
  const decoder = new MPEGDecoder();
  await decoder.ready;
  try {
    const out = decoder.decode(bytes);
    if (!out.samplesDecoded) throw new Error("The recording could not be decoded as MP3");
    return { channels: out.channelData, sampleRate: out.sampleRate };
  } finally {
    decoder.free();
  }
}

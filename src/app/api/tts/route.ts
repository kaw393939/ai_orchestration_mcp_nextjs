import { NextResponse } from "next/server";

// --- ElevenLabs (disabled — uncomment to re-enable as primary provider) ---
// const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
// const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? "NNl6r8mD7vthiJatiJt1";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { text } = body;

    if (!text) {
      return NextResponse.json(
        { error: "Text is required for audio generation." },
        { status: 400 },
      );
    }

    // --- OpenAI TTS (default) — streams response directly to client ---
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "No OPENAI_API_KEY configured. Add it to .env.local to enable TTS." },
        { status: 500 },
      );
    }

    const oaResponse = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text,
        voice: "alloy",
        response_format: "mp3",
      }),
    });

    if (!oaResponse.ok) {
      const oaError = await oaResponse.text();
      console.error("OpenAI TTS Error:", oaError);
      return NextResponse.json(
        { error: "OpenAI TTS failed to generate audio." },
        { status: 502 },
      );
    }

    // Stream the audio body directly to the client — no buffering
    const headers: HeadersInit = {
      "Content-Type": "audio/mpeg",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    };

    // Pass Content-Length through for client-side progress tracking
    const contentLength = oaResponse.headers.get("Content-Length");
    if (contentLength) {
      headers["Content-Length"] = contentLength;
    }

    return new NextResponse(oaResponse.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("TTS Route Error:", error);
    return NextResponse.json(
      { error: "Internal server error during audio generation." },
      { status: 500 },
    );
  }
}

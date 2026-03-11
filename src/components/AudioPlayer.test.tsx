// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { AudioPlayer } from "./AudioPlayer";
import React from "react";

describe("AudioPlayer", () => {
  let mockPlay: Mock;

  beforeEach(() => {
    vi.restoreAllMocks();

    mockPlay = vi.fn().mockResolvedValue(undefined);
    // Mock Audio
    class MockAudio {
      play = mockPlay;
      pause = vi.fn();
      currentTime = 0;
      duration = 100;
      addEventListener = vi.fn();
      removeEventListener = vi.fn();
    }
    vi.stubGlobal("Audio", MockAudio);

    // Mock URL
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn().mockReturnValue("blob:test"),
      revokeObjectURL: vi.fn(),
    });

    // Mock IntersectionObserver
    class MockIntersectionObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor(
        _cb: IntersectionObserverCallback,
        _opts?: IntersectionObserverInit,
      ) {}
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  it("auto-fetches and plays audio on mount", async () => {
    const mockReader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({
          done: false,
          value: new Uint8Array([1, 2, 3]),
        })
        .mockResolvedValueOnce({ done: true, value: undefined }),
    };

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ "Content-Length": "3" }),
        body: { getReader: () => mockReader },
      }),
    );

    render(<AudioPlayer title="Test Audio" text="Hello world" />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/tts", expect.any(Object));
      expect(mockPlay).toHaveBeenCalled();
    });
  });

  it("handles fetch errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Failed to stream audio" }),
      }),
    );

    render(<AudioPlayer title="Test Audio" text="Hello world" />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to stream audio/i)).toBeInTheDocument();
    });
  });

  it("shows estimated duration in subtitle while loading", () => {
    // Use a slow-resolving fetch to keep loading state active
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => {})),
    );

    render(<AudioPlayer title="Test Audio" text="Hello world this is a test of the audio player" />);

    expect(screen.getByText(/to generate/i)).toBeInTheDocument();
    expect(screen.getByText(/s audio/i)).toBeInTheDocument();
  });
});

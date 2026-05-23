import { useEffect, useRef, useState } from "react";

interface AudioPlayerProps {
  blob: Blob | null;
  isPlaying: boolean;
  onPlayingChange: (playing: boolean) => void;
  onEnded?: () => void;
}

export function AudioPlayer({
  blob,
  isPlaying,
  onPlayingChange,
  onEnded,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");

  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  useEffect(() => {
    if (!audioRef.current || !audioUrl) return;
    if (isPlaying) {
      audioRef.current.play();
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, audioUrl]);

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      audioRef.current.play();
      onPlayingChange(true);
    } else {
      audioRef.current.pause();
      onPlayingChange(false);
    }
  };

  const handleEnded = () => {
    onPlayingChange(false);
    onEnded?.();
  };

  return (
    <>
      <audio
        ref={audioRef}
        src={audioUrl}
        onPlay={() => onPlayingChange(true)}
        onPause={() => onPlayingChange(false)}
        onEnded={handleEnded}
        crossOrigin="anonymous"
      />
      <button
        onClick={handlePlayPause}
        disabled={!audioUrl}
        className="text-lg text-gray-400 hover:text-indigo-600 disabled:opacity-50 p-1"
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? "⏸️" : "▶️"}
      </button>
    </>
  );
}

import { api } from "./client";
import type {
  AudioToken, BatchAnswerItem, BatchQuestion, BatchResult,
  Exercise, UserSession,
} from "../types";

export const getExercise = (trackId: number, type = "fill_blank") =>
  api.get<Exercise>(`/api/tracks/${trackId}/exercise?type=${type}`).then((r) => r.data);

export const getAudioToken = (trackId: number) =>
  api.get<AudioToken>(`/api/tracks/${trackId}/audio-token`).then((r) => r.data);

export const startSession = (
  exerciseId: number,
  lockFromSeq?: number,
  lockToSeq?: number
) =>
  api
    .post<UserSession>("/api/sessions", {
      exercise_id: exerciseId,
      lock_from_seq: lockFromSeq ?? null,
      lock_to_seq: lockToSeq ?? null,
    })
    .then((r) => r.data);

export const getSessionQuestions = (sessionId: number) =>
  api.get<BatchQuestion[]>(`/api/sessions/${sessionId}/questions`).then((r) => r.data);

export const submitBatchAnswers = (sessionId: number, answers: BatchAnswerItem[]) =>
  api
    .post<BatchResult>(`/api/sessions/${sessionId}/answers/batch`, { answers })
    .then((r) => r.data);

export const completeSession = (sessionId: number) =>
  api.post(`/api/sessions/${sessionId}/complete`).then((r) => r.data);

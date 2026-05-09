import { api } from "./client";
import type {
  AnswerResult, AudioToken, BatchAnswerItem, BatchQuestion, BatchResult,
  Exercise, Question, UserSession,
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

export const getCurrentQuestion = (sessionId: number) =>
  api.get<Question>(`/api/sessions/${sessionId}/question`).then((r) => r.data);

export const getSessionQuestions = (sessionId: number) =>
  api.get<BatchQuestion[]>(`/api/sessions/${sessionId}/questions`).then((r) => r.data);

export const submitAnswer = (
  sessionId: number,
  questionId: number,
  userInput: string,
  blankAnswers?: string[]
) =>
  api
    .post<AnswerResult>(`/api/sessions/${sessionId}/answer`, {
      question_id: questionId,
      user_input: userInput,
      blank_answers: blankAnswers ?? null,
    })
    .then((r) => r.data);

export const submitBatchAnswers = (sessionId: number, answers: BatchAnswerItem[]) =>
  api
    .post<BatchResult>(`/api/sessions/${sessionId}/answers/batch`, { answers })
    .then((r) => r.data);

export const completeSession = (sessionId: number) =>
  api.post(`/api/sessions/${sessionId}/complete`).then((r) => r.data);

export const nextQuestion = (sessionId: number) =>
  api
    .post<{ completed: boolean; question?: Question }>(`/api/sessions/${sessionId}/next`)
    .then((r) => r.data);

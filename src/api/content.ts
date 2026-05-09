import { api } from "./client";
import type { Category, Segment, Track } from "../types";

interface CategoryWithTracks extends Category { tracks: Track[] }

export const getCategories = () =>
  api.get<Category[]>("/api/categories").then((r) => r.data);

export const getCategoryBySlug = (slug: string) =>
  api.get<CategoryWithTracks>(`/api/categories/${slug}`).then((r) => r.data);

export const getTrack = (id: number) =>
  api.get<Track & { segments: Segment[] }>(`/api/tracks/${id}`).then((r) => r.data);

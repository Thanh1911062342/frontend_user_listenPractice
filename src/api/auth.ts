import { api } from "./client";

interface Token { access_token: string; token_type: string }

export const login = (username: string, password: string) =>
  api.post<Token>("/api/auth/login", { username, password }).then((r) => r.data);

export const register = (username: string, password: string, email?: string) =>
  api.post<Token>("/api/auth/register", { username, password, email }).then((r) => r.data);

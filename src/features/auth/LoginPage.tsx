import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { login, register } from "../../api/auth";

type Mode = "login" | "register";

export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const save = (token: string) => {
    localStorage.setItem("user_token", token);
    navigate("/");
  };

  const mut = useMutation({
    mutationFn: () =>
      mode === "login"
        ? login(username, password)
        : register(username, password, email || undefined),
    onSuccess: (d) => save(d.access_token),
    onError: (e: any) =>
      setError(e.response?.data?.detail ?? "Something went wrong"),
  });

  return (
    /* On desktop: center within the dark page */
    <div className="min-h-screen md:flex md:items-start md:justify-center md:py-8">
      <div className="
        w-full bg-white flex flex-col min-h-screen justify-center px-8
        md:w-[390px] md:min-h-[844px] md:rounded-[44px]
        md:shadow-[0_0_80px_rgba(0,0,0,0.7)] md:overflow-hidden
      ">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900">聴く練習</h1>
          <p className="text-gray-400 text-sm mt-1">Listening Practice</p>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          {(["login", "register"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(""); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === m ? "bg-white shadow text-gray-800" : "text-gray-400"
              }`}
            >
              {m === "login" ? "Login" : "Register"}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); setError(""); mut.mutate(); }}
          className="space-y-4"
        >
          {error && (
            <p className="text-red-500 text-sm bg-red-50 rounded-xl p-3">{error}</p>
          )}
          <input
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className={inp}
          />
          {mode === "register" && (
            <input
              placeholder="Email (optional)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inp}
            />
          )}
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={inp}
          />
          <button
            type="submit"
            disabled={mut.isPending}
            className="w-full bg-indigo-600 text-white rounded-2xl py-3.5 font-semibold text-base hover:bg-indigo-700 disabled:opacity-50 mt-2"
          >
            {mut.isPending ? "..." : mode === "login" ? "Login" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

const inp =
  "w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-base outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-gray-50";

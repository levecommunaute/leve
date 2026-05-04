import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_BASE = "http://localhost:3000";

const AUTH_KEY = "@leve/auth_token";

export async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(AUTH_KEY);
}

export async function setAuthToken(token: string | null): Promise<void> {
  if (token) {
    await AsyncStorage.setItem(AUTH_KEY, token);
  } else {
    await AsyncStorage.removeItem(AUTH_KEY);
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const { json, headers: hdrs, ...rest } = init ?? {};
  const headers = new Headers(hdrs);
  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const token = await getAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data as T;
}

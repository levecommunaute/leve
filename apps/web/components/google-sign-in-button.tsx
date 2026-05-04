"use client";

import { signInWithGoogle } from "../lib/auth";

export function GoogleSignInButton(): React.JSX.Element {
  return (
    <button
      type="button"
      className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
      onClick={() => {
        void signInWithGoogle();
      }}
    >
      Se connecter avec Google
    </button>
  );
}

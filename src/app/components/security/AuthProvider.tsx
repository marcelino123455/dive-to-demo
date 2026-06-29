"use client";

import { AuthProvider as OIDCAuthProvider } from "react-oidc-context";
import type { ReactNode } from "react";

const cognitoAuthConfig = {
  authority: process.env.NEXT_PUBLIC_COGNITO_AUTHORITY!,
  client_id: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!,
  redirect_uri: process.env.NEXT_PUBLIC_COGNITO_REDIRECT_URI!,
  response_type: "code",
  scope: process.env.NEXT_PUBLIC_COGNITO_SCOPE || "phone openid email",
};

export default function AuthProvider({ children }: { children: ReactNode }) {
  return <OIDCAuthProvider {...cognitoAuthConfig}>{children}</OIDCAuthProvider>;
}

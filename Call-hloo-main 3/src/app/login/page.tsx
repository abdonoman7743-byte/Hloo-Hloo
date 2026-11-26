"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { MobileAuthPage } from "@/components/MobileAuthPage";
import type { PublicUser } from "@/types/oboud";

export default function LoginPage() {
  const router = useRouter();

  const handleAuthenticated = (
    _user: PublicUser,
    _token: string,
    _rememberDevice: boolean
  ) => {
    // The authentication API stores the session in an HttpOnly cookie.
    router.push("/");
  };

  return (
    <MobileAuthPage
      demoUsers={[]}
      onAuthenticated={handleAuthenticated}
    />
  );
}

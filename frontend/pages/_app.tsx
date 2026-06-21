import React from "react";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import Navbar from "../components/Navbar";
import "../styles/globals.css";

function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isLoginPage = router.pathname === "/login" || router.pathname === "/";

  return (
    <>
      {!isLoginPage && <Navbar />}
      <Component {...pageProps} />
    </>
  );
}

export default App;

import type { AppProps } from "next/app";
import "../styles/globals.css";
import AppShell from "../components/AppShell";

export default function App({ Component, pageProps, router }: AppProps) {
  if (router.pathname === "/") {
    return <Component {...pageProps} />;
  }

  return (
    <AppShell>
      <Component {...pageProps} />
    </AppShell>
  );
}

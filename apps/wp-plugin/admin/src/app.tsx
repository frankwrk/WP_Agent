import { ConnectPage } from "./pages/Connect";
import { ChatPage } from "./pages/Chat";

export function App() {
  const initial = window.WP_AGENT_ADMIN_CONFIG?.initialPage ?? "connect";
  if (initial === "chat") {
    return <ChatPage />;
  }

  return <ConnectPage />;
}

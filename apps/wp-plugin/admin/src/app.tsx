import { ConnectPage } from "./pages/Connect";
import { ChatPage } from "./pages/Chat";
import { SkillsPage } from "./pages/Skills";

export function App() {
  const initial = window.WP_AGENT_ADMIN_CONFIG?.initialPage ?? "connect";
  if (initial === "skills") {
    return <SkillsPage />;
  }

  if (initial === "chat") {
    return <ChatPage />;
  }

  return <ConnectPage />;
}

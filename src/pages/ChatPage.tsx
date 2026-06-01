import { useLocation } from 'react-router-dom';
import GradientBackground from '../components/GradientBackground/GradientBackground';
import AIChatPanel from '../components/AI/AIChatPanel';

export default function ChatPage() {
  const location = useLocation();
  const initialMessage =
    (location.state as { initialMessage?: string } | null)?.initialMessage;

  return (
    <>
      <GradientBackground />
      <main className="relative z-10 pt-28 pb-10 px-4 md:px-6 max-w-[1600px] mx-auto w-full h-screen flex flex-col md:flex-row gap-4 md:gap-6">
        <AIChatPanel initialMessage={initialMessage} />
      </main>
    </>
  );
}

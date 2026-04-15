export default function GradientBackground() {
  return (
    <>
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] bg-accent-purple/10 blur-[120px] rounded-full pointer-events-none z-0"></div>
      <div className="fixed bottom-[-20%] right-[-10%] w-[40%] h-[60%] bg-primary/5 blur-[100px] rounded-full pointer-events-none z-0"></div>
    </>
  );
}

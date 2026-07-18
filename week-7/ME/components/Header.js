function Header() {
  return (
    <header className="sticky top-0 z-20 backdrop-blur-md bg-[#faf7f2]/70 border-b border-stone-200/60">
      <div className="max-w-6xl mx-auto px-6 md:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#d97757] flex items-center justify-center text-white font-bold">C</div>
          <span className="font-semibold text-lg tracking-tight">Claude</span>
        </div>
        <nav className="hidden sm:flex items-center gap-8 text-sm text-stone-600">
          <a href="#features" className="hover:text-stone-900 transition-colors">할 수 있는 일</a>
          <a href="#models" className="hover:text-stone-900 transition-colors">모델 패밀리</a>
          <a href="#values" className="hover:text-stone-900 transition-colors">철학</a>
        </nav>
        <Button size="sm">시작하기</Button>
      </div>
    </header>
  );
}

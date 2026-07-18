function Footer() {
  return (
    <footer className="border-t border-stone-200/70 mt-8">
      <div className="max-w-6xl mx-auto px-6 md:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-stone-500">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-[#d97757] flex items-center justify-center text-white text-xs font-bold">C</div>
          <span>Claude — Anthropic이 만든 AI 어시스턴트</span>
        </div>
        <p>소개용으로 제작한 비공식 페이지입니다.</p>
      </div>
    </footer>
  );
}

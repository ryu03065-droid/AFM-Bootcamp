function CTA() {
  return (
    <Section className="pb-24 max-w-6xl mx-auto">
      <div className="rounded-3xl bg-gradient-to-br from-[#d97757] to-[#b45f43] px-8 py-16 md:py-20 text-center text-white shadow-xl">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">이제, Claude와 함께 시작해 보세요</h2>
        <p className="mt-4 text-lg text-white/90 max-w-2xl mx-auto leading-relaxed">
          오늘의 질문 하나부터 복잡한 프로젝트까지. Claude가 당신 곁에서 함께 생각합니다.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button className="px-8 py-3.5 rounded-full bg-white text-[#b45f43] font-medium text-lg hover:bg-stone-100 transition-colors shadow-sm">대화 시작하기</button>
          <button className="px-8 py-3.5 rounded-full bg-white/15 border border-white/40 text-white font-medium text-lg hover:bg-white/25 transition-colors">더 알아보기</button>
        </div>
      </div>
    </Section>
  );
}

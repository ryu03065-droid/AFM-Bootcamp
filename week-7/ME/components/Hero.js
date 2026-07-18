function Hero() {
  return (
    <Section className="grain-bg pt-20 pb-24 md:pt-28 md:pb-32">
      <div className="max-w-4xl mx-auto text-center float-in">
        <Badge>Anthropic이 만든 AI 어시스턴트</Badge>
        <h1 className="mt-6 text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-stone-900 leading-[1.1]">
          생각을 함께 정리하는<br className="hidden sm:block" />
          당신의 AI 파트너, <span className="text-[#d97757]">Claude</span>
        </h1>
        <p className="mt-6 text-lg md:text-xl text-stone-600 leading-relaxed max-w-2xl mx-auto">
          Claude는 대화, 글쓰기, 코딩, 리서치, 분석, 창작까지 폭넓게 돕는
          범용 AI 어시스턴트입니다. 안전하고 정직하며 도움이 되는 방식으로,
          복잡한 일을 더 쉽게 만들어 줍니다.
        </p>
        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button size="lg">Claude와 대화 시작하기</Button>
          <Button variant="ghost" size="lg">Claude Code 살펴보기</Button>
        </div>
        <p className="mt-6 text-sm text-stone-500">웹 · 데스크톱 · 모바일 앱 · API · CLI 등 다양한 형태로 제공됩니다.</p>
      </div>
    </Section>
  );
}

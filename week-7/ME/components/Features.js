function Features() {
  const items = [
    { icon: "💬", title: "자연스러운 대화", desc: "복잡한 주제도 맥락을 이해하며 사람과 이야기하듯 깊이 있는 대화를 나눕니다." },
    { icon: "✍️", title: "글쓰기 & 편집", desc: "이메일, 보고서, 기획안, 카피까지. 목적과 톤에 맞춰 초안을 쓰고 다듬어 줍니다." },
    { icon: "💻", title: "코딩 & 디버깅", desc: "코드 작성, 리뷰, 버그 수정을 돕고, CLI 도구인 Claude Code로 실제 작업까지 함께합니다." },
    { icon: "🔎", title: "리서치 & 분석", desc: "긴 문서를 요약하고 데이터를 해석하며, 핵심을 뽑아 의사결정을 돕습니다." },
    { icon: "🎨", title: "아이디어 & 창작", desc: "브레인스토밍, 스토리텔링, 콘텐츠 기획 등 창의적인 작업의 든든한 파트너가 됩니다." },
    { icon: "🧩", title: "다양한 연동", desc: "웹·앱은 물론 API로 서비스에 직접 연결해 나만의 워크플로우에 녹여낼 수 있습니다." },
  ];
  return (
    <Section id="features" className="py-20 md:py-28 max-w-6xl mx-auto">
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-stone-900">Claude가 도와주는 일</h2>
        <p className="mt-4 text-lg text-stone-600">하나의 어시스턴트로 다양한 일을 매끄럽게 이어서 해낼 수 있습니다.</p>
      </div>
      <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((it, i) => (
          <Card key={i} className="p-6">
            <div className="w-11 h-11 rounded-xl bg-[#d97757]/10 flex items-center justify-center text-2xl">{it.icon}</div>
            <h3 className="mt-4 text-lg font-semibold text-stone-900">{it.title}</h3>
            <p className="mt-2 text-stone-600 leading-relaxed">{it.desc}</p>
          </Card>
        ))}
      </div>
    </Section>
  );
}

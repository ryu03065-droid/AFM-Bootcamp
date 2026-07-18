function Values() {
  const values = [
    { title: "정직함 (Honest)", desc: "모르는 것은 모른다고 말하고, 사실에 근거해 신뢰할 수 있게 답합니다." },
    { title: "도움이 됨 (Helpful)", desc: "사용자의 진짜 의도를 이해하고, 실제로 문제 해결에 도움이 되는 방향으로 돕습니다." },
    { title: "무해함 (Harmless)", desc: "해로울 수 있는 요청은 신중히 다루며, 안전을 우선하는 방식으로 응답합니다." },
  ];
  return (
    <Section id="values" className="py-20 md:py-28 max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div>
          <Badge>설계 철학</Badge>
          <h2 className="mt-5 text-3xl md:text-4xl font-bold tracking-tight text-stone-900 leading-tight">
            강력함보다 먼저,<br />믿을 수 있어야 합니다
          </h2>
          <p className="mt-5 text-lg text-stone-600 leading-relaxed">
            Anthropic은 AI가 안전하고 신뢰할 수 있어야 한다는 믿음으로 Claude를 만듭니다.
            Constitutional AI라는 접근을 통해, Claude는 명시된 원칙에 따라 스스로의 답을
            점검하며 학습합니다. 그 중심에는 세 가지 원칙이 있습니다.
          </p>
        </div>
        <div className="space-y-4">
          {values.map((v, i) => (
            <Card key={i} className="p-6 flex gap-4">
              <div className="mt-1 shrink-0 w-8 h-8 rounded-full bg-[#d97757]/10 text-[#b45f43] flex items-center justify-center font-bold text-sm">{i + 1}</div>
              <div>
                <h3 className="text-lg font-semibold text-stone-900">{v.title}</h3>
                <p className="mt-1 text-stone-600 leading-relaxed">{v.desc}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Section>
  );
}

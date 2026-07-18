const { useState } = React;

function Models() {
  const [active, setActive] = useState(1);
  const models = [
    { name: "Haiku", tag: "빠르고 가벼움", desc: "가볍고 즉각적인 응답에 최적화. 빠른 속도와 효율이 필요한 작업에 잘 맞습니다.", meter: 55 },
    { name: "Sonnet", tag: "균형 잡힌 만능", desc: "성능과 속도의 균형이 뛰어나 일상적인 대부분의 작업에 두루 활용하기 좋습니다.", meter: 80 },
    { name: "Opus", tag: "최고 성능", desc: "가장 복잡하고 깊은 추론이 필요한 작업을 위한, 가장 강력한 최상위 모델입니다.", meter: 100 },
  ];
  return (
    <Section id="models" className="py-20 md:py-28 bg-white/50 border-y border-stone-200/60">
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-stone-900">하나의 이름, 세 가지 성격</h2>
          <p className="mt-4 text-lg text-stone-600">
            Claude는 목적에 맞게 고를 수 있는 모델 패밀리로 제공됩니다. 속도가 중요할 때, 균형이 필요할 때, 최고 성능이 필요할 때.
          </p>
        </div>
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5">
          {models.map((m, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`text-left rounded-2xl p-6 border transition-all duration-300 ${
                active === i
                  ? "bg-[#d97757] border-[#d97757] text-white shadow-lg -translate-y-1"
                  : "bg-white/80 border-stone-200 hover:border-stone-300 text-stone-800"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold">Claude {m.name}</span>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${active === i ? "bg-white/20" : "bg-stone-100 text-stone-600"}`}>{m.tag}</span>
              </div>
              <p className={`mt-3 leading-relaxed ${active === i ? "text-white/90" : "text-stone-600"}`}>{m.desc}</p>
              <div className={`mt-5 h-2 rounded-full overflow-hidden ${active === i ? "bg-white/25" : "bg-stone-100"}`}>
                <div className={`h-full rounded-full ${active === i ? "bg-white" : "bg-[#d97757]"}`} style={{ width: m.meter + "%" }} />
              </div>
              <p className={`mt-2 text-xs ${active === i ? "text-white/80" : "text-stone-400"}`}>상대적 성능 · 규모</p>
            </button>
          ))}
        </div>
      </div>
    </Section>
  );
}

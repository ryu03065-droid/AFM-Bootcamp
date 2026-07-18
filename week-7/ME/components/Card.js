function Card({ className = "", children }) {
  return (
    <div className={`bg-white/80 backdrop-blur-sm rounded-2xl border border-stone-200/80 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 ${className}`}>
      {children}
    </div>
  );
}

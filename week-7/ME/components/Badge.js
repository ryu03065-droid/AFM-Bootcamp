function Badge({ children, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium px-3.5 py-1.5 rounded-full bg-[#d97757]/10 text-[#b45f43] border border-[#d97757]/20 ${className}`}>
      {children}
    </span>
  );
}

function Button({ variant = "primary", size = "md", className = "", children, ...props }) {
  const base = "inline-flex items-center justify-center font-medium rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-400/60";
  const variants = {
    primary: "bg-[#d97757] text-white hover:bg-[#c86544] shadow-sm hover:shadow-md",
    ghost: "bg-transparent text-stone-700 border border-stone-300 hover:border-stone-400 hover:bg-white/60",
  };
  const sizes = { sm: "text-sm px-4 py-2", md: "text-base px-6 py-3", lg: "text-lg px-8 py-3.5" };
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}

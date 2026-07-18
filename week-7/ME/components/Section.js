function Section({ id, className = "", children }) {
  return <section id={id} className={`px-6 md:px-8 ${className}`}>{children}</section>;
}

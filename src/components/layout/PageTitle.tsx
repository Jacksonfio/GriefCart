interface PageTitleProps {
  title: string;
  subtitle?: string;
  accent?: 'red' | 'gold';
}

export function PageTitle({ title, subtitle, accent = 'red' }: PageTitleProps) {
  const gradientClass = accent === 'gold' ? 'text-purple-400' : 'text-purple-400';
  return (
    <div className="mb-6">
      <h1 className={`text-3xl font-bold tracking-tight sm:text-4xl ${gradientClass} drop-shadow-[0_0_12px_rgba(209,109,58,0.12)]`}>
        {title}
      </h1>
      {subtitle && (
        <p className="mt-1.5 text-sm text-text-secondary/70 font-normal tracking-wide">{subtitle}</p>
      )}
    </div>
  );
}

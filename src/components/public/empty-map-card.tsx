import { Globe2 } from 'lucide-react';

export function EmptyMapCard() {
  return (
    <div className="atlas-hud-glass-strong pointer-events-auto absolute top-1/2 left-1/2 z-10 w-[calc(100%-2rem)] max-w-[356px] -translate-x-1/2 -translate-y-1/2 rounded-3xl px-6 py-7 text-center md:px-8 md:py-9">
      <div className="relative mx-auto size-16 md:size-18" aria-hidden="true">
        <span className="absolute -inset-5 rounded-full bg-[radial-gradient(circle,rgba(229,154,60,0.22),transparent_68%)]" />
        <span className="absolute -inset-2.5 rounded-full border border-dashed border-white/16" />
        <span className="relative grid size-full place-items-center rounded-full border border-[#e59a3c]/35 bg-[#e59a3c]/10 text-[#e59a3c]">
          <Globe2 size={32} strokeWidth={1.35} />
        </span>
        <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-[#e59a3c] shadow-[0_0_10px_rgba(229,154,60,0.8)] ring-2 ring-[#161922]" />
      </div>
      <h2 className="mt-5 text-base font-semibold tracking-tight text-[#f8f8f6] md:text-lg">
        世界很大，足迹即将点亮
      </h2>
      <p className="mt-2.5 text-sm leading-relaxed text-[#a6acb9]">
        旅程的故事正在准备，
        <br />
        走过的地方会在地图上显现。
      </p>
    </div>
  );
}

interface HeaderProps {
  onTitleClick: () => void;
}

export default function Header({ onTitleClick }: HeaderProps) {
  return (
    <div className="pr-4">
      <button
        onClick={onTitleClick}
        className="flex items-center hover:opacity-80 transition-opacity"
      >
        {/* White wordmark — only legible on the dark sidebar/top-bar surface */}
        <img
          src="/logo-white.png"
          alt="SkillSpell"
          className="h-9 w-auto"
        />
      </button>
    </div>
  );
}

import React from 'react';
import Image from 'next/image';

interface MemeResolverProps {
  memeId: 'clown' | 'harold' | 'fine_dog' | 'drake_no' | 'drake_yes' | 'doge' | 'burn';
  className?: string;
}

const MEME_MAP: Record<string, string> = {
  clown: '/memes/clown.png',
  harold: '/memes/harold.png',
  fine_dog: '/memes/fine_dog.png',
  drake_no: '/memes/drake_no.png',
  drake_yes: '/memes/drake_yes.png',
  doge: '/memes/doge.png',
  burn: '/memes/burn.png',
};

const MEME_NAMES: Record<string, string> = {
  clown: 'Clown Face',
  harold: 'Hide the Pain Harold',
  fine_dog: 'This is Fine Dog',
  drake_no: 'Drake Dislikes',
  drake_yes: 'Drake Likes',
  doge: 'Much Doge',
  burn: 'Disaster Burn',
};

export const MemeResolver: React.FC<MemeResolverProps> = ({ memeId, className = '' }) => {
  const src = MEME_MAP[memeId];
  const name = MEME_NAMES[memeId] || 'Meme';

  if (!src) return null;

  return (
    <div 
      className={`relative overflow-hidden rounded-xl border border-violet-500/20 bg-black/40 p-1 shadow-lg shadow-black/50 transition-all duration-300 hover:scale-105 hover:border-violet-500/40 ${className}`}
      style={{ animation: 'pop-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' }}
    >
      <div className="relative aspect-video w-full" style={{ minWidth: '160px', height: '110px' }}>
        <Image
          src={src}
          alt={name}
          fill
          sizes="160px"
          className="object-cover rounded-lg"
          priority
        />
      </div>
      <div className="mt-1 px-1.5 py-0.5 text-center">
        <span className="text-[10px] font-medium tracking-wider text-violet-400 uppercase">
          {name}
        </span>
      </div>
    </div>
  );
};

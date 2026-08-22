import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { JournalArticle } from '../../types';

interface ArticleCardProps {
  article: JournalArticle;
  onOpen: () => void;
}

export const ArticleCard: React.FC<ArticleCardProps> = ({ article, onOpen }) => {
  const [expanded, setExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = descRef.current;
    if (el) {
      setIsTruncated(el.scrollHeight > el.clientHeight + 1);
    }
  }, [article.excerpt]);

  return (
    <div
      onClick={onOpen}
      className="group cursor-pointer bg-white border border-[#E8D5A8] rounded-[20px] overflow-hidden shadow-[0_4px_16px_rgba(11,11,11,0.04)] hover:border-[#C9972B] hover:shadow-[0_10px_30px_rgba(11,11,11,0.08)] transition-all duration-300 flex flex-col p-[26px]"
    >
      <div className="w-full aspect-[4/3] overflow-hidden rounded-[16px] shrink-0">
        <img
          src={article.image}
          alt={article.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
          loading="lazy"
        />
      </div>

      <div className="pt-4 flex flex-col flex-1">
        <h3 className="font-serif text-lg text-[#121212] group-hover:text-[#C9972B] transition-colors leading-snug">
          {article.title}
        </h3>

        <p
          ref={descRef}
          className={`mt-2 text-xs text-[#6B6B6B] leading-relaxed ${expanded ? '' : 'line-clamp-2 sm:line-clamp-3'}`}
        >
          {article.excerpt}
        </p>

        {isTruncated && (
          <div className="flex justify-end mt-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((prev) => !prev);
              }}
              className="text-[10px] font-bold uppercase tracking-wider text-[#C9972B] hover:text-[#F05A7E] transition-colors cursor-pointer"
            >
              {expanded ? 'View Less' : 'View More'}
            </button>
          </div>
        )}

        <div className="mt-auto pt-5 flex items-center justify-between border-t border-[#E8D5A8] mt-5">
          <span className="text-xs text-[#6B6B6B]">{article.date}</span>
          <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#F05A7E] group-hover:gap-1.5 transition-all">
            Open
            <ArrowUpRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
};

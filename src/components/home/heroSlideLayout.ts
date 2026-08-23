import { CMSHeroHPosition, CMSHeroLayout } from '../../types';

/** Fully-resolved layout config — every field has a concrete value, defaults applied. */
export interface ResolvedHeroLayout {
  outerImagePosition: CMSHeroHPosition;
  textPosition: CMSHeroHPosition;
}

const DEFAULTS: ResolvedHeroLayout = {
  outerImagePosition: 'right',
  textPosition: 'left',
};

export const HPOSITION_OPTIONS: { value: CMSHeroHPosition; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

export function resolveHeroLayout(partial?: Partial<CMSHeroLayout> | null): ResolvedHeroLayout {
  return {
    outerImagePosition: partial?.outerImagePosition || DEFAULTS.outerImagePosition,
    textPosition: partial?.textPosition || DEFAULTS.textPosition,
  };
}

/** Row direction for the [content, outer image] pair. 'center' stacks instead — handled by the caller. */
export function heroRowOrderClass(outerImagePosition: CMSHeroHPosition): string {
  return outerImagePosition === 'left' ? 'lg:flex-row-reverse' : 'lg:flex-row';
}

export function heroTextAlignClasses(pos: CMSHeroHPosition): { text: string; items: string; justify: string } {
  if (pos === 'center') return { text: 'text-center', items: 'items-center', justify: 'justify-center' };
  if (pos === 'right') return { text: 'text-right', items: 'items-end', justify: 'justify-end' };
  return { text: 'text-left', items: 'items-start', justify: 'justify-start' };
}
